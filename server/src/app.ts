import fs from "node:fs";
import path from "node:path";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { SESSION_COOKIE } from "./auth.js";
import type { Config } from "./config.js";
import { CHECK_EVERY_S, checkAlerts } from "./alerts.js";
import { now, openDb, run, type Db } from "./db.js";
import { FirmwareStore } from "./firmware.js";
import { Notifier } from "./notify.js";
import { appRoutes } from "./routes/app.js";
import { deviceRoutes } from "./routes/device.js";
import { sessionRoutes } from "./routes/session.js";

export interface Built {
  app: FastifyInstance;
  db: Db;
  firmware: FirmwareStore;
  notifier: Notifier;
}

export async function buildApp(cfg: Config, opts: { dataDir?: string } = {}): Promise<Built> {
  const dataDir = opts.dataDir ?? cfg.DATA_DIR;
  const db = openDb(dataDir);
  const firmware = new FirmwareStore(dataDir === ":memory:" ? fs.mkdtempSync("/tmp/aqa-fw-") : dataDir,
                                     cfg.SESSION_SECRET);

  const app = Fastify({
    logger: cfg.LOG_LEVEL === "silent" ? false : { level: cfg.LOG_LEVEL },
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: cfg.SESSION_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 2 } });
  // reply.sendFile for firmware downloads; the web app gets its own instance.
  await app.register(fastifyStatic, { root: firmware.dir, serve: false });

  const notifier = new Notifier(db, { publicUrl: cfg.PUBLIC_URL, log: app.log });

  app.get("/healthz", async () => ({ ok: true }));
  sessionRoutes(app, cfg);
  deviceRoutes(app, db);
  appRoutes(app, db, cfg, firmware, notifier);

  const webIndex = cfg.WEB_DIR ? path.join(cfg.WEB_DIR, "index.html") : "";
  if (webIndex && fs.existsSync(webIndex)) {
    await app.register(fastifyStatic, { root: cfg.WEB_DIR, decorateReply: false });
    // Client-side routing: unknown page paths get the SPA shell. Anything that
    // looks like a file (/assets/x.js) or an API path gets a real 404, so a
    // missing bundle never comes back as HTML.
    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split("?")[0]!;
      const isPage = !pathname.startsWith("/api/") && !pathname.startsWith("/firmware/") &&
                     !/\.[a-z0-9]+$/i.test(pathname);
      if (request.method === "GET" && isPage) {
        return reply.type("text/html").send(fs.createReadStream(webIndex));
      }
      return reply.code(404).send({ error: "not found" });
    });
  } else {
    app.log.warn(`no web build at ${cfg.WEB_DIR}; serving the API only`);
  }

  if (cfg.RETENTION_DAYS > 0) {
    const prune = () => {
      const res = run(db, "DELETE FROM frames WHERE ts < ?", now() - cfg.RETENTION_DAYS * 86400);
      if (res.changes) app.log.info({ deleted: res.changes }, "retention: old frames deleted");
    };
    const timer = setInterval(prune, 3600 * 1000);
    timer.unref();
    prune();
  }

  const serverStart = now();
  const alertTimer = setInterval(() => {
    try {
      // Sent after the commit, not awaited: a slow ntfy never delays detection.
      void notifier.alerts(checkAlerts(db, now(), serverStart));
    } catch (err) {
      app.log.error({ err }, "alerts check failed");
    }
  }, CHECK_EVERY_S * 1000);
  alertTimer.unref();

  app.addHook("onClose", async () => {
    clearInterval(alertTimer);
    db.close();
  });
  return { app, db, firmware, notifier };
}
