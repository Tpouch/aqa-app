import path from "node:path";
import { z } from "zod";

const schema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().default("./data"),
  // Single admin account for the web UI.
  ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters"),
  // Signs session cookies and firmware download links.
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // Public base URL, used to build OTA download links sent to the boards.
  PUBLIC_URL: z.string().url().default("https://sensor.devgoblin.fr"),
  // Delete frames older than this many days (0 = keep forever).
  RETENTION_DAYS: z.coerce.number().int().min(0).default(0),
  // Behind Cloudflare / a reverse proxy: trust X-Forwarded-For for client IPs.
  TRUST_PROXY: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  // Built React app; empty disables static serving (API only).
  WEB_DIR: z.string().default(path.resolve(import.meta.dirname, "../../web/dist")),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Config = z.infer<typeof schema> & { secureCookies: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const cfg = parsed.data;
  return {
    ...cfg,
    // Absolute paths: @fastify/static refuses a relative root, and the
    // working directory differs between `npm run dev`, `npm start` and Docker.
    DATA_DIR: cfg.DATA_DIR === ":memory:" ? cfg.DATA_DIR : path.resolve(cfg.DATA_DIR),
    WEB_DIR: cfg.WEB_DIR ? path.resolve(cfg.WEB_DIR) : "",
    PUBLIC_URL: cfg.PUBLIC_URL.replace(/\/+$/, ""),
    secureCookies: cfg.PUBLIC_URL.startsWith("https://"),
  };
}
