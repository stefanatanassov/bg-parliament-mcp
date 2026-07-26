#!/usr/bin/env node
/**
 * Bulgarian Parliament MCP Server — REMOTE HTTP transport (stateless).
 *
 * Ready for deployment to Hostinger, VPS, Railway, Render, or any Node.js host.
 * Each request creates a fresh MCP session — no state, no sessions, no complexity.
 *
 * Usage:
 *   node remote.js                     # starts on port 3000
 *   PORT=8080 node remote.js           # custom port
 *
 * Connect from any remote MCP client:
 *   https://your-host.com/mcp
 */

import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parliamentApi, ParliamentApiError } from "./lib/client.js";
import { TOOLS, HANDLERS } from "./index.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();
app.use(cors());
app.use(express.json());

// ─── Helpers ───────────────────────────────────────────────────────────────

const BASE_WEB = "https://www.parliament.bg";

async function safeCall(fn, label) {
  try {
    const data = await fn();
    if (data === null || data === undefined) return { result: [] };
    return { result: data };
  } catch (err) {
    if (err instanceof ParliamentApiError) {
      return {
        error: { type: err.type, message: err.message, details: { status: err.status, path: err.path } },
      };
    }
    return { error: { type: "internal_error", message: `[${label}] ${err.message}` } };
  }
}

// ─── Create a fresh server per request ─────────────────────────────────────

function createServer() {
  const server = new Server(
    { name: "bg-parliament-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const handler = HANDLERS[name];
    if (!handler) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: { type: "unknown_tool", message: `Tool '${name}' not found` } }) }],
        isError: true,
      };
    }
    const { result, error } = await safeCall(() => handler(args), name);
    if (error) {
      return { content: [{ type: "text", text: JSON.stringify(error, null, 2) }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}

// ─── Health check ──────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.json({
    name: "bg-parliament-mcp",
    version: "1.0.0",
    tools: TOOLS.length,
    transport: "streamable-http",
    endpoint: "/mcp",
    features: {
      bill_text_extraction: true,
    },
  });
});

// ─── MCP endpoint (stateless — new server per request) ─────────────────────

app.all("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", message: err.message });
    }
  } finally {
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🏛️  Bulgarian Parliament MCP — Remote Server`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   MCP: http://localhost:${PORT}/mcp`);
  console.log(`   ${TOOLS.length} tools ready\n`);
});
