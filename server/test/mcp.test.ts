import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createKey } from "../src/apikeys.js";
import { buildApp, type Built } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const PASSWORD = "correct horse battery";
const DEVICE = "aqa-24A160B3C8F0";

// A web build, so the SPA not-found handler is live and /mcp must stay out of it.
const webDir = fs.mkdtempSync(path.join(os.tmpdir(), "aqa-web-"));
fs.writeFileSync(path.join(webDir, "index.html"), "<!doctype html><title>AQA</title>");

const cfg = loadConfig({
  ADMIN_PASSWORD: PASSWORD,
  SESSION_SECRET: "x".repeat(40),
  PUBLIC_URL: "https://sensor.example.test",
  LOG_LEVEL: "silent",
  WEB_DIR: webDir,
});

let built: Built;
let base = "";
let key = "";
let cookie = "";
const clients: Client[] = [];

async function connect(): Promise<Client> {
  const client = new Client({ name: "test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
    requestInit: { headers: { authorization: "Bearer " + key } },
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]!.text);

const initialize = {
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "curl", version: "0" } },
};
const post = (headers: Record<string, string>) =>
  fetch(base + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(initialize),
  });

beforeAll(async () => {
  built = await buildApp(cfg, { dataDir: ":memory:" });
  await built.app.listen({ port: 0, host: "127.0.0.1" });
  const addr = built.app.server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
  const res = await built.app.inject({ method: "POST", url: "/api/v1/session", payload: { password: PASSWORD } });
  cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  await built.app.inject({ method: "POST", url: "/api/v1/devices", payload: { id: DEVICE, name: "Salon" }, headers: { cookie } });
  key = createKey(built.db, "t").key;
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});
afterAll(async () => {
  await built.app.close();
  fs.rmSync(webDir, { recursive: true, force: true });
});

describe("/mcp auth", () => {
  it("refuses a request without a key", async () => {
    const res = await post({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "api key required" });
  });
  it("refuses a session cookie alone", async () => {
    const res = await post({ cookie });
    expect(res.status).toBe(401);
  });
  it("refuses an unknown key", async () => {
    const res = await post({ authorization: "Bearer aqa_nope" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  });
  it("counts against the shared agent rate limit", async () => {
    const res = await post({ authorization: "Bearer " + key });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("120");
    expect(await res.text()).toContain('"serverInfo":{"name":"aqa","version":"1.0.0"}');
  });
  it("refuses JSON-RPC batches, which would dodge the rate limit", async () => {
    const res = await fetch(base + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json", accept: "application/json, text/event-stream",
        authorization: "Bearer " + key,
      },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({ error: "batch requests are not supported" });
  });
});

describe("/mcp tools", () => {
  it("lists the seven read tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort((a, b) => a.localeCompare(b))).toEqual(
      ["get_alert_rules", "get_day_report", "get_history", "get_report", "get_webhook", "list_alerts", "list_rooms"]);
    for (const t of tools) expect(t.description, t.name).toMatch(/\w+\. /);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t.inputSchema.properties ?? {}]));
    for (const name of ["get_day_report", "get_report", "get_history", "list_alerts", "get_webhook"]) {
      expect(byName[name], name).toHaveProperty("tz");
    }
  });

  it("calls list_rooms", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "list_rooms" });
    expect(r.isError).toBeFalsy();
    const data = JSON.parse(text(r));
    expect(data.rooms.map((x: { id: string; name: string }) => [x.id, x.name])).toEqual([[DEVICE, "Salon"]]);
  });

  it("turns a handler error into a tool error", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "get_day_report", arguments: { room: "inconnue" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/^Pièce inconnue/);
  });

  it("answers a day report for a room without data", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "get_day_report", arguments: { room: " salon " } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(text(r)).room).toBe("Salon");
  });

  it("rejects bad arguments before the handler", async () => {
    const client = await connect();
    const bad = [
      { name: "list_alerts", arguments: { limit: 0 } },
      { name: "list_alerts", arguments: { limit: 1.5 } },
      { name: "get_history", arguments: { room: "Salon", metric: "radon", from: "2026-11-23", to: "2026-11-24" } },
      { name: "get_history", arguments: { room: "Salon", metric: "co2", from: "2026-11-23", to: "2026-11-24", points: 500 } },
    ];
    for (const call of bad) {
      const r = await client.callTool(call);
      expect(r.isError, JSON.stringify(call)).toBe(true);
    }
  });
});

describe("/mcp methods", () => {
  it("answers GET with 405 JSON, not the SPA", async () => {
    const res = await fetch(base + "/mcp", { headers: { authorization: "Bearer " + key, accept: "text/event-stream" } });
    expect(res.status).toBe(405);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({ error: "method not allowed" });
  });
  it("answers DELETE with 405 JSON", async () => {
    const res = await fetch(base + "/mcp", { method: "DELETE", headers: { authorization: "Bearer " + key } });
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method not allowed" });
  });
  it("keeps paths under /mcp out of the SPA", async () => {
    const res = await fetch(base + "/mcp/", { headers: { accept: "text/html" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    await res.body?.cancel();
    const page = await fetch(base + "/rooms", { headers: { accept: "text/html" } });
    expect(page.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await page.text()).toContain("<title>AQA</title>");
  });
});
