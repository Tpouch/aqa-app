// MCP tool handlers: plain functions over the database, no transport. Bad
// input comes back as { ok: false, error } (French), never as an exception.
import { CATALOG, readRules } from "../alerts.js";
import { all, type Db } from "../db.js";
import { addDays, isoLocal, isTimeZone, localClock, localMidnight, withIsoTimes } from "../localtime.js";
import {
  AGGREGATE_STEPS, aggregateRows, calibrationOf, deviceReport, deviceSummary, findDevice, listDeviceRows,
  type DeviceDbRow,
} from "../queries.js";
import { soundDb } from "../sound.js";
import type { Metric } from "../types.js";
import { readWebhook } from "../webhook.js";
import { bandOf, zonesOf } from "../zones.js";

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export interface ToolContext {
  db: Db;
  tz: string;
  publicUrl: string;
  allowedHosts: readonly string[];
  now: () => number;
}

const ok = (data: unknown): ToolResult => ({ ok: true, data });
const fail = (error: string): ToolResult => ({ ok: false, error });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: string) => DATE_RE.test(s) && addDays(s, 0) === s;
const dayNumber = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;

const UNITS: Record<Metric, string> = { co2: "ppm", pm25: "µg/m³", temp: "°C", hum: "%", snd: "brut" };
const METRIC_KEYS: Metric[] = ["co2", "pm25", "temp", "hum", "snd"];

const roomList = (db: Db) => listDeviceRows(db).map((d) => `${d.name} (${d.id})`).join(", ");

/** The board for an id or a name (case and surrounding spaces ignored); a string is the error message. */
export function resolveRoom(db: Db, room: string): DeviceDbRow | string {
  const byId = findDevice(db, room);
  if (byId) return byId;
  const key = room.trim().toLocaleLowerCase("fr");
  const rooms = listDeviceRows(db);
  const matches = rooms.filter((d) => d.name.trim().toLocaleLowerCase("fr") === key);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    return `Plusieurs pièces s'appellent « ${room} » : ${matches.map((d) => d.id).join(", ")}. Utilise l'id.`;
  }
  return `Pièce inconnue : « ${room} ». Pièces : ${roomList(db)}.`;
}

function zoneTz(ctx: ToolContext, tz: string | undefined): string | null {
  const z = tz ?? ctx.tz;
  return isTimeZone(z) ? z : null;
}

export function listRooms(ctx: ToolContext): ToolResult {
  const rooms = listDeviceRows(ctx.db).map((d) => {
    const s = deviceSummary(ctx.db, d);
    const cal = calibrationOf(d);
    let latest: unknown = null;
    if (s.latest) {
      const values = Object.fromEntries(METRIC_KEYS.map((m) => {
        const raw = s.latest![m];
        const v = m === "snd" && cal ? soundDb(raw, cal) : raw;
        const zone = bandOf(zonesOf(m, cal !== null), v)?.word ?? null;
        return [m, { value: v, unit: m === "snd" && cal ? "dB" : UNITS[m], zone }];
      }));
      latest = { at: isoLocal(s.latest.ts, ctx.tz), values };
    }
    return { id: d.id, name: d.name, online: s.online, last_seen_at: d.last_seen, open_alerts: s.open_alerts, latest };
  });
  return ok(withIsoTimes({ rooms }, ctx.tz));
}

function report(
  ctx: ToolContext, d: DeviceDbRow, tz: string, firstDate: string, lastDate: string, prevFrom: number,
): ToolResult {
  const from = localMidnight(firstDate, tz);
  const to = localMidnight(addDays(lastDate, 1), tz);
  const { heatmap: _heatmap, ...rest } = deviceReport(ctx.db, d, { from, to, prevFrom, kind: "custom", tz, now: ctx.now() });
  return ok(withIsoTimes({ ...rest, room: d.name, date: firstDate }, tz));
}

export function dayReport(ctx: ToolContext, a: { room: string; date?: string; tz?: string }): ToolResult {
  const tz = zoneTz(ctx, a.tz);
  if (!tz) return fail(`Fuseau horaire inconnu : « ${a.tz} ».`);
  const d = resolveRoom(ctx.db, a.room);
  if (typeof d === "string") return fail(d);
  const today = localClock(tz)(ctx.now()).date;
  const date = a.date ?? today;
  if (!isDate(date)) return fail("Date invalide : attendu AAAA-MM-JJ.");
  if (date > today) return fail("Cette date est dans le futur.");
  return report(ctx, d, tz, date, date, localMidnight(addDays(date, -1), tz));
}

export function periodReport(ctx: ToolContext, a: { room: string; from: string; to: string; tz?: string }): ToolResult {
  const tz = zoneTz(ctx, a.tz);
  if (!tz) return fail(`Fuseau horaire inconnu : « ${a.tz} ».`);
  const d = resolveRoom(ctx.db, a.room);
  if (typeof d === "string") return fail(d);
  if (!isDate(a.from) || !isDate(a.to)) return fail("Date invalide : attendu AAAA-MM-JJ.");
  const days = dayNumber(a.to) - dayNumber(a.from) + 1;
  if (days < 1) return fail("La date de fin précède la date de début.");
  if (days > 32) return fail("La période ne doit pas dépasser 32 jours.");
  return report(ctx, d, tz, a.from, a.to, localMidnight(addDays(a.from, -days), tz));
}

