import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { CATALOG, type AlertEvent } from "../src/alerts.js";
import { openDb, run, type Db } from "../src/db.js";
import { COARSE_ERROR, Webhook, payloadFor, readWebhook, sign, testPayload } from "../src/webhook.js";

const URL_ = "https://x.test";
const T = 100_000;
const SECRET = "s3cret-s3cret-16";

const opened = (over: Partial<Extract<AlertEvent, { type: "opened" }>> = {}): Extract<AlertEvent, { type: "opened" }> => ({
  type: "opened", device_id: "aqa-24A160B3C8F0", device_name: "Salon", kind: "co2_high", threshold: 1200, value: 1340,
  started_at: T - 300, at: T, ...over,
});
const closed = (over: Partial<Extract<AlertEvent, { type: "closed" }>> = {}): Extract<AlertEvent, { type: "closed" }> => ({
  type: "closed", device_id: "aqa-24A160B3C8F0", device_name: "Salon", kind: "co2_high", started_at: T - 1380, at: T,
  end_value: 640, reason: "normal", ...over,
});

describe("payloads", () => {
  it("payloadFor opened", () => {
    const p = payloadFor(opened(), URL_, 1234);
    expect(p).toEqual({
      event: "alert.opened", sent_at: 1234,
      text: p.text,
      device: { id: "aqa-24A160B3C8F0", name: "Salon" },
      alert: {
        kind: "co2_high", label: "CO₂ élevé", tone: "bad", value: 1340, threshold: 1200, unit: "ppm",
        started_at: T - 300, ended_at: null, duration_s: 300, end_value: null, advice: CATALOG.co2_high.advice,
      },
      url: "https://x.test/#/alertes",
    });
    expect(p.text.startsWith("CO₂ élevé · Salon\n")).toBe(true);
  });
  it("payloadFor closed", () => {
    const p = payloadFor(closed(), URL_, 1234);
    expect(p).toMatchObject({ event: "alert.closed" });
    expect(p.alert).toMatchObject({ value: null, ended_at: T, end_value: 640, duration_s: 1380 });
    expect(p.text).toBe("Retour à la normale · Salon\nCO₂ élevé : terminé après 23 min, retour à 640 ppm.");
  });
  it("hors ligne : valeur, seuil et unité nuls", () => {
    const p = payloadFor(opened({ kind: "offline", value: null, threshold: null }), URL_, 1);
    expect(p.alert).toMatchObject({ value: null, threshold: null, unit: null });
  });
  it("testPayload", () => {
    const p = testPayload(URL_, 5);
    expect(p).toEqual({
      event: "test", sent_at: 5, url: "https://x.test/#/alertes",
      text: "Test · AQA\nLes notifications fonctionnent. Tes alertes arriveront ici.",
    });
    expect("device" in p).toBe(false);
    expect("alert" in p).toBe(false);
  });
});

describe("sign", () => {
  it("HMAC-SHA256 hex de « ts.corps »", () => {
    const s = sign(SECRET, 1700000000, '{"a":1}');
    expect(s).toBe(crypto.createHmac("sha256", SECRET).update('1700000000.{"a":1}').digest("hex"));
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });
});

