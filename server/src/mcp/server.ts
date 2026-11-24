// The /mcp endpoint: the tool handlers over MCP Streamable HTTP, stateless
// (one server and one transport per request), behind an API key.
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { FastifyInstance, onRequestHookHandler, RouteHandlerMethod } from "fastify";
import { z } from "zod";
import { KEY_PREFIX, useKey } from "../apikeys.js";
import { bearerToken } from "../auth.js";
import type { Config } from "../config.js";
import { now, type Db } from "../db.js";
import {
  alertRules, dayReport, getWebhook, history, listAlerts, listRooms, periodReport, type ToolContext, type ToolResult,
} from "./tools.js";

// src/mcp and dist/mcp both sit two levels below server/.
const VERSION: string = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "../../package.json"), "utf8"),
).version;

function toResult(r: ToolResult): CallToolResult {
  if (!r.ok) return { isError: true, content: [{ type: "text", text: r.error }] };
  // Every handler returns an object; structuredContent needs no outputSchema.
  return { content: [{ type: "text", text: JSON.stringify(r.data) }], structuredContent: r.data as Record<string, unknown> };
}

const room = z.string().min(1).describe("Room name (case-insensitive) or board id, as list_rooms gives them.");
const tz = z.string().optional().describe("IANA time zone for dates and timestamps, e.g. Europe/Paris. Default: the server's.");
const day = z.string().describe("Local date, YYYY-MM-DD.");
const readOnly = { readOnlyHint: true, openWorldHint: false };

export function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "aqa", version: VERSION });

  server.registerTool("list_rooms", {
    description: "Every room (sensor board) with its online state, open alerts and latest reading of each metric with its zone. " +
      "Call it first to learn the room names.",
    annotations: readOnly,
  }, () => toResult(listRooms(ctx)));

  server.registerTool("get_day_report", {
    description: "Air-quality report of one room for one local day (default: today), compared with the day before. " +
      "Use it for an evening summary.",
    inputSchema: { room, date: day.optional(), tz },
    annotations: readOnly,
  }, (a) => toResult(dayReport(ctx, a)));

  server.registerTool("get_report", {
    description: "Air-quality report of one room over whole local days, from one date to another inclusive (at most 32 days), " +
      "compared with the period just before. Use it for a weekly or monthly review.",
    inputSchema: { room, from: day, to: day, tz },
    annotations: readOnly,
  }, (a) => toResult(periodReport(ctx, a)));

  server.registerTool("get_history", {
    description: "Averages of one metric of one room over a time range, as at most `points` evenly spaced points. " +
      "Use it to describe a trend or find when a value changed. Steps of 3 h or more are aligned on UTC, not on local midnight.",
    inputSchema: {
      room,
      metric: z.enum(["co2", "pm25", "temp", "hum", "snd"]).describe("co2 (ppm), pm25 (µg/m³), temp (°C), hum (%) or snd (sound)."),
      from: z.string().describe("Start, ISO 8601 (e.g. 2026-11-24T08:00:00+01:00)."),
      to: z.string().describe("End, ISO 8601."),
      points: z.number().int().min(1).max(200).optional().describe("Maximum number of points, 1 to 200. Default: 48."),
      tz,
    },
    annotations: readOnly,
  }, (a) => toResult(history(ctx, a)));

  server.registerTool("list_alerts", {
    description: "Alerts still open plus those started since a given time (default: the last 24 hours), newest first, " +
      "optionally for one room. Use it to explain what went wrong and when.",
    inputSchema: {
      room: room.optional(),
      since: z.union([z.number().int().min(0), z.string()]).optional()
        .describe("Unix time in seconds or ISO 8601. Default: 24 hours ago."),
      limit: z.number().int().min(1).max(200).optional().describe("Maximum number of alerts, 1 to 200. Default: 50."),
      tz,
    },
    annotations: readOnly,
  }, (a) => toResult(listAlerts(ctx, a)));

  server.registerTool("get_alert_rules", {
    description: "The alert rules: for each kind, whether it is on, its threshold and unit, and how long the value must hold. " +
      "Use it to tell why an alert fired or did not.",
    annotations: readOnly,
  }, () => toResult(alertRules(ctx)));

  server.registerTool("get_webhook", {
    description: "The alert webhook: whether it is on, its URL, the allowed hosts and how its last delivery went. " +
      "Use it to check that alerts reach you; it cannot change the webhook.",
    inputSchema: { tz },
    annotations: readOnly,
  }, (a) => toResult(getWebhook(ctx, a)));

  return server;
}

export function mcpRoutes(app: FastifyInstance, deps: { db: Db; cfg: Config }): void {
  const { db, cfg } = deps;

  // An API key only: a session cookie is not enough here.
  const requireKey: onRequestHookHandler = async (request, reply) => {
    const token = bearerToken(request);
    const id = token?.startsWith(KEY_PREFIX) ? useKey(db, token) : null;
    if (id === null) return reply.code(401).send({ error: "api key required" });
    request.apiKeyId = id;
  };
  const hooks = { onRequest: [app.agentRateLimit, requireKey] };

  app.post("/mcp", hooks, async (request, reply) => {
    // The SDK accepts up to 100 messages per batch, which would cost one rate-limit
    // token; MCP 2025-06-18 dropped batching and the SDK client never sends it.
    if (Array.isArray(request.body)) return reply.code(400).send({ error: "batch requests are not supported" });
    const server = buildMcpServer({
      db, tz: cfg.AQA_TZ, publicUrl: cfg.PUBLIC_URL, allowedHosts: cfg.WEBHOOK_ALLOWED_HOSTS, now,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    // Headers already set on the reply (rate-limit counters) would be lost once hijacked.
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(name, value);
    }
    reply.hijack();
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (err) {
      request.log.error({ err }, "mcp request failed");
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(JSON.stringify({ error: "internal error" }));
      }
    }
  });

  // Stateless: no server-initiated stream (GET) and no session to end (DELETE).
  const notAllowed: RouteHandlerMethod = async (_request, reply) =>
    reply.code(405).header("allow", "POST").send({ error: "method not allowed" });
  app.get("/mcp", hooks, notAllowed);
  app.delete("/mcp", hooks, notAllowed);
}
