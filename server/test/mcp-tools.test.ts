import { describe, expect, it } from "vitest";
import { openDb, run, type Db } from "../src/db.js";
import { deviceReport, findDevice } from "../src/queries.js";
import { addDays, localMidnight } from "../src/localtime.js";
import { ZONES, bandOf } from "../src/zones.js";
import {
  alertRules, dayReport, getWebhook, history, listAlerts, listRooms, periodReport, resolveRoom, type ToolContext,
} from "../src/mcp/tools.js";

const NOW = Date.UTC(2026, 10, 24, 12) / 1000;
const SALON = "aqa-24A160B3C8F0";
const CHAMBRE = "aqa-24A160B3C8F1";

function setup(): { db: Db; ctx: ToolContext } {
  const db = openDb(":memory:");
  const ctx: ToolContext = { db, tz: "UTC", publicUrl: "http://x", allowedHosts: ["hermes.local"], now: () => NOW };
  return { db, ctx };
}
const board = (db: Db, id: string, name: string) =>
  run(db, "INSERT INTO devices (id, name, token_hash, created_at) VALUES (?, ?, 'x', 0)", id, name);
const frame = (db: Db, id: string, ts: number, co2: number | null, temp = 21) =>
  run(db, "INSERT INTO frames (device_id, ts, ts_estimated, snd, co2, pm25, hum, temp, stale, received_at) VALUES (?, ?, 0, NULL, ?, 5, 45, ?, 0, ?)", id, ts, co2, temp, ts);
const alert = (db: Db, id: string, kind: string, start: number, end: number | null) =>
  run(db, "INSERT INTO alerts (device_id, kind, threshold, started_at, ended_at, start_value, peak_value, end_value, end_reason) VALUES (?, ?, 1200, ?, ?, 1300, 1500, ?, ?)",
    id, kind, start, end, end === null ? null : 900, end === null ? null : "normal");

describe("resolveRoom", () => {
  it("résout par id, par nom insensible à la casse et aux espaces", () => {
    const { db } = setup();
    board(db, SALON, "Salon");
    expect((resolveRoom(db, SALON) as { id: string }).id).toBe(SALON);
    expect((resolveRoom(db, "  SALON ") as { id: string }).id).toBe(SALON);
  });
  it("liste les pièces quand elle est inconnue", () => {
    const { db } = setup();
    board(db, SALON, "Salon"); board(db, CHAMBRE, "Chambre");
    expect(resolveRoom(db, "cave")).toBe(`Pièce inconnue : « cave ». Pièces : Chambre (${CHAMBRE}), Salon (${SALON}).`);
  });
  it("refuse les noms en double", () => {
    const { db } = setup();
    board(db, SALON, "Salon"); board(db, CHAMBRE, "salon");
    const r = resolveRoom(db, "Salon");
    expect(r).toContain("Plusieurs pièces");
    expect(r).toContain(SALON); expect(r).toContain(CHAMBRE);
  });
});

describe("listRooms", () => {
  it("donne la dernière mesure avec zone et unité", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon"); board(db, CHAMBRE, "Chambre");
    frame(db, SALON, NOW - 60, 1340);
    const r = listRooms(ctx) as { ok: true; data: { rooms: any[] } };
    const salon = r.data.rooms.find((x) => x.id === SALON);
    expect(salon.latest.values.co2).toEqual({ value: 1340, unit: "ppm", zone: bandOf(ZONES.co2, 1340)!.word });
    expect(r.data.rooms.find((x) => x.id === CHAMBRE).latest).toBeNull();
  });
});

describe("dayReport", () => {
  it("couvre le jour local, sans heatmap", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon");
    for (let i = 0; i < 60; i++) { frame(db, SALON, localMidnight("2026-11-23", "UTC") + 3600 + i * 60, 600); frame(db, SALON, localMidnight("2026-11-24", "UTC") + 3600 + i * 60, 700); }
    const r = dayReport(ctx, { room: "Salon", date: "2026-11-24" }) as { ok: true; data: any };
    expect(r.ok).toBe(true);
    expect(r.data.from).toBe("2026-11-24T00:00:00+00:00");
    expect("heatmap" in r.data).toBe(false);
    expect(r.data.metrics.length).toBeGreaterThan(0);
    expect(r.data.room).toBe("Salon");
    const from = localMidnight("2026-11-24", "UTC");
    const direct = deviceReport(db, findDevice(db, SALON)!, { from, to: localMidnight(addDays("2026-11-24", 1), "UTC"), prevFrom: localMidnight("2026-11-23", "UTC"), kind: "custom", tz: "UTC", now: NOW });
    expect(r.data.verdict).toEqual(direct.verdict);
  });
  it("rend un rapport vide pour une carte sans mesure", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon");
    const r = dayReport(ctx, { room: SALON }) as { ok: true; data: any };
    expect(r.ok).toBe(true);
    expect(r.data.measured_s).toBe(0);
  });
  it("refuse une date future", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon");
    expect(dayReport(ctx, { room: SALON, date: "2026-11-25" }).ok).toBe(false);
  });
});

