import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { CATALOG, type AlertEvent } from "../src/alerts.js";
import { openDb, run, type Db } from "../src/db.js";
import { Notifier, closedMessage, openedMessage, readNotify, TEST_MESSAGE } from "../src/notify.js";

const URL_ = "https://x.test";
const n = (v: number) => new Intl.NumberFormat("fr-FR").format(v);
const T = 100_000;

const opened = (over: Partial<Extract<AlertEvent, { type: "opened" }>> = {}): Extract<AlertEvent, { type: "opened" }> => ({
  type: "opened", device_id: "aqa-24A160B3C8F0", device_name: "Salon", kind: "co2_high", threshold: 1200, value: 1340,
  started_at: T - 300, at: T, ...over,
});
const closed = (over: Partial<Extract<AlertEvent, { type: "closed" }>> = {}): Extract<AlertEvent, { type: "closed" }> => ({
  type: "closed", device_id: "aqa-24A160B3C8F0", device_name: "Salon", kind: "co2_high", started_at: T - 1380, at: T,
  end_value: 640, reason: "normal", ...over,
});

describe("messages", () => {
  it("openedMessage: CO₂", () => {
    const m = openedMessage(opened(), URL_);
    expect(m).toMatchObject({ title: "CO₂ élevé · Salon", priority: "high", tags: ["window"], click: "https://x.test/#/alertes" });
    expect(m.message.startsWith(`${n(1340)} ppm depuis 5 min (seuil ${n(1200)} ppm).`)).toBe(true);
    expect(m.message.endsWith(CATALOG.co2_high.advice)).toBe(true);
  });
  it("openedMessage: warn", () => {
    const m = openedMessage(opened({ kind: "temp_low", threshold: 19, value: 18.44, started_at: T - 1800 }), URL_);
    expect(m).toMatchObject({ title: "Trop froid · Salon", priority: "default", tags: ["cold_face"] });
    expect(m.message.startsWith("18,4 °C depuis 30 min (seuil 19 °C).")).toBe(true);
  });
  it("openedMessage: hors ligne", () => {
    const m = openedMessage(opened({ kind: "offline", threshold: null, value: null, started_at: T - 360 }), URL_);
    expect(m).toMatchObject({ title: "Carte hors ligne · Salon", priority: "high", tags: ["electric_plug"] });
    expect(m.message).toBe(`Aucun contact depuis 6 min.\n${CATALOG.offline.advice}`);
  });
  it("closedMessage", () => {
    expect(closedMessage(closed(), URL_)).toEqual({
      title: "Retour à la normale · Salon", priority: "low", tags: ["white_check_mark"],
      message: "CO₂ élevé : terminé après 23 min, retour à 640 ppm.", click: "https://x.test/#/alertes",
    });
    expect(closedMessage(closed({ kind: "offline", end_value: null, started_at: T - 720 }), URL_).message)
      .toBe("Carte hors ligne : reconnectée après 12 min.");
  });
  it("message de test", () => {
    expect(TEST_MESSAGE).toMatchObject({ title: "Test · AQA", priority: "default", tags: ["white_check_mark"] });
  });
});

describe("migration", () => {
  it("défauts", () => {
    expect(readNotify(openDb(":memory:"))).toEqual({
      enabled: false, server: "https://ntfy.sh", topic: "", token_set: false, notify_close: true, last: null,
    });
  });
});

// A tiny local ntfy: records requests, answers with `respond`.
interface Received { method: string; url: string; auth: string | undefined; body: any }
let servers: http.Server[] = [];
async function fakeNtfy(respond: (res: http.ServerResponse) => void = (res) => res.end("{}")) {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      received.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body: JSON.parse(data || "null") });
      respond(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, received };
}
afterEach(async () => {
  for (const s of servers) { s.closeAllConnections(); s.close(); }
  servers = [];
});

const configure = (db: Db, server: string, over: Record<string, unknown> = {}) => {
  const s = { enabled: 1, topic: "aqa-test", token: null, notify_close: 1, ...over };
  run(db, "UPDATE notify SET enabled = ?, server = ?, topic = ?, token = ?, notify_close = ? WHERE id = 1",
    s.enabled as number, server, s.topic as string, s.token as string | null, s.notify_close as number);
};

