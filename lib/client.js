/**
 * ParliamentClient — read-only HTTP abstraction over the Bulgarian Parliament REST API.
 *
 * All calls are GET or POST (for search endpoints that require form-encoded filters).
 * Responses are normalized: HTTP errors become structured error objects; empty
 * results are returned as empty arrays.
 *
 * Configuration via environment variables:
 *   PARLIAMENT_BASE_URL  — default https://www.parliament.bg
 *   PARLIAMENT_TIMEOUT_MS — default 30000
 *   PARLIAMENT_RETRIES    — default 2
 */

const BASE_URL = process.env.PARLIAMENT_BASE_URL || "https://www.parliament.bg";
const TIMEOUT_MS = parseInt(process.env.PARLIAMENT_TIMEOUT_MS || "30000", 10);
const MAX_RETRIES = parseInt(process.env.PARLIAMENT_RETRIES || "2", 10);

/**
 * Small delay helper for retry backoff.
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build a URL by concatenating the base URL and path.
 */
function url(path) {
  return `${BASE_URL}${path}`;
}

/**
 * Build the canonical web URL for a resource (not the API endpoint, but the
 * human-readable page on parliament.bg).
 */
function canonicalUrl(type, id) {
  return `${BASE_URL}/bg/${type}/${id}`;
}

/**
 * Create an AbortController with the configured timeout.
 */
function controller() {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error("upstream_timeout")), TIMEOUT_MS);
  return ctrl;
}

/**
 * Structured error returned for any upstream failure.
 */
class ParliamentApiError extends Error {
  constructor(message, { status, path, body } = {}) {
    super(message);
    this.name = "ParliamentApiError";
    this.type = "upstream_http_error";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

/**
 * Core fetch wrapper with retries.
 */
async function request(method, path, opts = {}) {
  const { body, formData, headers: extraHeaders = {} } = opts;
  const fullUrl = url(path);
  const headers = { ...extraHeaders };

  if (formData) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (body) {
    headers["Content-Type"] = "application/json";
  }

  const fetchOpts = {
    method,
    headers,
    signal: controller().signal,
  };

  if (formData) {
    fetchOpts.body = new URLSearchParams(formData).toString();
  } else if (body) {
    fetchOpts.body = JSON.stringify(body);
  }

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(fullUrl, fetchOpts);
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new ParliamentApiError(
          `Upstream returned ${res.status} ${res.statusText}`,
          { status: res.status, path, body: errBody.slice(0, 500) }
        );
      }
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        // Some endpoints return HTML (e.g., stenograms); return as text blob
        return { _html: text, _url: fullUrl };
      }
    } catch (err) {
      lastError = err;
      if (err.name === "AbortError" || err.message === "upstream_timeout") {
        lastError = new ParliamentApiError("Upstream request timed out", {
          status: 408,
          path,
        });
      }
      if (attempt < MAX_RETRIES) {
        await sleep((attempt + 1) * 500);
      }
    }
  }
  throw lastError;
}

// ─── Public API ────────────────────────────────────────────────────────────

export const parliamentApi = {
  // ── GET helpers ──────────────────────────────────────────────────────────
  async get(path) {
    return request("GET", path);
  },

  // ── POST helpers ─────────────────────────────────────────────────────────
  async postForm(path, formData) {
    return request("POST", path, { formData });
  },

  async postJson(path, body) {
    return request("POST", path, { body });
  },

  // ── Utility ──────────────────────────────────────────────────────────────
  canonicalUrl,
  BASE_URL,
};

export { ParliamentApiError };
