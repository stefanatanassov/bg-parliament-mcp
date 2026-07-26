/**
 * Unit tests for bg-parliament-mcp
 *
 * Tests the ParliamentClient HTTP abstraction and error semantics.
 * Does NOT require network access (uses mocked fetch).
 */

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";

// Save original fetch
const originalFetch = globalThis.fetch;
let mockResponses = {};

function setupMockFetch(responses) {
  mockResponses = responses;
  globalThis.fetch = mock.fn(async (url, opts) => {
    const key = typeof url === "string" ? url : url.toString();
    for (const [pattern, response] of Object.entries(mockResponses)) {
      if (key.includes(pattern)) {
        const status = response.status || 200;
        const body =
          typeof response.body === "string"
            ? response.body
            : JSON.stringify(response.body);
        return {
          ok: status >= 200 && status < 300,
          status,
          statusText: status === 200 ? "OK" : "Error",
          text: async () => body,
          json: async () => JSON.parse(body),
        };
      }
    }
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Not Found",
    };
  });
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// ─── Client tests ──────────────────────────────────────────────────────────

describe("ParliamentClient", () => {
  let client;

  before(async () => {
    process.env.PARLIAMENT_TIMEOUT_MS = "5000";
    process.env.PARLIAMENT_RETRIES = "0";
    const mod = await import("../lib/client.js");
    client = mod.parliamentApi;
  });

  after(() => {
    restoreFetch();
    delete process.env.PARLIAMENT_TIMEOUT_MS;
    delete process.env.PARLIAMENT_RETRIES;
  });

  it("should make a successful GET request", async () => {
    setupMockFetch({
      "/api/v1/fn-assembly/bg": {
        body: [
          { A_ns_id: 62, A_nsL_value: "52-ро НС" },
          { A_ns_id: 61, A_nsL_value: "51-во НС" },
        ],
      },
    });

    const result = await client.get("/api/v1/fn-assembly/bg");
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
    assert.equal(result[0].A_ns_id, 62);
    assert.equal(result[0].A_nsL_value, "52-ро НС");
  });

  it("should handle empty responses (return null)", async () => {
    setupMockFetch({
      "/api/v1/empty": { body: "" },
    });

    const result = await client.get("/api/v1/empty");
    assert.equal(result, null);
  });

  it("should handle HTTP 500 errors with structured error", async () => {
    setupMockFetch({
      "/api/v1/error": { status: 500, body: "Internal Server Error" },
    });

    await assert.rejects(
      () => client.get("/api/v1/error"),
      (err) => {
        assert.equal(err.name, "ParliamentApiError");
        assert.equal(err.type, "upstream_http_error");
        assert.equal(err.status, 500);
        assert.ok(err.message.includes("500"));
        return true;
      }
    );
  });

  it("should handle HTML responses (stenograms etc)", async () => {
    setupMockFetch({
      "/api/v1/pl-sten/123": {
        body: "<html><body>Stenogram content here</body></html>",
      },
    });

    const result = await client.get("/api/v1/pl-sten/123");
    assert.ok(result._html);
    assert.ok(result._html.includes("Stenogram"));
    assert.ok(result._url);
  });

  it("should construct canonical URLs correctly", () => {
    assert.equal(
      client.canonicalUrl("mp", 5237),
      "https://www.parliament.bg/bg/mp/5237"
    );
    assert.equal(
      client.canonicalUrl("acts", 167035),
      "https://www.parliament.bg/bg/acts/167035"
    );
  });

  it("should make POST form requests", async () => {
    setupMockFetch({
      "/api/v1/fn-acts/1": {
        body: [{ L_Act_id: 1, L_ActL_final: "Test Act" }],
      },
    });

    const result = await client.postForm("/api/v1/fn-acts/1", {
      L_Act_string: "test",
      search: "1",
    });
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    assert.equal(result[0].L_Act_id, 1);
  });

  it("should handle HTTP 503 with retries exhausted", async () => {
    process.env.PARLIAMENT_RETRIES = "1";
    setupMockFetch({
      "/api/v1/unavailable": { status: 503, body: "Service Unavailable" },
    });

    await assert.rejects(
      () => client.get("/api/v1/unavailable"),
      (err) => {
        assert.equal(err.type, "upstream_http_error");
        assert.equal(err.status, 503);
        return true;
      }
    );
  });

  it("should handle JSON parse failures gracefully", async () => {
    setupMockFetch({
      "/api/v1/bad-json": { body: "not valid json at all {{{" },
    });

    const result = await client.get("/api/v1/bad-json");
    assert.ok(result._html);
    assert.ok(result._html.includes("not valid json"));
  });

  it("should handle null JSON response", async () => {
    setupMockFetch({
      "/api/v1/null-response": { body: "null" },
    });

    const result = await client.get("/api/v1/null-response");
    assert.equal(result, null);
  });

  it("should expose BASE_URL constant", () => {
    assert.ok(client.BASE_URL);
    assert.ok(client.BASE_URL.includes("parliament.bg"));
  });
});

// ─── Error class tests ─────────────────────────────────────────────────────

describe("ParliamentApiError", () => {
  it("should create structured error objects", async () => {
    const { ParliamentApiError } = await import("../lib/client.js");
    const err = new ParliamentApiError("Test error", {
      status: 404,
      path: "/api/v1/test",
      body: "Not found",
    });

    assert.equal(err.name, "ParliamentApiError");
    assert.equal(err.type, "upstream_http_error");
    assert.equal(err.status, 404);
    assert.equal(err.path, "/api/v1/test");
    assert.equal(err.body, "Not found");
    assert.ok(err instanceof Error);
  });
});