describe("Notifier.publish", () => {
  it("poste le JSON à la racine avec le jeton", async () => {
    const ntfy = await fakeNtfy();
    const db = openDb(":memory:");
    configure(db, ntfy.url, { token: "tk_x" });
    const last = await new Notifier(db, { publicUrl: URL_ }).publish(openedMessage(opened(), URL_));
    expect(last).toMatchObject({ ok: true, error: null });
    expect(ntfy.received).toHaveLength(1);
    expect(ntfy.received[0]).toMatchObject({ method: "POST", url: "/", auth: "Bearer tk_x" });
    expect(ntfy.received[0]!.body).toMatchObject({
      topic: "aqa-test", title: "CO₂ élevé · Salon", priority: 4, tags: ["window"], click: "https://x.test/#/alertes",
    });
    expect(readNotify(db).last).toMatchObject({ ok: true, error: null });
  });
  it("sans jeton, pas d'en-tête", async () => {
    const ntfy = await fakeNtfy();
    const db = openDb(":memory:");
    configure(db, ntfy.url);
    await new Notifier(db, { publicUrl: URL_ }).publish(TEST_MESSAGE);
    expect(ntfy.received[0]!.auth).toBeUndefined();
    expect(ntfy.received[0]!.body.priority).toBe(3);
  });
  it("erreur HTTP", async () => {
    const ntfy = await fakeNtfy((res) => { res.statusCode = 403; res.end('{"code":40301,"http":403,"error":"forbidden"}'); });
    const db = openDb(":memory:");
    configure(db, ntfy.url);
    const last = await new Notifier(db, { publicUrl: URL_ }).publish(TEST_MESSAGE);
    expect(last).toMatchObject({ ok: false, error: "HTTP 403 : forbidden" });
    expect(readNotify(db).last).toMatchObject({ ok: false, error: "HTTP 403 : forbidden" });
  });
  it("erreur HTTP hors ntfy : code seul", async () => {
    const ntfy = await fakeNtfy((res) => { res.statusCode = 500; res.end("<html>secret internal page</html>"); });
    const db = openDb(":memory:");
    configure(db, ntfy.url);
    expect(await new Notifier(db, { publicUrl: URL_ }).publish(TEST_MESSAGE)).toMatchObject({ ok: false, error: "HTTP 500" });
  });
  it("délai dépassé", async () => {
    const ntfy = await fakeNtfy(() => {}); // never answers
    const db = openDb(":memory:");
    configure(db, ntfy.url);
    const last = await new Notifier(db, { publicUrl: URL_, timeoutMs: 100 }).publish(TEST_MESSAGE);
    expect(last.ok).toBe(false);
    expect(last.error).toContain("délai dépassé");
  });
  it("injoignable", async () => {
    const db = openDb(":memory:");
    configure(db, "http://127.0.0.1:1");
    const last = await new Notifier(db, { publicUrl: URL_ }).publish(TEST_MESSAGE);
    expect(last.ok).toBe(false);
    expect(last.error).toMatch(/^injoignable/);
  });
  it("base fermée pendant l'envoi", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ntfy = await fakeNtfy((res) => { void gate.then(() => res.end("{}")); });
    const db = openDb(":memory:");
    configure(db, ntfy.url);
    const p = new Notifier(db, { publicUrl: URL_ }).publish(TEST_MESSAGE);
    await new Promise((r) => setTimeout(r, 50));
    db.close();
    release();
    await expect(p).resolves.toMatchObject({ ok: true });
  });
});

describe("Notifier.alerts", () => {
  const titles = (ntfy: { received: Received[] }) => ntfy.received.map((r) => r.body.title).sort();

  it("envoie ouverture et fin", async () => {
    const ntfy = await fakeNtfy();
    const db = openDb(":memory:");
    configure(db, ntfy.url);
    await new Notifier(db, { publicUrl: URL_ }).alerts([opened(), closed()]);
    expect(titles(ntfy)).toEqual(["CO₂ élevé · Salon", "Retour à la normale · Salon"]);
  });
  it("désactivé", async () => {
    const ntfy = await fakeNtfy();
    const db = openDb(":memory:");
    configure(db, ntfy.url, { enabled: 0 });
    await new Notifier(db, { publicUrl: URL_ }).alerts([opened(), closed()]);
    expect(ntfy.received).toHaveLength(0);
  });
  it("sans sujet", async () => {
    const ntfy = await fakeNtfy();
    const db = openDb(":memory:");
    configure(db, ntfy.url, { topic: "" });
    await new Notifier(db, { publicUrl: URL_ }).alerts([opened()]);
    expect(ntfy.received).toHaveLength(0);
  });
  it("fin désactivée par le réglage", async () => {
    const ntfy = await fakeNtfy();
    const db = openDb(":memory:");
    configure(db, ntfy.url, { notify_close: 0 });
    await new Notifier(db, { publicUrl: URL_ }).alerts([opened(), closed()]);
    expect(titles(ntfy)).toEqual(["CO₂ élevé · Salon"]);
  });
  it("ignore les fins 'disabled'", async () => {
    const ntfy = await fakeNtfy();
    const db = openDb(":memory:");
    configure(db, ntfy.url);
    await new Notifier(db, { publicUrl: URL_ }).alerts([closed({ reason: "disabled", end_value: null })]);
    expect(ntfy.received).toHaveLength(0);
  });
  it("aucun événement, aucun envoi ni lecture inutile", async () => {
    const db = openDb(":memory:");
    db.close();
    await expect(new Notifier(db, { publicUrl: URL_ }).alerts([])).resolves.toBeUndefined();
  });
});
