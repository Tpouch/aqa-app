import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest, onRequestHookHandler, preHandlerHookHandler } from "fastify";
import { KEY_PREFIX, useKey } from "./apikeys.js";
import type { Db } from "./db.js";

declare module "fastify" {
  interface FastifyContextConfig { agent?: boolean }
  interface FastifyRequest { apiKeyId: number | null }
  // One limiter shared by every agent route: 120 key requests / minute / IP in total.
  interface FastifyInstance { agentRateLimit: onRequestHookHandler }
}

export const SESSION_COOKIE = "aqa_session";
export const SESSION_TTL_S = 7 * 24 * 3600;
export const DEVICE_ID_RE = /^aqa-[0-9A-F]{12}$/;

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Constant-time comparison of two strings of any length.
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function newDeviceToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "login required" });
  }
}

export const isKeyRequest = (request: FastifyRequest): boolean =>
  bearerToken(request)?.startsWith(KEY_PREFIX) ?? false;

// Hooks of @fastify/rate-limit run before preHandler, so only the raw header can decide here.
export const AGENT_RATE_LIMIT = {
  max: 120,
  timeWindow: "1 minute",
  allowList: (request: FastifyRequest) => !isKeyRequest(request),
};

// Session cookie first (a stray Authorization header must never lock the admin out);
// otherwise an API key, but only on routes flagged `config: { agent: true }`.
export function requireAdminOrKey(db: Db): preHandlerHookHandler {
  return async (request, reply) => {
    try {
      // onlyCookie: by default @fastify/jwt prefers the Authorization header over the cookie.
      await request.jwtVerify({ onlyCookie: true });
      return;
    } catch {
      // not a valid session: fall through to the key path
    }
    if (request.routeOptions.config.agent) {
      const token = bearerToken(request);
      if (token?.startsWith(KEY_PREFIX)) {
        const id = useKey(db, token);
        if (id !== null) {
          request.apiKeyId = id;
          return;
        }
      }
    }
    return reply.code(401).send({ error: "login required" });
  };
}