describe("periodReport", () => {
  it("refuse plus de 32 jours", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon");
    const r = periodReport(ctx, { room: SALON, from: "2026-10-01", to: "2026-11-02" });
    expect(r).toEqual({ ok: false, error: "La période ne doit pas dépasser 32 jours." });
    expect(periodReport(ctx, { room: SALON, from: "2026-10-01", to: "2026-10-31" }).ok).toBe(true);
  });
});

describe("resolveRoom sans carte", () => {
  it("dit qu'aucune pièce n'existe", () => {
    const { db } = setup();
    expect(resolveRoom(db, "Salon")).toBe("Aucune pièce enregistrée.");
  });
});

describe("history", () => {
  it("choisit le pas le plus fin qui tient dans les points demandés", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon");
    for (let i = 0; i < 24; i++) frame(db, SALON, NOW - 86400 + i * 3600 + 5, 500 + i);
    const r = history(ctx, { room: SALON, metric: "co2", from: new Date((NOW - 86400) * 1000).toISOString(), to: new Date(NOW * 1000).toISOString() }) as { ok: true; data: any };
    expect(r.data.step_s).toBe(3600);
    expect(r.data.points.length).toBeLessThanOrEqual(48);
    expect(r.data.unit).toBe("ppm");
    expect(typeof r.data.points[0].at).toBe("string");
  });
  it("ne dépasse jamais le nombre de points demandé, même avec un début non aligné", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon");
    const from = NOW - 86400 + 1234;
    for (let i = 0; i < 24 * 60; i += 5) frame(db, SALON, from + i * 60, 600);
    const r = history(ctx, { room: SALON, metric: "co2", from: new Date(from * 1000).toISOString(), to: new Date((from + 86400) * 1000).toISOString(), points: 24 }) as { ok: true; data: any };
    expect(r.data.points.length).toBeLessThanOrEqual(24);
  });
  it("lit une fenêtre sans décalage dans le fuseau demandé", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon");
    const lo = Date.UTC(2026, 10, 24, 7) / 1000; // 08:00 Paris
    for (let i = -2; i < 14; i++) frame(db, SALON, lo + i * 3600 + 5, 600);
    const r = history(ctx, { room: SALON, metric: "co2", from: "2026-11-24T08:00", to: "2026-11-24T10:00", tz: "Europe/Paris" }) as { ok: true; data: any };
    const ts = r.data.points.map((p: any) => Date.parse(p.at) / 1000);
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) { expect(t).toBeGreaterThanOrEqual(lo); expect(t).toBeLessThanOrEqual(lo + 7200); }
    expect(r.data.points[0].at.endsWith("+01:00")).toBe(true);
  });
  it("refuse une période trop longue", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon");
    const r = history(ctx, { room: SALON, metric: "co2", from: new Date((NOW - 400 * 86400) * 1000).toISOString(), to: new Date(NOW * 1000).toISOString(), points: 200 });
    expect(r.ok).toBe(false);
  });
});

describe("listAlerts", () => {
  it("liste les alertes de toutes les cartes, ouvertes et récentes", () => {
    const { db, ctx } = setup();
    board(db, SALON, "Salon"); board(db, CHAMBRE, "Chambre");
    alert(db, SALON, "co2_high", NOW - 3600, null);
    alert(db, CHAMBRE, "co2_high", NOW - 7200, NOW - 3600);
    alert(db, CHAMBRE, "temp_high", NOW - 2 * 86400 - 600, NOW - 2 * 86400);
    const rows = (c: typeof ctx, q = {}) => ((listAlerts(c, q) as any).data.alerts as any[]);
    expect(rows(ctx).map((a) => a.room).sort((a, b) => a.localeCompare(b))).toEqual(["Chambre", "Salon"]);
    expect(rows(ctx, { since: NOW - 3 * 86400 }).length).toBe(3);
    expect(rows(ctx, { room: "Salon" }).length).toBe(1);
    expect(rows(ctx)[0].duration_s).toBeGreaterThan(0);
  });
});

describe("alertRules / getWebhook", () => {
  it("ajoute label et unité", () => {
    const { ctx } = setup();
    const r = alertRules(ctx) as { ok: true; data: any };
    expect(r.data.rules[0].label).toBeTruthy();
  });
  it("expose les hôtes autorisés, jamais de secret", () => {
    const { ctx } = setup();
    const r = getWebhook(ctx) as { ok: true; data: any };
    expect(r.data.allowed_hosts).toEqual(["hermes.local"]);
    expect("secret" in r.data).toBe(false);
  });
  it("donne l'heure du dernier envoi en ISO", () => {
    const { db, ctx } = setup();
    run(db, "UPDATE webhook SET last_at = ?, last_ok = 1 WHERE id = 1", NOW);
    const r = getWebhook(ctx) as { ok: true; data: any };
    expect(r.data.last.at).toBe("2026-11-24T12:00:00+00:00");
  });
});
