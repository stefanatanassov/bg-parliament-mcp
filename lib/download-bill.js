/**
 * Download bill files (PDF/RTF) from parliament.bg using Playwright for cookies,
 * then extract text via Python extraction script.
 */
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PY_SCRIPT = join(__dirname, "extract-text.py");
const BASE_URL = "https://www.parliament.bg";

/**
 * Get session cookies from parliament.bg homepage.
 */
async function getCookies() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(BASE_URL + "/bg", { waitUntil: "domcontentloaded", timeout: 15000 });
    const cookies = await page.context().cookies();
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await browser.close();
  }
}

/**
 * Download a bill file (PDF or RTF) from the parliament website.
 * Uses the URL pattern discovered: /bills/{assembly}/{filename}
 */
async function downloadFile(filename, assembly, cookieHeader) {
  const url = `${BASE_URL}/bills/${assembly}/${filename}`;
  const response = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
      "User-Agent": "bg-parliament-mcp/1.0",
      Accept: "application/pdf, application/rtf, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Extract text from downloaded file using Python extraction script.
 */
function extractText(filepath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [PY_SCRIPT, filepath], {
      timeout: 30000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python extraction failed (code ${code}): ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Invalid JSON from extraction: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on("error", reject);
  });
}

/**
 * Main entry point: download a bill's file(s) and extract text.
 *
 * @param {object} billData - bill metadata from the API (must have file_list and A_ns_folder)
 * @returns {{ success: boolean, text?: string, format?: string, error?: string }}
 */
export async function getBillText(billData) {
  const files = billData.file_list;
  if (!files || files.length === 0) {
    return { success: false, error: "No file attachments found for this bill" };
  }

  const assembly = billData.A_ns_folder || "52";
  let lastError = null;
  const tmpDir = mkdtempSync(join(os.tmpdir(), "bgparl-"));

  try {
    // Get fresh cookies
    const cookieHeader = await getCookies();

    // Try each file until we get one with extractable text
    for (const file of files) {
      const filename = file.FILENAME;
      const ext = filename.split(".").pop().toLowerCase();

      if (!["pdf", "rtf"].includes(ext)) continue;

      try {
        // Download
        const data = await downloadFile(filename, assembly, cookieHeader);
        const filepath = join(tmpDir, filename);
        writeFileSync(filepath, data);

        // Extract text
        const result = await extractText(filepath);

        // Clean up file
        if (existsSync(filepath)) unlinkSync(filepath);

        if (result.success && result.text && result.text.length > 50) {
          return {
            success: true,
            text: result.text,
            format: result.format || ext,
            pages: result.pages,
          };
        }

        if (!result.success) {
          lastError = result.error || `No text extracted from ${ext} file`;
        }
      } catch (fileErr) {
        lastError = fileErr.message;
        // Try next file
      }
    }

    return {
      success: false,
      error: lastError || "Could not extract text from any attached files",
    };
  } finally {
    // Cleanup temp dir
    try {
      if (existsSync(tmpDir)) rmdirSync(tmpDir);
    } catch {
      // ignore cleanup errors
    }
  }
}
