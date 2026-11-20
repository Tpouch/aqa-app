import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { safeEqual, SESSION_COOKIE, SESSION_TTL_S } from "../auth.js";
import type { Config } from "../config.js";

export function sessionRoutes(app: FastifyInstance, cfg: Config) {
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: cfg.secureCookies,
  };

  app.post("/api/v1/session", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const body = z.object({ password: z.string() }).safeParse(request.body);
    if (!body.success || !safeEqual(body.data.password, cfg.ADMIN_PASSWORD)) {
      return reply.code(401).send({ error: "wrong password" });
    }
    const token = await reply.jwtSign({ role: "admin" }, { expiresIn: SESSION_TTL_S });
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_S });
    return { authenticated: true };
  });

  app.delete("/api/v1/session", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return { authenticated: false };
  });

  app.get("/api/v1/session", async (request) => {
    try {
      await request.jwtVerify();
      return { authenticated: true };
    } catch {
      return { authenticated: false };
    }
  });
}
