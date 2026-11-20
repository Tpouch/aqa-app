import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type Built } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { run } from "../src/db.js";

const PASSWORD = "correct horse battery";
const DEVICE = "aqa-24A160B3C8F0";

const cfg = loadConfig({
  ADMIN_PASSWORD: PASSWORD,
  SESSION_SECRET: "x".repeat(40),
  PUBLIC_URL: "https://sensor.example.test",
  LOG_LEVEL: "silent",
  WEB_DIR: "",
});

let built: Built;
let cookie = "";
let token = "";

const status = {
  t: null, uptime_s: 12, boot_count: 3, firmware_version: "2.0.0", hardware_version: 14,
  ip: "10.0.0.5", rssi: -61, ssid: "lab", geohash: "d347", free_heap: 150000,
  sensors: { temperature: true, co2: "MH-Z19", pm: false, sound: true },
  queue: { pending: 0, dropped: 0 }, parameters: {}, last_command_id: null,
};

const frame = (over: Record<string, unknown> = {}) => ({
  t: null, age_s: 0, snd: 31, co2: 612, pm25: null, hum: 45.2, temp: 21.4, stale: false, ...over,
});

const admin = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  built.app.inject({ method, url, payload: payload as object, headers: { cookie } });

const device = (url: string, payload: unknown, tok = token) =>
  built.app.inject({
    method: "POST", url: `/api/v1/devices/${DEVICE}${url}`, payload: payload as object,
    headers: { authorization: `Bearer ${tok}` },
  });

function multipart(fields: Record<string, string | Buffer>) {
  const boundary = "----aqa" + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    const file = Buffer.isBuffer(value);
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"` +
      (file ? `; filename="${name}.bin"\r\nContent-Type: application/octet-stream` : "") + "\r\n\r\n"));
    chunks.push(file ? value : Buffer.from(value));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

beforeAll(async () => {
  built = await buildApp(cfg, { dataDir: ":memory:" });
});
afterAll(async () => {
  await built.app.close();
});

describe("session", () => {
  it("refuses app routes without a session", async () => {
    expect((await built.app.inject({ method: "GET", url: "/api/v1/devices" })).statusCode).toBe(401);
  });

  it("rejects a wrong password", async () => {
    const res = await built.app.inject({ method: "POST", url: "/api/v1/session", payload: { password: "nope" } });
    expect(res.statusCode).toBe(401);
  });

  it("logs in and sets an httpOnly strict cookie", async () => {
    const res = await built.app.inject({ method: "POST", url: "/api/v1/session", payload: { password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    const set = String(res.headers["set-cookie"]);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Strict/i);
    expect(set).toMatch(/Secure/i);
    cookie = set.split(";")[0]!;
    expect((await admin("GET", "/api/v1/session")).json()).toEqual({ authenticated: true });
  });
});

describe("device registration", () => {
  it("records an unregistered board that calls in", async () => {
    const res = await device("/status", status, "whatever");
    expect(res.statusCode).toBe(401);
    const list = (await admin("GET", "/api/v1/devices")).json();
    expect(list.unknown.map((u: { id: string }) => u.id)).toContain(DEVICE);
  });

  it("registers a board and returns its token once", async () => {
    const res = await admin("POST", "/api/v1/devices", { id: "aqa-24a160b3c8f0", name: "Chambre" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.device.id).toBe(DEVICE);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    token = body.token;
    const list = (await admin("GET", "/api/v1/devices")).json();
    expect(list.unknown).toEqual([]);
    expect(JSON.stringify(list)).not.toContain(token);
  });

  it("rejects a duplicate and a malformed id", async () => {
    expect((await admin("POST", "/api/v1/devices", { id: DEVICE, name: "x" })).statusCode).toBe(409);
    expect((await admin("POST", "/api/v1/devices", { id: "aqa-123", name: "x" })).statusCode).toBe(422);
  });
});

describe("device API (docs/api.md)", () => {
  it("refuses a wrong token", async () => {
    expect((await device("/status", status, "wrong")).statusCode).toBe(401);
  });

  it("stores the status and marks the board online", async () => {
    const res = await device("/status", status);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ commands: [] });
    const d = (await admin("GET", `/api/v1/devices/${DEVICE}`)).json();
    expect(d.online).toBe(true);
    expect(d.status.sensors.co2).toBe("MH-Z19");
  });

  it("stores frames, dates them, and ignores a retried batch", async () => {
    const t = 1795200000;
    const batch = { geohash: "d347", frames: [frame({ age_s: 40 }), frame({ t, co2: 615 })] };
    const first = await device("/frames", batch);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ accepted: 2, commands: [] });
    await device("/frames", { geohash: "d347", frames: [frame({ t, co2: 615 })] });

    const rows = (await admin("GET", `/api/v1/devices/${DEVICE}/frames`)).json().frames;
    expect(rows).toHaveLength(2);
    const exact = rows.find((r: { ts: number }) => r.ts === t);
    expect(exact).toMatchObject({ co2: 615, pm25: null, hum: 45.2, ts_estimated: false });
    const estimated = rows.find((r: { ts: number }) => r.ts !== t);
    expect(estimated.ts_estimated).toBe(true);
    expect(Math.abs(estimated.ts - (Math.floor(Date.now() / 1000) - 40))).toBeLessThanOrEqual(2);
  });

  it("answers 422 to an invalid batch (the board then drops it)", async () => {
    expect((await device("/frames", { frames: [] })).statusCode).toBe(422);
    expect((await device("/frames", { frames: [{ t: null }] })).statusCode).toBe(422);
  });

  it("aggregates frames per bucket", async () => {
    const base = 1795201200; // multiple of 3600
    await device("/frames", { frames: [frame({ t: base, co2: 400 }), frame({ t: base + 60, co2: 600 })] });
    const res = await admin("GET", `/api/v1/devices/${DEVICE}/frames/aggregate?from=${base}&to=${base + 3599}&step=3600`);
    expect(res.json().buckets).toEqual([expect.objectContaining({ ts: base, n: 2, co2: 500 })]);
    expect((await admin("GET", `/api/v1/devices/${DEVICE}/frames/aggregate?step=7`)).statusCode).toBe(400);
  });
});

