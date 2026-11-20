// Routes called by the boards. Contract: EPITECH_ESP32/docs/api.md §2-3.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { bearerToken, DEVICE_ID_RE, safeEqual, sha256Hex } from "../auth.js";
import { all, get, now, run, tx, type Db } from "../db.js";

const RESEND_AFTER_S = 600; // re-deliver a "sent" command never acked
const MAX_COMMANDS_PER_RESPONSE = 5;

const nullableInt = z.number().int().nullable().optional();
const nullableNum = z.number().nullable().optional();

const frameSchema = z.object({
  t: z.number().int().nonnegative().nullable(),
  age_s: z.number().int().nonnegative(),
  snd: nullableInt,
  co2: nullableInt,
  pm25: nullableInt,
  hum: nullableNum,
  temp: nullableNum,
  stale: z.boolean().optional().default(false),
});

const framesBody = z.object({
  geohash: z.string().max(16).optional(),
  frames: z.array(frameSchema).min(1).max(100),
});

const statusBody = z.object({
  boot_count: z.number().int(),
  firmware_version: z.string().max(32),
}).loose();

const ackBody = z.object({
  status: z.enum(["in_progress", "completed", "failed"]),
  progress: z.number().int().min(0).max(100).optional().default(0),
  detail: z.string().max(500).nullable().optional(),
});

type DeviceRequest = FastifyRequest<{ Params: { id: string; cid?: string } }>;

export function deviceRoutes(app: FastifyInstance, db: Db) {
  // Authenticates the board: the bearer token must match the id in the URL.
  async function authenticate(request: DeviceRequest, reply: FastifyReply) {
    const { id } = request.params;
    if (!DEVICE_ID_RE.test(id)) {
      return reply.code(404).send({ error: "unknown device id format" });
    }
    const token = bearerToken(request);
    const device = get<{ token_hash: string }>(db, "SELECT token_hash FROM devices WHERE id = ?", id);
    if (!device) {
      const t = now();
      run(db, `INSERT INTO unknown_devices (id, first_seen, last_seen, ip) VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, ip = excluded.ip`,
          id, t, t, request.ip);
      return reply.code(401).send({ error: "device not registered" });
    }
    if (!token || !safeEqual(sha256Hex(token), device.token_hash)) {
      return reply.code(401).send({ error: "invalid token" });
    }
    run(db, "UPDATE devices SET last_seen = ? WHERE id = ?", now(), id);
  }

  function deliverableCommands(deviceId: string) {
    const t = now();
    return tx(db, () => {
      const rows = all<{ id: string; type: string; params_json: string }>(db,
        `SELECT id, type, params_json FROM commands
         WHERE device_id = ? AND (state = 'pending' OR (state = 'sent' AND sent_at < ?))
         ORDER BY created_at LIMIT ?`,
        deviceId, t - RESEND_AFTER_S, MAX_COMMANDS_PER_RESPONSE);
      for (const r of rows) {
        run(db, "UPDATE commands SET state = 'sent', sent_at = ?, updated_at = ? WHERE id = ?", t, t, r.id);
      }
      return rows.map((r) => ({ id: r.id, type: r.type, params: JSON.parse(r.params_json) }));
    });
  }

  const rateLimit = {
    max: 240,
    timeWindow: "1 minute",
    keyGenerator: (req: FastifyRequest) => (req.params as { id?: string }).id ?? req.ip,
  };

  app.post<{ Params: { id: string } }>("/api/v1/devices/:id/status",
    { preHandler: authenticate, config: { rateLimit } },
    async (request, reply) => {
      const body = statusBody.safeParse(request.body);
      if (!body.success) return reply.code(422).send({ error: body.error.issues[0]?.message });
      const { id } = request.params;
      run(db, "UPDATE devices SET status_json = ?, status_at = ? WHERE id = ?",
          JSON.stringify(body.data), now(), id);
      return { commands: deliverableCommands(id) };
    });

  app.post<{ Params: { id: string } }>("/api/v1/devices/:id/frames",
    { preHandler: authenticate, config: { rateLimit } },
    async (request, reply) => {
      const body = framesBody.safeParse(request.body);
      if (!body.success) {
        const issue = body.error.issues[0];
        return reply.code(422).send({ error: `${issue?.path.join(".")}: ${issue?.message}` });
      }
      const { id } = request.params;
      const received = now();
      const insert = db.prepare(
        `INSERT OR IGNORE INTO frames
         (device_id, ts, ts_estimated, geohash, snd, co2, pm25, hum, temp, stale, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const inserted = tx(db, () => {
        let n = 0;
        for (const f of body.data.frames) {
          const exact = f.t !== null && f.t > 0;
          const ts = exact ? f.t! : received - f.age_s;
          n += Number(insert.run(id, ts, exact ? 0 : 1, body.data.geohash ?? null,
            f.snd ?? null, f.co2 ?? null, f.pm25 ?? null, f.hum ?? null, f.temp ?? null,
            f.stale ? 1 : 0, received).changes);
        }
        return n;
      });
      request.log.debug({ device: id, received: body.data.frames.length, inserted }, "frames");
      return { accepted: body.data.frames.length, commands: deliverableCommands(id) };
    });

  app.post<{ Params: { id: string; cid: string } }>("/api/v1/devices/:id/commands/:cid/ack",
    { preHandler: authenticate, config: { rateLimit } },
    async (request, reply) => {
      const body = ackBody.safeParse(request.body);
      if (!body.success) return reply.code(422).send({ error: body.error.issues[0]?.message });
      const { id, cid } = request.params;
      const res = run(db,
        `UPDATE commands SET state = ?, progress = ?, detail = ?, updated_at = ?
         WHERE id = ? AND device_id = ?`,
        body.data.status, body.data.progress, body.data.detail ?? null, now(), cid, id);
      if (res.changes === 0) return reply.code(404).send({ error: "unknown command" });
      return reply.code(204).send();
    });
}
