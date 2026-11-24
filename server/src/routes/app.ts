// Routes used by the web UI. All require the admin session cookie, except the
// routes flagged `agent: true` (the read routes and the webhook ones), which
// also accept an API key.
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DEVICE_ID_RE, newDeviceToken, requireAdminOrKey, sha256Hex } from "../auth.js";
import type { Config } from "../config.js";
import { CATALOG, readRules, toAlertRow, type AlertDbRow } from "../alerts.js";
import { createKey, deleteKey, listKeys } from "../apikeys.js";
import { all, get, now, run, type Db } from "../db.js";
import type { SQLInputValue } from "node:sqlite";
import { logEvent, redactParams } from "../events.js";
import { FirmwareStore, tokenCandidates, VERSION_RE } from "../firmware.js";
import { isTimeZone } from "../localtime.js";
import {
  AGGREGATE_STEPS, aggregateRows, deviceReport, deviceSummary, findDevice, listDeviceRows,
  toFrame, type FrameDbRow,
} from "../queries.js";
import { readNotify, TEST_MESSAGE, type Notifier } from "../notify.js";
import { ALERT_KINDS } from "../types.js";
import { hostAllowed, readWebhook, testPayload, type Webhook } from "../webhook.js";
import type {
  CommandRow, EventRow, FirmwareRow, UnknownDevice,
} from "../types.js";

const deviceIdParam = z.object({ id: z.string().regex(DEVICE_ID_RE, "id must look like aqa-24A160B3C8F0") });
const rangeQuery = z.object({
  from: z.coerce.number().int().nonnegative().default(0),
  to: z.coerce.number().int().nonnegative().default(2 ** 31),
});