describe("sound calibration", () => {
  it("starts uncalibrated", async () => {
    expect((await admin("GET", `/api/v1/devices/${DEVICE}`)).json().sound_calibration).toBeNull();
  });
  it("stores a calibration and keeps the name", async () => {
    const res = await admin("PATCH", `/api/v1/devices/${DEVICE}`, { sound_calibration: { snd_ref: 31, db_ref: 45 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().sound_calibration).toEqual({ snd_ref: 31, db_ref: 45 });
    expect(res.json().name).toBe("Chambre");
  });
  it("rejects out-of-range values and an empty body", async () => {
    for (const sound_calibration of [{ snd_ref: 0, db_ref: 45 }, { snd_ref: 31, db_ref: 10 }, { snd_ref: 5000, db_ref: 45 }]) {
      expect((await admin("PATCH", `/api/v1/devices/${DEVICE}`, { sound_calibration })).statusCode).toBe(422);
    }
    expect((await admin("PATCH", `/api/v1/devices/${DEVICE}`, {})).statusCode).toBe(422);
  });
  it("clears the calibration with null", async () => {
    const res = await admin("PATCH", `/api/v1/devices/${DEVICE}`, { sound_calibration: null });
    expect(res.json().sound_calibration).toBeNull();
  });
  it("still renames with name only", async () => {
    expect((await admin("PATCH", `/api/v1/devices/${DEVICE}`, { name: "Chambre" })).json().name).toBe("Chambre");
  });
});

describe("commands", () => {
  let cid = "";

  it("validates command params", async () => {
    const bad = await admin("POST", `/api/v1/devices/${DEVICE}/commands`, { type: "geohash", params: { geohash: "ai!" } });
    expect(bad.statusCode).toBe(422);
    const noFw = await admin("POST", `/api/v1/devices/${DEVICE}/commands`, { type: "ota", params: { version: "9.9.9" } });
    expect(noFw.statusCode).toBe(422);
  });

  it("delivers a pending command once, in the next response", async () => {
    const res = await admin("POST", `/api/v1/devices/${DEVICE}/commands`, { type: "geohash", params: { geohash: "u09tv" } });
    expect(res.statusCode).toBe(201);
    cid = res.json().id;
    const first = (await device("/frames", { frames: [frame()] })).json();
    expect(first.commands).toEqual([{ id: cid, type: "geohash", params: { geohash: "u09tv" } }]);
    const second = (await device("/status", status)).json();
    expect(second.commands).toEqual([]);
  });

  it("re-delivers a sent command never acked after 10 minutes", async () => {
    run(built.db, "UPDATE commands SET sent_at = sent_at - 601 WHERE id = ?", cid);
    expect((await device("/status", status)).json().commands.map((c: { id: string }) => c.id)).toEqual([cid]);
  });

  it("records acks", async () => {
    expect((await device(`/commands/${cid}/ack`, { status: "completed", progress: 0, detail: null, t: 0 })).statusCode).toBe(204);
    expect((await device(`/commands/nope/ack`, { status: "completed" })).statusCode).toBe(404);
    expect((await device(`/commands/${cid}/ack`, { status: "done" })).statusCode).toBe(422);
    const list = (await admin("GET", `/api/v1/devices/${DEVICE}/commands`)).json().commands;
    expect(list[0]).toMatchObject({ id: cid, state: "completed" });
  });

  it("cancels only pending commands", async () => {
    const res = await admin("POST", `/api/v1/devices/${DEVICE}/commands`, { type: "restart" });
    const id = res.json().id;
    expect((await admin("DELETE", `/api/v1/devices/${DEVICE}/commands/${id}`)).statusCode).toBe(204);
    expect((await admin("DELETE", `/api/v1/devices/${DEVICE}/commands/${cid}`)).statusCode).toBe(409);
  });
});

describe("firmware and OTA", () => {
  const bin = Buffer.alloc(4096, 1);
  bin[0] = 0xe9;
  const sig = Buffer.alloc(256, 7);

  it("rejects a file that is not an ESP32 image", async () => {
    const mp = multipart({ version: "2.0.1", firmware: Buffer.alloc(4096, 0), signature: sig });
    const res = await built.app.inject({ method: "POST", url: "/api/v1/firmware", ...mp, headers: { ...mp.headers, cookie } });
    expect(res.statusCode).toBe(422);
  });

  it("uploads a signed image", async () => {
    const mp = multipart({ version: "2.0.1", firmware: bin, signature: sig });
    const res = await built.app.inject({ method: "POST", url: "/api/v1/firmware", ...mp, headers: { ...mp.headers, cookie } });
    expect(res.statusCode).toBe(201);
    expect((await admin("GET", "/api/v1/firmware")).json().firmware[0]).toMatchObject({ version: "2.0.1", size: 4096 });
  });

  it("turns an ota command into signed, expiring download links", async () => {
    const res = await admin("POST", `/api/v1/devices/${DEVICE}/commands`, { type: "ota", params: { version: "2.0.1" } });
    expect(res.statusCode).toBe(201);
    const { url, signature_url } = res.json().params;
    expect(url).toMatch(/^https:\/\/sensor\.example\.test\/firmware\/2\.0\.1\/firmware\.bin\?exp=\d+&sig=/);

    const path = (u: string) => u.replace("https://sensor.example.test", "");
    const dl = await built.app.inject({ method: "GET", url: path(url) });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.equals(bin)).toBe(true);
    expect(dl.headers["cache-control"]).toContain("no-store");
    expect((await built.app.inject({ method: "GET", url: path(signature_url) })).rawPayload.equals(sig)).toBe(true);

    // No link, tampered link, expired link: all 404, the image never leaks.
    expect((await built.app.inject({ method: "GET", url: "/firmware/2.0.1/firmware.bin" })).statusCode).toBe(404);
    expect((await built.app.inject({ method: "GET", url: path(url).replace(/sig=./, "sig=A") })).statusCode).toBe(404);
    const past = Math.floor(Date.now() / 1000) - 10;
    const expired = built.firmware.signedUrls("", "2.0.1", past - 24 * 3600).url;
    expect((await built.app.inject({ method: "GET", url: expired })).statusCode).toBe(404);
  });
});

describe("journal", () => {
  it("records first contact, boot, reconnect, lost sensors and dropped frames", async () => {
    const events = async () => (await admin("GET", `/api/v1/devices/${DEVICE}/events`)).json().events as { kind: string; message: string }[];
    const kinds = (await events()).map((e) => e.kind);
    expect(kinds).toContain("first_contact");
    expect(kinds).toContain("boot");

    run(built.db, "UPDATE devices SET last_seen = last_seen - 3600 WHERE id = ?", DEVICE);
    await device("/status", { ...status, boot_count: 4, uptime_s: 5,
      sensors: { ...status.sensors, co2: null }, queue: { pending: 3, dropped: 12 } });
    const latest = await events();
    expect(latest[0]?.kind).toBe("frames_dropped");
    expect(latest.map((e) => e.kind)).toEqual(expect.arrayContaining(["reconnect", "boot", "sensor_lost"]));
    expect(latest.find((e) => e.kind === "reconnect")?.message).toMatch(/1 h/);
    expect(latest.find((e) => e.kind === "sensor_lost")?.message).toContain("CO₂");
  });
});

describe("wifi command", () => {
  const cmd = (params: unknown) => admin("POST", `/api/v1/devices/${DEVICE}/commands`, { type: "wifi", params });

  it("validates WPA2 and enterprise credentials", async () => {
    expect((await cmd({ ssid: "lab", password: "short" })).statusCode).toBe(422);
    expect((await cmd({ ssid: "", password: "longenough" })).statusCode).toBe(422);
    expect((await cmd({ ssid: "lab", password: "x", extra: 1 })).statusCode).toBe(422);
    expect((await cmd({ reset: true })).statusCode).toBe(201);
    expect((await cmd({ ssid: "ASK4 WiFi", eap_username: "me", eap_password: "secret-eap" })).statusCode).toBe(201);
  });

  it("delivers the password to the board but never to the browser, and wipes it once done", async () => {
    // Drain anything pending so only the next command is delivered.
    await device("/status", status);
    const res = await cmd({ ssid: "home", password: "hunter22-secret" });
    expect(res.statusCode).toBe(201);
    expect(JSON.stringify(res.json())).not.toContain("hunter22");
    const cid = res.json().id;

    const delivered = (await device("/status", status)).json().commands;
    expect(delivered).toEqual([{ id: cid, type: "wifi", params: { ssid: "home", password: "hunter22-secret" } }]);
    expect((await admin("GET", `/api/v1/devices/${DEVICE}/commands`)).body).not.toContain("hunter22");

    await device(`/commands/${cid}/ack`, { status: "completed", progress: 100, detail: "joined" });
    const stored = built.db.prepare("SELECT params_json FROM commands WHERE id = ?").get(cid) as { params_json: string };
    expect(stored.params_json).not.toContain("hunter22");
    const journal = (await admin("GET", `/api/v1/devices/${DEVICE}/events`)).json().events;
    expect(journal[0].message).toMatch(/wifi terminée/);
  });
});

describe("web app serving", () => {
  it("serves the SPA shell for page paths and 404 for missing files", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aqa-web-"));
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>shell</title>");
    const web = await buildApp({ ...cfg, WEB_DIR: dir }, { dataDir: ":memory:" });
    // Files added after startup (a rebuild) must be served too.
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "assets", "late.js"), "console.log(1)");
    const late = await web.app.inject({ method: "GET", url: "/assets/late.js" });
    expect(late.statusCode).toBe(200);
    expect(late.headers["content-type"]).toContain("javascript");
    expect((await web.app.inject({ method: "GET", url: "/assets/missing.js" })).statusCode).toBe(404);
    const page = await web.app.inject({ method: "GET", url: "/manage" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("shell");
    expect((await web.app.inject({ method: "GET", url: "/api/v1/nope" })).statusCode).toBe(404);
    await web.app.close();
  });
});

describe("logout", () => {
  it("clears the session", async () => {
    const res = await admin("DELETE", "/api/v1/session");
    expect(String(res.headers["set-cookie"])).toMatch(/aqa_session=;/);
  });
});