interface Received { method: string; headers: http.IncomingHttpHeaders; raw: string }
let servers: http.Server[] = [];
async function fakeHermes(respond: (res: http.ServerResponse) => void = (res) => res.end("{}")) {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      received.push({ method: req.method!, headers: req.headers, raw: data });
      respond(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/aqa`, received };
}
afterEach(() => {
  for (const s of servers) { s.closeAllConnections(); s.close(); }
  servers = [];
});

const configure = (db: Db, url: string, over: Record<string, unknown> = {}) => {
  const s = { enabled: 1, secret: SECRET, notify_close: 1, ...over };
  run(db, "UPDATE webhook SET enabled = ?, url = ?, secret = ?, notify_close = ? WHERE id = 1",
    s.enabled as number, url, s.secret as string | null, s.notify_close as number);
};
const valid = (r: Received) => {
  const ts = Number(r.headers["x-webhook-timestamp"]);
  return r.headers["x-webhook-signature-v2"] === sign(SECRET, ts, r.raw);
};

describe("readWebhook", () => {
  it("défauts", () => {
    expect(readWebhook(openDb(":memory:"))).toEqual({ enabled: false, url: "", secret_set: false, notify_close: true, last: null });
  });
});

describe("Webhook.send", () => {
  it("poste le corps signé", async () => {
    const h = await fakeHermes();
    const db = openDb(":memory:");
    configure(db, h.url);
    const p = payloadFor(opened(), URL_, 1_700_000_000);
    const last = await new Webhook(db, { publicUrl: URL_ }).send(p);
    expect(last).toMatchObject({ ok: true, error: null });
    expect(h.received).toHaveLength(1);
    const r = h.received[0]!;
    expect(r.method).toBe("POST");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.headers["x-webhook-timestamp"]).toBe(String(p.sent_at));
    expect(r.headers["x-webhook-signature-v2"]).toBe(sign(SECRET, p.sent_at, r.raw));
    expect(r.headers["x-webhook-signature"]).toBeUndefined();
    expect(JSON.parse(r.raw)).toEqual(p);
    expect(readWebhook(db).last?.ok).toBe(true);
  });
  it("corps de la réponse ignoré", async () => {
    const bad = await fakeHermes((res) => { res.statusCode = 500; res.end("<html>secret</html>"); });
    const db = openDb(":memory:");
    configure(db, bad.url);
    const wh = new Webhook(db, { publicUrl: URL_ });
    expect(await wh.send(testPayload(URL_, 1))).toMatchObject({ ok: false, error: "HTTP 500" });
    const big = await fakeHermes((res) => res.end("<html>" + "x".repeat(100_000) + "</html>"));
    configure(db, big.url);
    expect(await wh.send(testPayload(URL_, 1))).toMatchObject({ ok: true, error: null });
    expect(JSON.stringify(readWebhook(db))).not.toContain("xxxx");
  });
  it("délai dépassé et injoignable", async () => {
    const h = await fakeHermes(() => {});
    const db = openDb(":memory:");
    configure(db, h.url);
    const slow = await new Webhook(db, { publicUrl: URL_, timeoutMs: 100 }).send(testPayload(URL_, 1));
    expect(slow.ok).toBe(false);
    expect(slow.error).toContain("délai dépassé");
    configure(db, "http://127.0.0.1:1");
    const down = await new Webhook(db, { publicUrl: URL_ }).send(testPayload(URL_, 1));
    expect(down.error).toMatch(/^injoignable/);
  });
  it("sans URL ou sans secret", async () => {
    const db = openDb(":memory:");
    const wh = new Webhook(db, { publicUrl: URL_ });
    expect((await wh.send(testPayload(URL_, 1))).error).toBe("aucune URL configurée");
    configure(db, "http://127.0.0.1:1", { secret: null });
    expect((await wh.send(testPayload(URL_, 1))).error).toBe("aucun secret configuré");
  });
  it("erreur grossière pour les clés", async () => {
    const db = openDb(":memory:");
    configure(db, "http://127.0.0.1:1");
    const wh = new Webhook(db, { publicUrl: URL_ });
    await wh.send(testPayload(URL_, 1));
    expect(readWebhook(db).last?.error).toMatch(/^injoignable/);
    expect(readWebhook(db, { coarse: true }).last).toMatchObject({ ok: false, error: COARSE_ERROR });
    const h = await fakeHermes();
    configure(db, h.url);
    await wh.send(testPayload(URL_, 1));
    expect(readWebhook(db, { coarse: true }).last).toMatchObject({ ok: true, error: null });
  });
});

describe("Webhook.alerts", () => {
  it("ouverture oui, fermeture « disabled » non", async () => {
    const h = await fakeHermes();
    const db = openDb(":memory:");
    configure(db, h.url);
    await new Webhook(db, { publicUrl: URL_ }).alerts([opened(), closed({ reason: "disabled" })]);
    expect(h.received).toHaveLength(1);
    expect(JSON.parse(h.received[0]!.raw).event).toBe("alert.opened");
  });
  it("notify_close = 0 : pas de fin", async () => {
    const h = await fakeHermes();
    const db = openDb(":memory:");
    configure(db, h.url, { notify_close: 0 });
    await new Webhook(db, { publicUrl: URL_ }).alerts([closed()]);
    expect(h.received).toHaveLength(0);
  });
  it("désactivé : rien", async () => {
    const h = await fakeHermes();
    const db = openDb(":memory:");
    configure(db, h.url, { enabled: 0 });
    await new Webhook(db, { publicUrl: URL_ }).alerts([opened()]);
    expect(h.received).toHaveLength(0);
  });
  it("deux ouvertures : deux POST, chacun signé pour son corps", async () => {
    const h = await fakeHermes();
    const db = openDb(":memory:");
    configure(db, h.url);
    await new Webhook(db, { publicUrl: URL_ }).alerts([opened(), opened({ kind: "temp_low", threshold: 19, value: 18 })]);
    expect(h.received).toHaveLength(2);
    expect(h.received.every(valid)).toBe(true);
    expect(new Set(h.received.map((r) => r.raw)).size).toBe(2);
  });
});