const MAX_REPORT_S = 32 * 86400;
const reportQuery = z.object({
  from: z.coerce.number().int().nonnegative().max(2 ** 31),
  to: z.coerce.number().int().nonnegative().max(2 ** 31),
  prev_from: z.coerce.number().int().nonnegative().max(2 ** 31).optional(),
  kind: z.enum(["week", "month", "custom"]).default("custom"),
  tz: z.string().default(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    .refine(isTimeZone, "tz must be an IANA time zone such as Europe/Paris"),
}).refine((q) => q.to > q.from, "to must be after from")
  .refine((q) => q.to - q.from <= MAX_REPORT_S, "the period must not exceed 32 days")
  .refine((q) => q.prev_from === undefined || q.prev_from < q.from, "prev_from must be before from")
  .refine((q) => q.prev_from === undefined || q.from - q.prev_from <= MAX_REPORT_S,
    "the previous period must not exceed 32 days");

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

const notifyBody = z.object({
  enabled: z.boolean().optional(),
  server: z.string().trim().max(200).pipe(z.url({ protocol: /^https?$/, error: "server must be an http(s) URL" }))
    .transform((u) => u.replace(/\/+$/, "")).optional(),
  // ntfy's own rule for topic names; empty = not configured.
  topic: z.string().trim().regex(/^[-_A-Za-z0-9]{0,64}$/, "topic: letters, digits, - and _ (max 64)").optional(),
  token: z.string().trim().min(1).max(200).nullable().optional(),
  notify_close: z.boolean().optional(),
}).strict().refine((b) => Object.keys(b).length > 0, "nothing to update");

const webhookBody = z.object({
  enabled: z.boolean().optional(),
  url: z.string().trim().max(500).pipe(z.url({ protocol: /^https?$/, error: "url must be an http(s) URL" })).optional(),
  secret: z.string().min(16, "secret: 16 to 200 characters").max(200, "secret: 16 to 200 characters").nullable().optional(),
  notify_close: z.boolean().optional(),
}).strict().refine((b) => Object.keys(b).length > 0, "nothing to update");

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

// Params go back to the browser redacted: Wi-Fi passwords never leave the server.
function toCommand(r: Omit<CommandRow, "params"> & { params_json: string }): CommandRow {
  const { params_json, ...rest } = r;
  return { ...rest, params: redactParams(JSON.parse(params_json)) };
}

export function appRoutes(app: FastifyInstance, db: Db, cfg: Config, firmware: FirmwareStore, notifier: Notifier, webhook: Webhook) {
  app.register(async (scope) => {
    scope.addHook("preHandler", requireAdminOrKey(db));

    // ---- devices

    scope.get("/api/v1/devices", { config: { agent: true }, onRequest: app.agentRateLimit }, async () => ({
      devices: listDeviceRows(db).map((d) => deviceSummary(db, d)),
      unknown: all<UnknownDevice>(db,
        "SELECT * FROM unknown_devices ORDER BY last_seen DESC LIMIT 20"),
    }));

    // ---- alerts

    scope.get("/api/v1/alert-rules", { config: { agent: true }, onRequest: app.agentRateLimit }, async () => ({ rules: readRules(db) }));

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

    // ---- API keys (session only: a key can never manage keys)

    scope.get("/api/v1/api-keys", async () => ({ keys: listKeys(db) }));

    scope.post("/api/v1/api-keys", async (request, reply) => {
      const body = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(request.body);
      if (!body.success) return reply.code(422).send({ error: "name: 1 to 60 characters" });
      const { key, row } = createKey(db, body.data.name);
      // The key is only ever shown here; the database keeps its hash.
      return reply.code(201).send({ ...row, key });
    });

    scope.delete<{ Params: { id: string } }>("/api/v1/api-keys/:id", async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || !deleteKey(db, id)) return reply.code(404).send({ error: "unknown key" });
      return reply.code(204).send();
    });

    // ---- notifications (ntfy)

    scope.get("/api/v1/notify", async () => readNotify(db));

    scope.patch("/api/v1/notify", async (request, reply) => {
      const body = notifyBody.safeParse(request.body);
      if (!body.success) return reply.code(422).send({ error: body.error.issues[0]?.message });
      const cur = readNotify(db);
      const b = body.data;
      if ((b.enabled ?? cur.enabled) && !(b.topic ?? cur.topic)) {
        return reply.code(422).send({ error: "a topic is required to enable notifications" });
      }
      const sets: string[] = [];
      const args: SQLInputValue[] = [];
      if (b.enabled !== undefined) { sets.push("enabled = ?"); args.push(b.enabled ? 1 : 0); }
      if (b.server !== undefined) { sets.push("server = ?"); args.push(b.server); }
      if (b.topic !== undefined) { sets.push("topic = ?"); args.push(b.topic); }
      if (b.token !== undefined) { sets.push("token = ?"); args.push(b.token); }
      if (b.notify_close !== undefined) { sets.push("notify_close = ?"); args.push(b.notify_close ? 1 : 0); }
      run(db, `UPDATE notify SET ${sets.join(", ")} WHERE id = 1`, ...args);
      return readNotify(db);
    });

    // Sends with the saved settings, even when notifications are off, and
    // waits for ntfy's answer (5 s at most).
    scope.post("/api/v1/notify/test", async (_request, reply) => {
      if (!readNotify(db).topic) return reply.code(422).send({ error: "no topic configured" });
      await notifier.publish(TEST_MESSAGE);
      return readNotify(db);
    });

    // ---- outgoing webhook: keys may only read (coarse error), writes and tests are session-only

    const view = (request: { apiKeyId: number | null }) =>
      readWebhook(db, { coarse: request.apiKeyId !== null, allowedHosts: cfg.WEBHOOK_ALLOWED_HOSTS });

    scope.get("/api/v1/webhook", { config: { agent: true }, onRequest: app.agentRateLimit }, async (request) => view(request));

    scope.patch("/api/v1/webhook", async (request, reply) => {
      const body = webhookBody.safeParse(request.body);
      if (!body.success) return reply.code(422).send({ error: body.error.issues[0]?.message });
      const b = body.data;
      const cur = readWebhook(db);
      const hasSecret = b.secret !== undefined ? b.secret !== null : cur.secret_set;
      // Removing the secret switches the webhook off, unless the same call asks to enable it (then 422 below).
      const enabled = b.enabled ?? (b.secret === null ? false : cur.enabled);
      const url = b.url ?? cur.url;
      // A new URL must be allowed; so must the merged URL whenever the webhook ends up enabled.
      if ((b.url !== undefined || enabled) && !hostAllowed(url, cfg.WEBHOOK_ALLOWED_HOSTS)) {
        return reply.code(422).send({ error: "the webhook host must be listed in WEBHOOK_ALLOWED_HOSTS" });
      }
      if (enabled && (!url || !hasSecret)) {
        return reply.code(422).send({ error: "a URL and a secret are required to enable the webhook" });
      }
      const sets: string[] = [];
      const args: SQLInputValue[] = [];
      // Removing the secret always switches the webhook off.
      if (b.enabled !== undefined || b.secret === null) { sets.push("enabled = ?"); args.push(enabled ? 1 : 0); }
      if (b.url !== undefined) { sets.push("url = ?"); args.push(b.url); }
      if (b.secret !== undefined) { sets.push("secret = ?"); args.push(b.secret); }
      if (b.notify_close !== undefined) { sets.push("notify_close = ?"); args.push(b.notify_close ? 1 : 0); }
      run(db, `UPDATE webhook SET ${sets.join(", ")} WHERE id = 1`, ...args);
      return view(request);
    });

    // Sends a test event with the saved settings, even when the webhook is off,
    // and waits for the answer (5 s at most).
    scope.post("/api/v1/webhook/test", async (request, reply) => {
      const cur = readWebhook(db);
      if (!cur.url || !cur.secret_set) {
        return reply.code(422).send({ error: "a URL and a secret are required to send a test" });
      }
      await webhook.send(testPayload(cfg.PUBLIC_URL, now()));
      return view(request);
    });

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/alerts", { config: { agent: true }, onRequest: app.agentRateLimit }, async (request, reply) => {
      if (!findDevice(db, request.params.id)) return reply.code(404).send({ error: "unknown device" });
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
      if (findDevice(db, body.data.id)) return reply.code(409).send({ error: "device already registered" });
      const token = newDeviceToken();
      run(db, "INSERT INTO devices (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)",
          body.data.id, body.data.name, sha256Hex(token), now());
      run(db, "DELETE FROM unknown_devices WHERE id = ?", body.data.id);
      // The token is only ever shown here; the database keeps its hash.
      return reply.code(201).send({ device: deviceSummary(db, findDevice(db, body.data.id)!), token });
    });

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id", { config: { agent: true }, onRequest: app.agentRateLimit }, async (request, reply) => {
      const d = findDevice(db, request.params.id);
      return d ? deviceSummary(db, d) : reply.code(404).send({ error: "unknown device" });
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
      return deviceSummary(db, findDevice(db, request.params.id)!);
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

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/frames", { config: { agent: true }, onRequest: app.agentRateLimit }, async (request, reply) => {
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

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/frames/aggregate", { config: { agent: true }, onRequest: app.agentRateLimit }, async (request, reply) => {
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

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/report", { config: { agent: true }, onRequest: app.agentRateLimit }, async (request, reply) => {
      const d = findDevice(db, request.params.id);
      if (!d) return reply.code(404).send({ error: "unknown device" });
      const q = reportQuery.safeParse(request.query);
      if (!q.success) return reply.code(400).send({ error: q.error.issues[0]?.message });
      const { from, to, kind, tz } = q.data;
      const prevFrom = q.data.prev_from ?? Math.max(0, from - (to - from));
      return deviceReport(db, d, { from, to, prevFrom, kind, tz, now: now() });
    });

    // ---- journal

    scope.get<{ Params: { id: string } }>("/api/v1/devices/:id/events", { config: { agent: true }, onRequest: app.agentRateLimit }, async (request, reply) => {
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
      if (!p.success || !findDevice(db, p.data.id)) return reply.code(404).send({ error: "unknown device" });
      const body = commandBody.safeParse(request.body);
      if (!body.success) {
        const issue = body.error.issues[0];
        return reply.code(422).send({ error: `${issue?.path.join(".") || "body"}: ${issue?.message}` });
      }
      let params: Record<string, unknown> = body.data.params ?? {};
      if (body.data.type === "ota") {
        const { version } = body.data.params;
        if (!firmware.exists(version)) return reply.code(422).send({ error: `no firmware ${version}` });
        // The image carries its board's token: on any other board it would be refused by the server for good.
        const owner = ownerOf(firmware.tokenHashes(version));
        if (!owner) {
          return reply.code(422).send({ error: `${version} ne contient le jeton d'aucune carte (jeton changé depuis la compilation ?).` });
        }
        if (owner.id !== p.data.id) {
          const target = findDevice(db, p.data.id)!;
          return reply.code(422).send({ error: `${version} a été compilée pour ${owner.name}, pas pour ${target.name}.` });
        }
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

    // Board whose token hash is among the image's token candidates.
    function ownerOf(hashes: Set<string>): { id: string; name: string } | null {
      const boards = all<{ id: string; name: string; token_hash: string }>(db, "SELECT id, name, token_hash FROM devices");
      const b = boards.find((d) => hashes.has(d.token_hash));
      return b ? { id: b.id, name: b.name } : null;
    }

    scope.get("/api/v1/firmware", async () => ({
      firmware: firmware.list().map((f): FirmwareRow => {
        const owner = ownerOf(firmware.tokenHashes(f.version));
        return { ...f, device_id: owner?.id ?? null, device_name: owner?.name ?? null };
      }),
    }));

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
      const owner = ownerOf(tokenCandidates(bin));
      if (firmware.exists(version)) {
        const current = ownerOf(firmware.tokenHashes(version));
        if (current && current.id !== owner?.id) {
          const suffix = owner ? owner.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "2" : "2";
          return reply.code(409).send({
            error: `${version} existe déjà pour ${current.name} : choisis un autre numéro (par ex. ${version}-${suffix}).`,
          });
        }
      }
      firmware.save(version, bin, sig);
      return reply.code(201).send({ version, size: bin.length, device_id: owner?.id ?? null, device_name: owner?.name ?? null });
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
