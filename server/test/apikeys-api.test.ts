import { afterAll, beforeAll, describe, expect, it } from "vitest";
import cookiePlugIn from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type onRequestHookHandler } from "fastify";
import { buildApp, type Built } from "../src/app.js";
import { SESSION_COOKIE } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Notifier } from "../src/notify.js";
import { Webhook } from "../src/webhook.js";
import { appRoutes } from "../src/routes/app.js";

const PASSWORD = "correct horse battery";
const DEVICE = "aqa-24A160B3C8F0";

const cfg = loadConfig({
  ADMIN_PASSWORD: PASSWORD,
  SESSION_SECRET: "x".repeat(40),
  PUBLIC_URL: "https://sensor.example.test",
  LOG_LEVEL: "silent",
  WEB_DIR: "",
});

let built: Built;
let cookie = "";
let key = "";
let keyId = 0;

const admin = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  built.app.inject({ method, url, payload: payload as object, headers: { cookie } });

const withKey = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown, k = key) =>
  built.app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${k}` } });

beforeAll(async () => {
  built = await buildApp(cfg, { dataDir: ":memory:" });
  const res = await built.app.inject({ method: "POST", url: "/api/v1/session", payload: { password: PASSWORD } });
  cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  await admin("POST", "/api/v1/devices", { id: DEVICE, name: "Chambre" });
});
afterAll(async () => {
  await built.app.close();
});

describe("clés d'API", () => {
  it("creates a key (shown once) and lists it without the secret", async () => {
    const res = await admin("POST", "/api/v1/api-keys", { name: "  Hermes " });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.key).toMatch(/^aqa_[A-Za-z0-9_-]{43}$/);
    expect(body.name).toBe("Hermes");
    key = body.key;
    keyId = body.id;
    const list = (await admin("GET", "/api/v1/api-keys")).json();
    expect(list.keys).toHaveLength(1);
    expect(list.keys[0].key).toBeUndefined();
    expect(list.keys[0].prefix).toBe(key.slice(4, 12));
  });

  it("opens exactly the flagged read routes to a key", async () => {
    const urls = [
      "/api/v1/devices",
      `/api/v1/devices/${DEVICE}`,
      `/api/v1/devices/${DEVICE}/frames`,
      `/api/v1/devices/${DEVICE}/frames/aggregate?step=60`,
      `/api/v1/devices/${DEVICE}/report?from=0&to=3600`,
      `/api/v1/devices/${DEVICE}/alerts`,
      `/api/v1/devices/${DEVICE}/events`,
      "/api/v1/alert-rules",
    ];
    for (const url of urls) {
      const res = await withKey("GET", url);
      expect(res.statusCode, url).not.toBe(401);
      expect(res.statusCode, url).toBe(200);
    }
  });

  it("refuses a key on every other route", async () => {
    const cases: [("GET" | "POST" | "PATCH" | "DELETE"), string, unknown?][] = [
      ["POST", `/api/v1/devices/${DEVICE}/commands`, { type: "status" }],
      ["POST", "/api/v1/firmware", {}],
      ["POST", "/api/v1/api-keys", { name: "evil" }],
      ["GET", "/api/v1/api-keys"],
      ["PATCH", "/api/v1/alert-rules/co2_high", { enabled: false }],
      ["GET", "/api/v1/notify"],
      ["GET", "/api/v1/firmware"],
      ["DELETE", `/api/v1/devices/${DEVICE}`],
      ["GET", `/api/v1/devices/${DEVICE}/commands`],
    ];
    for (const [method, url, payload] of cases) {
      expect((await withKey(method, url, payload)).statusCode, `${method} ${url}`).toBe(401);
    }
    expect((await admin("GET", `/api/v1/devices/${DEVICE}`)).statusCode).toBe(200);
  });

  it("flags exactly the 9 expected key-capable routes with agent: true", async () => {
    // Test-only app: an onRoute hook registered before appRoutes records the flagged routes.
    const db = openDb(":memory:");
    const app = Fastify({ logger: false });
    const flagged: string[] = [];
    app.addHook("onRoute", (r) => {
      if (r.config?.agent !== true) return;
      for (const m of [r.method].flat()) if (m !== "HEAD") flagged.push(`${m} ${r.url}`);
    });
    try {
      await app.register(cookiePlugIn);
      await app.register(jwt, { secret: cfg.SESSION_SECRET, cookie: { cookieName: SESSION_COOKIE, signed: false } });
      await app.register(rateLimit, { global: false });
      app.decorate("agentRateLimit", (async () => {}) as onRequestHookHandler);
      await app.register(multipart);
      app.decorateRequest("apiKeyId", null);
      appRoutes(app, db, cfg, built.firmware, new Notifier(db, { publicUrl: cfg.PUBLIC_URL, log: app.log }),
        new Webhook(db, { publicUrl: cfg.PUBLIC_URL, allowedHosts: [], log: app.log }));
      await app.ready();
      expect(flagged.sort()).toEqual([
        "GET /api/v1/alert-rules",
        "GET /api/v1/devices",
        "GET /api/v1/devices/:id",
        "GET /api/v1/devices/:id/alerts",
        "GET /api/v1/devices/:id/events",
        "GET /api/v1/devices/:id/frames",
        "GET /api/v1/devices/:id/frames/aggregate",
        "GET /api/v1/devices/:id/report",
        "GET /api/v1/webhook",
      ]);
    } finally {
      await app.close();
      db.close();
    }
  });

  it("answers 401, never 500, to a wrong or malformed key", async () => {
    expect((await withKey("GET", "/api/v1/devices", undefined, "aqa_nope")).statusCode).toBe(401);
    expect((await withKey("GET", "/api/v1/devices", undefined, "nimporte")).statusCode).toBe(401);
  });

  it("lets a valid cookie win over a bad bearer", async () => {
    const res = await built.app.inject({
      method: "GET", url: "/api/v1/devices", headers: { cookie, authorization: "Bearer aqa_nope" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("reports a valid cookie as authenticated even with a stray bearer", async () => {
    const res = await built.app.inject({
      method: "GET", url: "/api/v1/session", headers: { cookie, authorization: "Bearer aqa_nope" },
    });
    expect(res.json()).toEqual({ authenticated: true });
  });

  it("revokes a key: next request is 401, deleting twice is 404", async () => {
    expect((await withKey("GET", "/api/v1/devices")).statusCode).toBe(200);
    expect((await admin("DELETE", `/api/v1/api-keys/${keyId}`)).statusCode).toBe(204);
    expect((await withKey("GET", "/api/v1/devices")).statusCode).toBe(401);
    expect((await admin("DELETE", `/api/v1/api-keys/${keyId}`)).statusCode).toBe(404);
  });

  it("validates the name", async () => {
    expect((await admin("POST", "/api/v1/api-keys", { name: "   " })).statusCode).toBe(422);
    expect((await admin("POST", "/api/v1/api-keys", { name: "x".repeat(61) })).statusCode).toBe(422);
    expect((await admin("POST", "/api/v1/api-keys", {})).statusCode).toBe(422);
  });

  it("rate-limits key requests to 120 per minute, not cookie requests", async () => {
    // Own app: the counter is per IP and route, earlier tests already used some of it.
    const fresh = await buildApp(cfg, { dataDir: ":memory:" });
    try {
      const login = await fresh.app.inject({ method: "POST", url: "/api/v1/session", payload: { password: PASSWORD } });
      const ck = String(login.headers["set-cookie"]).split(";")[0]!;
      const k = (await fresh.app.inject({
        method: "POST", url: "/api/v1/api-keys", payload: { name: "limit" }, headers: { cookie: ck },
      })).json().key as string;
      const codes: number[] = [];
      for (let i = 0; i < 121; i++) {
        codes.push((await fresh.app.inject({
          method: "GET", url: "/api/v1/alert-rules", headers: { authorization: `Bearer ${k}` },
        })).statusCode);
      }
      expect(codes.slice(0, 120).every((c) => c === 200)).toBe(true);
      expect(codes[120]).toBe(429);

      // The budget is shared by all agent routes: 60 + 61 over two routes -> the 121st is refused.
      const fresh2 = await buildApp(cfg, { dataDir: ":memory:" });
      try {
        const k2 = (await fresh2.app.inject({
          method: "POST", url: "/api/v1/api-keys", payload: { name: "x" },
          headers: { cookie: String((await fresh2.app.inject({ method: "POST", url: "/api/v1/session", payload: { password: PASSWORD } })).headers["set-cookie"]).split(";")[0]! },
        })).json().key as string;
        const mixed: number[] = [];
        for (let i = 0; i < 121; i++) {
          mixed.push((await fresh2.app.inject({
            method: "GET", url: i < 60 ? "/api/v1/alert-rules" : "/api/v1/devices", headers: { authorization: `Bearer ${k2}` },
          })).statusCode);
        }
        expect(mixed.slice(0, 120).every((c) => c === 200)).toBe(true);
        expect(mixed[120]).toBe(429);
      } finally {
        await fresh2.app.close();
      }

      for (let i = 0; i < 121; i++) {
        const res = await fresh.app.inject({ method: "GET", url: "/api/v1/alert-rules", headers: { cookie: ck } });
        expect(res.statusCode).toBe(200);
      }
    } finally {
      await fresh.app.close();
    }
  });
});
