// Fills a running server with demo data: one board "démo", 7 days of frames
// (every 5 min, then every minute over the last day, every 15 s over the last 8 h).
// Usage: npx tsx --env-file=.env server/scripts/seed-demo.ts [baseUrl]
import { loadConfig } from "../src/config.js";

const cfg = loadConfig();
const base = (process.argv[2] ?? `http://localhost:${cfg.PORT}`).replace(/\/$/, "");
const DEVICE = "aqa-DE0000000001";
const DAY = 86400;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

async function call(path: string, init: RequestInit & { json?: unknown } = {}) {
  // No JSON content-type without a body: the server rejects an empty JSON body (400).
  const headers: Record<string, string> = {
    ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...(init.headers as object),
  };
  const res = await fetch(base + path, {
    ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (!res.ok && res.status !== 409) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res;
}

const login = await call("/api/v1/session", { method: "POST", json: { password: cfg.ADMIN_PASSWORD } });
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
const admin = { cookie };

const reg = await call("/api/v1/devices", { method: "POST", headers: admin, json: { id: DEVICE, name: "démo" } });
const tokenRes = reg.status === 409
  ? await call(`/api/v1/devices/${DEVICE}/token`, { method: "POST", headers: admin })
  : reg;
const token = ((await tokenRes.json()) as { token: string }).token;
const dev = { authorization: `Bearer ${token}` };

await call(`/api/v1/devices/${DEVICE}/status`, {
  method: "POST", headers: dev,
  json: {
    t: null, uptime_s: 3600, boot_count: 1, firmware_version: "2.0.0", hardware_version: 14,
    ip: "192.168.1.50", rssi: -58, ssid: "demo", geohash: "u09tvw", free_heap: 150000,
    sensors: { temperature: true, co2: "MH-Z19", pm: true, sound: true },
    queue: { pending: 0, dropped: 0 }, parameters: {}, last_command_id: null,
  },
});

const end = Math.floor(Date.now() / 1000);
const start = end - 7 * DAY;
const recent = end - DAY;
const live = end - 8 * 3600; // like a real board: one frame every 15 s
const noPm25From = end - 3 * DAY; // one whole day without PM2.5
const noPm25To = noPm25From + DAY;
const holes = [end - 5.5 * DAY, end - 4.2 * DAY, end - 2.1 * DAY, end - 0.6 * DAY].map(Math.floor);

type Frame = { t: number; age_s: 0; snd: number; co2: number; pm25: number | null; hum: number; temp: number; stale: false };

function frameAt(t: number): Frame {
  const h = ((t % DAY) / 3600 + 1) % 24; // hour of day (UTC+1 ish)
  const day = Math.floor(t / DAY);
  // Two CO2 peaks a day (morning and evening), above 1200 at their top.
  const peak = (c: number, w: number) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  const co2 = 450 + 800 * Math.max(peak(8, 1.2), peak(20.5, 1.5)) + rnd(-25, 25) + (day % 3) * 10;
  const pm25 = 8 + 25 * peak(19, 1.5) + 5 * Math.sin(t / 7200) + rnd(-2, 2);
  const temp = 21.5 + 3.5 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + rnd(-0.3, 0.3);
  const hum = 50 - 12 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + rnd(-1.5, 1.5);
  const snd = 30 + 300 * Math.max(peak(8, 1), peak(13, 1.2), peak(20, 2)) + rnd(0, 60);
  return {
    t, age_s: 0,
    snd: Math.round(clamp(snd, 10, 400)),
    co2: Math.round(clamp(co2, 450, 1300)),
    pm25: t >= noPm25From && t < noPm25To ? null : Math.round(clamp(pm25, 3, 40)),
    hum: +clamp(hum, 35, 65).toFixed(1),
    temp: +clamp(temp, 17, 26).toFixed(1),
    stale: false,
  };
}

const frames: Frame[] = [];
for (let t = start; t <= end; t += t < recent ? 300 : t < live ? 60 : 15) {
  if (holes.some((h) => t >= h && t < h + 3600)) continue;
  frames.push(frameAt(t));
}

let sent = 0;
for (let i = 0; i < frames.length; i += 100) {
  const batch = frames.slice(i, i + 100);
  await call(`/api/v1/devices/${DEVICE}/frames`, { method: "POST", headers: dev, json: { geohash: "u09tvw", frames: batch } });
  sent += batch.length;
}
console.log(`${sent} frames sent to ${base} for ${DEVICE}`);
