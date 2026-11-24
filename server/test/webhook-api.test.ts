import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AlertEvent } from "../src/alerts.js";
import { buildApp, dispatchAlerts, type Built } from "../src/app.js";
import { createKey } from "../src/apikeys.js";
import { loadConfig } from "../src/config.js";
import { run } from "../src/db.js";
import { COARSE_ERROR } from "../src/webhook.js";

const PASSWORD = "correct horse battery";
const SECRET = "x".repeat(16);
const cfg = loadConfig({
  ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: "x".repeat(40), PUBLIC_URL: "https://sensor.example.test",
  LOG_LEVEL: "silent", WEB_DIR: "",
});

let built: Built;
let cookie = "";
let key = "";
const servers: http.Server[] = [];

const admin = (method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) =>
  built.app.inject({ method, url, payload: payload as object, headers: { cookie } });
const withKey = (method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) =>
  built.app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${key}` } });

function receiver(hang = false) {
  const got: { body: string; at: number }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      got.push({ body, at: Date.now() });
      if (!hang) res.end("ok");
    });
  });
  servers.push(server);
  return new Promise<{ url: string; got: typeof got }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, got })));
}

beforeAll(async () => {
  built = await buildApp(cfg, { dataDir: ":memory:" });
  const res = await built.app.inject({ method: "POST", url: "/api/v1/session", payload: { password: PASSWORD } });
  cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  key = createKey(built.db, "t").key;
});
afterAll(async () => {
  for (const s of servers) { s.closeAllConnections(); s.close(); }
  await built.app.close();
});

describe("/api/v1/webhook", () => {
  it("requires auth", async () => {
    expect((await built.app.inject({ method: "GET", url: "/api/v1/webhook" })).statusCode).toBe(401);
  });

  it("defaults, then saves without ever returning the secret", async () => {
    expect((await admin("GET", "/api/v1/webhook")).json()).toEqual({
      enabled: false, url: "", secret_set: false, notify_close: true, last: null,
    });
    const res = await admin("PATCH", "/api/v1/webhook", { url: "https://hermes.example/hook", secret: SECRET, enabled: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ enabled: true, secret_set: true, url: "https://hermes.example/hook" });
    expect(res.body).not.toContain(SECRET);
    expect(res.json()).not.toHaveProperty("secret");
    expect((await admin("GET", "/api/v1/webhook")).body).not.toContain(SECRET);
  });

  it("rejects invalid bodies with 422", async () => {
    expect((await admin("PATCH", "/api/v1/webhook", { secret: "short" })).statusCode).toBe(422);
    expect((await admin("PATCH", "/api/v1/webhook", { url: "ftp://x" })).statusCode).toBe(422);
    expect((await admin("PATCH", "/api/v1/webhook", { nope: 1 })).statusCode).toBe(422);
    expect((await admin("PATCH", "/api/v1/webhook", {})).statusCode).toBe(422);
  });

  it("refuses to enable without URL or secret", async () => {
    await admin("PATCH", "/api/v1/webhook", { secret: null });
    await admin("PATCH", "/api/v1/webhook", { url: "https://hermes.example/hook" });
    const res = await admin("PATCH", "/api/v1/webhook", { enabled: true });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("a URL and a secret are required to enable the webhook");
  });

  it("secret: null on an enabled webhook disables it", async () => {
    await admin("PATCH", "/api/v1/webhook", { secret: SECRET, enabled: true });
    expect((await admin("GET", "/api/v1/webhook")).json().enabled).toBe(true);
    const res = await admin("PATCH", "/api/v1/webhook", { secret: null });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ enabled: false, secret_set: false });
  });

  it("test: 422 without URL or secret, then delivers a signed test event", async () => {
    run(built.db, "UPDATE webhook SET url = '' WHERE id = 1");
    expect((await admin("POST", "/api/v1/webhook/test")).statusCode).toBe(422);
    const r = await receiver();
    await admin("PATCH", "/api/v1/webhook", { url: r.url });
    await admin("PATCH", "/api/v1/webhook", { secret: null });
    expect((await admin("POST", "/api/v1/webhook/test")).statusCode).toBe(422);
    await admin("PATCH", "/api/v1/webhook", { secret: SECRET });
    const res = await admin("POST", "/api/v1/webhook/test");
    expect(res.statusCode).toBe(200);
    expect(res.json().last.ok).toBe(true);
    expect(JSON.parse(r.got[0]!.body).event).toBe("test");
  });

  it("works with an API key, with coarse errors", async () => {
    const r = await receiver();
    expect((await withKey("PATCH", "/api/v1/webhook", { url: r.url, secret: SECRET })).statusCode).toBe(200);
    expect((await withKey("POST", "/api/v1/webhook/test")).json().last.ok).toBe(true);
    await withKey("PATCH", "/api/v1/webhook", { url: "http://127.0.0.1:1" });
    const res = await withKey("POST", "/api/v1/webhook/test");
    expect(res.json().last.error).toBe(COARSE_ERROR);
    expect((await admin("GET", "/api/v1/webhook")).json().last.error).toMatch(/^injoignable/);
    expect((await withKey("GET", "/api/v1/webhook")).json().last.error).toBe(COARSE_ERROR);
  });
});

describe("dispatchAlerts", () => {
  it("a hanging webhook does not delay ntfy", async () => {
    const ntfy = await receiver();
    const hang = await receiver(true);
    await admin("PATCH", "/api/v1/notify", { server: ntfy.url.replace(/\/$/, ""), topic: "aqa-test", enabled: true });
    await admin("PATCH", "/api/v1/webhook", { url: hang.url, secret: SECRET, enabled: true });
    const ev: AlertEvent = {
      type: "opened", device_id: "aqa-24A160B3C8F0", device_name: "Salon", kind: "co2_high",
      threshold: 1200, value: 1340, started_at: 1, at: 2,
    };
    const t0 = Date.now();
    dispatchAlerts(built.notifier, built.webhook, [ev]);
    while (ntfy.got.length === 0 && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 10));
    expect(ntfy.got.length).toBe(1);
    expect(ntfy.got[0]!.at - t0).toBeLessThan(1000);
    await new Promise((r) => setTimeout(r, 50));
    expect(hang.got.length).toBe(1);
  });
});