const DECIMALS: Record<Metric, number> = { co2: 0, pm25: 0, temp: 1, hum: 1, snd: 0 };

export function history(
  ctx: ToolContext, a: { room: string; metric: Metric; from: string; to: string; points?: number; tz?: string },
): ToolResult {
  const tz = zoneTz(ctx, a.tz);
  if (!tz) return fail(`Fuseau horaire inconnu : « ${a.tz} ».`);
  const d = resolveRoom(ctx.db, a.room);
  if (typeof d === "string") return fail(d);
  if (!METRIC_KEYS.includes(a.metric)) return fail(`Mesure inconnue : « ${a.metric} ».`);
  const from = Math.floor(Date.parse(a.from) / 1000);
  const to = Math.floor(Date.parse(a.to) / 1000);
  if (Number.isNaN(from) || Number.isNaN(to)) return fail("Date invalide : attendu ISO 8601.");
  if (to <= from) return fail("La fin doit suivre le début.");
  const points = a.points ?? 48;
  if (!Number.isInteger(points) || points < 1 || points > 200) return fail("points doit être un entier entre 1 et 200.");
  const step = AGGREGATE_STEPS.find((s) => Math.ceil((to - from) / s) + 1 <= points);
  if (step === undefined) return fail(`Période trop longue pour ${points} points : réduis-la ou demande moins de détail.`);
  const cal = calibrationOf(d);
  const toDb = a.metric === "snd" && cal !== null;
  const k = 10 ** DECIMALS[a.metric];
  const rows = aggregateRows(ctx.db, d.id, from, to, step).flatMap((r) => {
    const raw = r[a.metric];
    const v = toDb ? soundDb(raw, cal) : raw;
    return v === null ? [] : [{ at: isoLocal(r.ts, tz), avg: Math.round(v * k) / k }];
  });
  return ok({ room: d.name, metric: a.metric, unit: toDb ? "dB" : UNITS[a.metric], step_s: step, points: rows });
}

interface AlertQueryRow {
  name: string; kind: keyof typeof CATALOG; started_at: number; ended_at: number | null;
  start_value: number | null; peak_value: number | null; end_value: number | null; end_reason: string | null;
}

export function listAlerts(
  ctx: ToolContext, a: { room?: string; since?: number | string; limit?: number; tz?: string } = {},
): ToolResult {
  const tz = zoneTz(ctx, a.tz);
  if (!tz) return fail(`Fuseau horaire inconnu : « ${a.tz} ».`);
  let deviceId: string | null = null;
  if (a.room !== undefined) {
    const d = resolveRoom(ctx.db, a.room);
    if (typeof d === "string") return fail(d);
    deviceId = d.id;
  }
  const now = ctx.now();
  const since = a.since === undefined ? now - 86400
    : typeof a.since === "number" ? a.since : Math.floor(Date.parse(a.since) / 1000);
  if (Number.isNaN(since)) return fail("Date invalide : attendu ISO 8601.");
  const limit = Math.min(Math.max(Math.trunc(a.limit ?? 50), 1), 200);
  const rows = all<AlertQueryRow>(ctx.db,
    `SELECT d.name AS name, a.kind, a.started_at, a.ended_at, a.start_value, a.peak_value, a.end_value, a.end_reason
     FROM alerts a JOIN devices d ON d.id = a.device_id
     WHERE (a.ended_at IS NULL OR a.started_at >= ?) AND (? IS NULL OR a.device_id = ?)
     ORDER BY a.started_at DESC, a.id DESC LIMIT ?`,
    since, deviceId, deviceId, limit);
  const alerts = rows.map((r) => ({
    room: r.name, kind: r.kind, label: CATALOG[r.kind].label,
    started_at: r.started_at, ended_at: r.ended_at, duration_s: (r.ended_at ?? now) - r.started_at,
    start_value: r.start_value, peak_value: r.peak_value, end_value: r.end_value, end_reason: r.end_reason,
  }));
  return ok(withIsoTimes({ alerts }, tz));
}

export function alertRules(ctx: ToolContext): ToolResult {
  return ok({ rules: readRules(ctx.db).map((r) => ({ ...r, label: CATALOG[r.kind].label, unit: CATALOG[r.kind].unit })) });
}

export function getWebhook(ctx: ToolContext, a: { tz?: string } = {}): ToolResult {
  const tz = zoneTz(ctx, a.tz);
  if (!tz) return fail(`Fuseau horaire inconnu : « ${a.tz} ».`);
  const w = readWebhook(ctx.db, { coarse: true, allowedHosts: ctx.allowedHosts });
  return ok({ ...w, last: w.last ? { ...w.last, at: isoLocal(w.last.at, tz) } : null });
}
