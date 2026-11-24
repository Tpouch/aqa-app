// Routes used by the web UI. All require the admin session cookie.
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DEVICE_ID_RE, newDeviceToken, requireAdmin, sha256Hex } from "../auth.js";
import type { Config } from "../config.js";
import { CATALOG, readRules, toAlertRow, type AlertDbRow } from "../alerts.js";
import { all, get, now, run, type Db } from "../db.js";
import type { SQLInputValue } from "node:sqlite";
import { logEvent, redactParams } from "../events.js";
import { FirmwareStore, VERSION_RE } from "../firmware.js";
import { isTimeZone } from "../localtime.js";
import { buildReport, REPORT_STEP } from "../report.js";
import { ALERT_KINDS } from "../types.js";
import type {
  AggregateRow, AlertKind, CommandRow, DeviceSummary, EventRow, FrameRow, UnknownDevice,
} from "../types.js";

export const ONLINE_WINDOW_S = 180;
const AGGREGATE_STEPS = [60, 300, 900, 3600, 10800, 21600, 86400];

const deviceIdParam = z.object({ id: z.string().regex(DEVICE_ID_RE, "id must look like aqa-24A160B3C8F0") });
const rangeQuery = z.object({
  from: z.coerce.number().int().nonnegative().default(0),
  to: z.coerce.number().int().nonnegative().default(2 ** 31),
});

const MAX_REPORT_S = 32 * 86400;
const reportQuery = z.object({
  from: z.coerce.number().int().nonnegative(),
  to: z.coerce.number().int().nonnegative(),
  prev_from: z.coerce.number().int().nonnegative().optional(),
  kind: z.enum(["week", "month", "custom"]).default("custom"),
  tz: z.string().default(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    .refine(isTimeZone, "tz must be an IANA time zone such as Europe/Paris"),
}).refine((q) => q.to > q.from, "to must be after from")
  .refine((q) => q.to - q.from <= MAX_REPORT_S, "the period must not exceed 32 days")
  .refine((q) => q.prev_from === undefined || q.prev_from < q.from, "prev_from must be before from");

// Averages per bucket of `step` seconds over [from, to].
// Not aliased "ts": SQLite would resolve GROUP BY ts to the alias. The CAST
// matters: node:sqlite binds JS numbers as REAL, and ts / 3600.0 would be a
// float division putting every frame in its own bucket.
function aggregateRows(db: Db, id: string, from: number, to: number, step: number): AggregateRow[] {
  const rows = all<Omit<AggregateRow, "ts"> & { bucket: number }>(db,
    `SELECT (ts / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS bucket, COUNT(*) AS n,
            AVG(snd) AS snd, AVG(co2) AS co2, AVG(pm25) AS pm25, AVG(hum) AS hum, AVG(temp) AS temp
     FROM frames WHERE device_id = ? AND ts BETWEEN ? AND ?
     GROUP BY bucket ORDER BY bucket`,
    step, step, id, from, to);
  return rows.map(({ bucket, ...r }) => ({ ts: bucket, ...r }));
}

const patchBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sound_calibration: z.object({
    snd_ref: z.number().int().min(1).max(4095),
    db_ref: z.number().min(20).max(130),
  }).strict().nullable().optional(),
}).strict().refine((b) => b.name !== undefined || b.sound_calibration !== undefined, "name or sound_calibration required");

const ruleBody = z.object({
  enabled: z.boolean().optional(),
  threshold: z.number().optional(),
  duration_s: z.number().int().min(60).max(14400).optional(),
}).strict().refine(
  (b) => b.enabled !== undefined || b.threshold !== undefined || b.duration_s !== undefined,
  "enabled, threshold or duration_s required");

const alertsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().default(2 ** 31),
  before_id: z.coerce.number().int().optional(),
});

const commandBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), params: z.object({}).optional() }),
  z.object({ type: z.literal("restart"), params: z.object({}).optional() }),
  z.object({ type: z.literal("rollback"), params: z.object({}).optional() }),
  z.object({
    type: z.literal("config"),
    params: z.record(z.string().min(1).max(15), z.number())
      .refine((p) => Object.keys(p).length > 0, "at least one parameter"),
  }),
  z.object({
    type: z.literal("geohash"),
    params: z.object({ geohash: z.string().regex(/^[0-9b-hjkmnp-z]{1,12}$/, "invalid geohash") }),
  }),
  z.object({ type: z.literal("ota"), params: z.object({ version: z.string().regex(VERSION_RE) }) }),
  z.object({
    type: z.literal("wifi"),
    params: z.union([
      z.object({ reset: z.literal(true) }).strict(),
      z.object({
        ssid: z.string().min(1).max(32),
        eap_username: z.string().min(1).max(64),
        eap_password: z.string().min(1).max(64),
        eap_identity: z.string().max(64).optional(),
      }).strict(),
      z.object({
        ssid: z.string().min(1).max(32),
        password: z.string().max(63)
          .refine((p) => p.length === 0 || p.length >= 8, "WPA2 password: 8 to 63 characters, or empty for an open network"),
      }).strict(),
    ]),
  }),
]);

interface DeviceDbRow {
  id: string; name: string; created_at: number; last_seen: number | null;
  status_json: string | null; status_at: number | null;
  snd_ref: number | null; db_ref: number | null;
}

interface FrameDbRow extends Omit<FrameRow, "ts_estimated" | "stale"> {
  ts_estimated: number; stale: number;
}

const toFrame = (r: FrameDbRow): FrameRow => ({ ...r, ts_estimated: !!r.ts_estimated, stale: !!r.stale });

// Params go back to the browser redacted: Wi-Fi passwords never leave the server.
function toCommand(r: Omit<CommandRow, "params"> & { params_json: string }): CommandRow {
  const { params_json, ...rest } = r;
  return { ...rest, params: redactParams(JSON.parse(params_json)) };
}

export function appRoutes(app: FastifyInstance, db: Db, cfg: Config, firmware: FirmwareStore) {
  function summary(d: DeviceDbRow): DeviceSummary {
    const latest = get<FrameDbRow>(db,
      `SELECT ts, ts_estimated, geohash, snd, co2, pm25, hum, temp, stale
       FROM frames WHERE device_id = ? ORDER BY ts DESC LIMIT 1`, d.id);
    return {
      id: d.id,
      name: d.name,
      created_at: d.created_at,
      last_seen: d.last_seen,
      online: d.last_seen !== null && now() - d.last_seen < ONLINE_WINDOW_S,
      status: d.status_json ? JSON.parse(d.status_json) : null,
      status_at: d.status_at,
      latest: latest ? toFrame(latest) : null,
      sound_calibration: d.snd_ref !== null && d.db_ref !== null
        ? { snd_ref: d.snd_ref, db_ref: d.db_ref } : null,
      open_alerts: get<{ n: number }>(db,
        "SELECT COUNT(*) AS n FROM alerts WHERE device_id = ? AND ended_at IS NULL", d.id)!.n,
    };
  }

  function findDevice(id: string) {
    return get<DeviceDbRow>(db,
      "SELECT id, name, created_at, last_seen, status_json, status_at, snd_ref, db_ref FROM devices WHERE id = ?", id);
  }

  app.register(async (scope) => {
    scope.addHook("preHandler", requireAdmin);

    // ---- devices

    scope.get("/api/v1/devices", async () => ({
      devices: all<DeviceDbRow>(db,
        "SELECT id, name, created_at, last_seen, status_json, status_at, snd_ref, db_ref FROM devices ORDER BY name")
        .map(summary),
      unknown: all<UnknownDevice>(db,
        "SELECT * FROM unknown_devices ORDER BY last_seen DESC LIMIT 20"),
    }));

    // ---- alerts

    scope.get("/api/v1/alert-rules", async () => ({ rules: readRules(db) }));

    scope.post("/api/v1/alert-rules/reset", async () => {
      for (const kind of ALERT_KINDS) {
        const d = CATALOG[kind].defaults;
        run(db, "UPDATE alert_rules SET enabled = ?, threshold = ?, duration_s = ? WHERE kind = ?",
          d.enabled ? 1 : 0, d.threshold, d.duration_s, kind);
      }
      return { rules: readRules(db) };
    });

    scope.patch<{ Params: { kind: string } }>("/api/v1/alert-rules/:kind", async (request, reply) => {
      const kind = ALERT_KINDS.find((k) => k === request.params.kind);
      if (!kind) return reply.code(404).send({ error: "unknown alert kind" });
      const body = ruleBody.safeParse(request.body);
      if (!body.success) return reply.code(422).send({ error: body.error.issues[0]?.message });
      const c = CATALOG[kind];
      if (body.data.threshold !== undefined) {
        if (c.metric === null) return reply.code(422).send({ error: "this alert has no threshold" });
        if (body.data.threshold < c.min || body.data.threshold > c.max) {
          return reply.code(422).send({ error: `threshold must be between ${c.min} and ${c.max}` });
        }
      }
      const sets: string[] = [];
      const args: SQLInputValue[] = [];
      if (body.data.enabled !== undefined) { sets.push("enabled = ?"); args.push(body.data.enabled ? 1 : 0); }
      if (body.data.threshold !== undefined) { sets.push("threshold = ?"); args.push(body.data.threshold); }
      if (body.data.duration_s !== undefined) { sets.push("duration_s = ?"); args.push(body.data.duration_s); }
      run(db, `UPDATE alert_rules SET ${sets.join(", ")} WHERE kind = ?`, ...args, kind);
      return readRules(db).find((r) => r.kind === kind);
    });

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/alerts", async (request, reply) => {
      if (!findDevice(request.params.id)) return reply.code(404).send({ error: "unknown device" });
      const q = alertsQuery.safeParse(request.query);
      if (!q.success) return reply.code(422).send({ error: q.error.issues[0]?.message });
      const cols = `id, kind, threshold, started_at, ended_at, start_value, peak_value, end_value, end_reason`;
      return {
        open: all<AlertDbRow>(db,
          `SELECT ${cols} FROM alerts WHERE device_id = ? AND ended_at IS NULL ORDER BY started_at DESC`,
          request.params.id).map(toAlertRow),
        history: all<AlertDbRow>(db,
          `SELECT ${cols} FROM alerts WHERE device_id = ? AND ended_at IS NOT NULL
             AND (started_at < ? OR (? IS NOT NULL AND started_at = ? AND id < ?))
           ORDER BY started_at DESC, id DESC LIMIT ?`,
          request.params.id, q.data.before, q.data.before_id ?? null, q.data.before, q.data.before_id ?? null,
          q.data.limit).map(toAlertRow),
      };
    });

    scope.post("/api/v1/devices", async (request, reply) => {
      const body = z.object({
        id: z.string().trim().toUpperCase().transform((s) => s.replace(/^AQA-/, "aqa-"))
          .pipe(z.string().regex(DEVICE_ID_RE, "id must look like aqa-24A160B3C8F0")),
        name: z.string().trim().min(1).max(60),
      }).safeParse(request.body);
      if (!body.success) return reply.code(422).send({ error: body.error.issues[0]?.message });
      if (findDevice(body.data.id)) return reply.code(409).send({ error: "device already registered" });
      const token = newDeviceToken();
      run(db, "INSERT INTO devices (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)",
          body.data.id, body.data.name, sha256Hex(token), now());
      run(db, "DELETE FROM unknown_devices WHERE id = ?", body.data.id);
      // The token is only ever shown here; the database keeps its hash.
      return reply.code(201).send({ device: summary(findDevice(body.data.id)!), token });
    });

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id", async (request, reply) => {
      const d = findDevice(request.params.id);
      return d ? summary(d) : reply.code(404).send({ error: "unknown device" });
    });

    scope.patch<{ Params: { id: string } }>("/api/v1/devices/:id", async (request, reply) => {
      const body = patchBody.safeParse(request.body);
      if (!body.success) return reply.code(422).send({ error: body.error.issues[0]?.message });
      const sets: string[] = [];
      const args: SQLInputValue[] = [];
      if (body.data.name !== undefined) {
        sets.push("name = ?");
        args.push(body.data.name);
      }
      if (body.data.sound_calibration !== undefined) {
        const cal = body.data.sound_calibration;
        sets.push("snd_ref = ?", "db_ref = ?");
        args.push(cal?.snd_ref ?? null, cal?.db_ref ?? null);
      }
      const res = run(db, `UPDATE devices SET ${sets.join(", ")} WHERE id = ?`, ...args, request.params.id);
      if (res.changes === 0) return reply.code(404).send({ error: "unknown device" });
      return summary(findDevice(request.params.id)!);
    });

    scope.post<{ Params: { id: string } }>("/api/v1/devices/:id/token", async (request, reply) => {
      const token = newDeviceToken();
      const res = run(db, "UPDATE devices SET token_hash = ? WHERE id = ?", sha256Hex(token), request.params.id);
      if (res.changes === 0) return reply.code(404).send({ error: "unknown device" });
      return { token };
    });

    scope.delete<{ Params: { id: string } }>("/api/v1/devices/:id", async (request, reply) => {
      const res = run(db, "DELETE FROM devices WHERE id = ?", request.params.id);
      if (res.changes === 0) return reply.code(404).send({ error: "unknown device" });
      return reply.code(204).send();
    });

    scope.delete<{ Params: { id: string } }>("/api/v1/unknown-devices/:id", async (request, reply) => {
      run(db, "DELETE FROM unknown_devices WHERE id = ?", request.params.id);
      return reply.code(204).send();
    });

    // ---- data

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/frames", async (request, reply) => {
      const q = rangeQuery.extend({
        limit: z.coerce.number().int().min(1).max(50000).default(10000),
      }).safeParse(request.query);
      if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message });
      const rows = all<FrameDbRow>(db,
        `SELECT ts, ts_estimated, geohash, snd, co2, pm25, hum, temp, stale FROM frames
         WHERE device_id = ? AND ts BETWEEN ? AND ? ORDER BY ts LIMIT ?`,
        request.params.id, q.data.from, q.data.to, q.data.limit);
      return { frames: rows.map(toFrame) };
    });

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/frames/aggregate", async (request, reply) => {
      const q = rangeQuery.extend({
        step: z.coerce.number().int().refine((s) => AGGREGATE_STEPS.includes(s),
          `step must be one of ${AGGREGATE_STEPS.join(", ")}`),
      }).safeParse(request.query);
      if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message });
      const { step, from, to } = q.data;
      const buckets = aggregateRows(db, request.params.id, from, to, step);
      return { step, buckets };
    });

    // ---- bilan

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/report", async (request, reply) => {
      const d = findDevice(request.params.id);
      if (!d) return reply.code(404).send({ error: "unknown device" });
      const q = reportQuery.safeParse(request.query);
      if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message });
      const { from, to, kind, tz } = q.data;
      const prevFrom = q.data.prev_from ?? Math.max(0, from - (to - from));
      const alertKinds = (lo: number, hi: number) => all<{ kind: AlertKind }>(db,
        "SELECT kind FROM alerts WHERE device_id = ? AND started_at >= ? AND started_at < ?", d.id, lo, hi)
        .map((a) => a.kind);
      return buildReport({
        deviceId: d.id, kind, tz, from, to, prevFrom, now: now(), step: REPORT_STEP,
        firstTs: get<{ ts: number | null }>(db, "SELECT MIN(ts) AS ts FROM frames WHERE device_id = ?", d.id)!.ts,
        cal: d.snd_ref !== null && d.db_ref !== null ? { snd_ref: d.snd_ref, db_ref: d.db_ref } : null,
        current: aggregateRows(db, d.id, from, to - 1, REPORT_STEP),
        previous: aggregateRows(db, d.id, prevFrom, from - 1, REPORT_STEP),
        alerts: { current: alertKinds(from, to), previous: alertKinds(prevFrom, from) },
      });
    });

    // ---- journal

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/events", async (request, reply) => {
      const q = z.object({
        limit: z.coerce.number().int().min(1).max(1000).default(200),
        before: z.coerce.number().int().optional(),
      }).safeParse(request.query);
      if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message });
      const rows = all<EventRow>(db,
        `SELECT id, ts, kind, level, message FROM events
         WHERE device_id = ? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`,
        request.params.id, q.data.before ?? null, q.data.before ?? null, q.data.limit);
      return { events: rows };
    });

    // ---- commands

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/commands", async (request) => ({
      commands: all<Omit<CommandRow, "params"> & { params_json: string }>(db,
        `SELECT id, type, params_json, state, progress, detail, created_at, sent_at, updated_at
         FROM commands WHERE device_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50`,
        request.params.id).map(toCommand),
    }));

    scope.post<{ Params: { id: string } }>("/api/v1/devices/:id/commands", async (request, reply) => {
      const p = deviceIdParam.safeParse(request.params);
      if (!p.success || !findDevice(p.data.id)) return reply.code(404).send({ error: "unknown device" });
      const body = commandBody.safeParse(request.body);
      if (!body.success) {
        const issue = body.error.issues[0];
        return reply.code(422).send({ error: `${issue?.path.join(".") || "body"}: ${issue?.message}` });
      }
      let params: Record<string, unknown> = body.data.params ?? {};
      if (body.data.type === "ota") {
        const { version } = body.data.params;
        if (!firmware.exists(version)) return reply.code(422).send({ error: `no firmware ${version}` });
        params = { version, ...firmware.signedUrls(cfg.PUBLIC_URL, version, now()) };
      }
      const id = crypto.randomBytes(8).toString("hex");
      const t = now();
      run(db, `INSERT INTO commands (id, device_id, type, params_json, state, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
          id, p.data.id, body.data.type, JSON.stringify(params), t, t);
      logEvent(db, p.data.id, t, "command", "info", `Commande ${body.data.type} envoyée`);
      const row = get<Omit<CommandRow, "params"> & { params_json: string }>(db,
        `SELECT id, type, params_json, state, progress, detail, created_at, sent_at, updated_at
         FROM commands WHERE id = ?`, id)!;
      return reply.code(201).send(toCommand(row));
    });

    scope.delete<{ Params: { id: string; cid: string } }>("/api/v1/devices/:id/commands/:cid",
      async (request, reply) => {
        // Only a command the board has not received yet can be withdrawn.
        const res = run(db, "DELETE FROM commands WHERE id = ? AND device_id = ? AND state = 'pending'",
                        request.params.cid, request.params.id);
        if (res.changes === 0) return reply.code(409).send({ error: "only pending commands can be cancelled" });
        return reply.code(204).send();
      });

    // ---- firmware

    scope.get("/api/v1/firmware", async () => ({ firmware: firmware.list() }));

    scope.post("/api/v1/firmware", async (request, reply) => {
      let version = "";
      let bin: Buffer | null = null;
      let sig: Buffer | null = null;
      for await (const part of request.parts()) {
        if (part.type === "file") {
          const buf = await part.toBuffer();
          if (part.fieldname === "firmware") bin = buf;
          else if (part.fieldname === "signature") sig = buf;
        } else if (part.fieldname === "version") {
          version = String(part.value).trim();
        }
      }
      if (!VERSION_RE.test(version)) return reply.code(422).send({ error: "version: letters, digits, . _ - (max 32)" });
      if (!bin || bin.length < 1024) return reply.code(422).send({ error: "firmware: missing or too small" });
      if (bin[0] !== 0xe9) return reply.code(422).send({ error: "firmware: not an ESP32 image (bad magic byte)" });
      if (!sig || sig.length === 0 || sig.length > 1024) return reply.code(422).send({ error: "signature: missing or invalid size" });
      firmware.save(version, bin, sig);
      return reply.code(201).send({ version, size: bin.length });
    });

    scope.delete<{ Params: { version: string } }>("/api/v1/firmware/:version", async (request, reply) => {
      if (!firmware.exists(request.params.version)) return reply.code(404).send({ error: "unknown version" });
      firmware.remove(request.params.version);
      return reply.code(204).send();
    });
  });

  // Firmware download for boards: no session, but a signed, expiring link.
  app.get<{ Params: { version: string; file: string }; Querystring: { exp?: string; sig?: string } }>(
    "/firmware/:version/:file", async (request, reply) => {
      const { version, file } = request.params;
      const kind = file === "firmware.bin" ? "bin" : file === "firmware.sig" ? "sig" : null;
      if (!kind || !VERSION_RE.test(version) || !firmware.exists(version) ||
          !firmware.verifyLink(version, request.query.exp, request.query.sig, now())) {
        return reply.code(404).send({ error: "not found" });
      }
      // The image embeds Wi-Fi credentials: no shared cache (Cloudflare) may keep it.
      reply.header("Cache-Control", "private, no-store");
      return reply.sendFile(`${version}/${file}`, firmware.dir, { cacheControl: false });
    });
}
