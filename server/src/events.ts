// Device journal. The board does not upload its serial log; instead the server
// records what it can infer from the traffic: boots, reconnections, firmware
// changes, sensors appearing or disappearing, lost frames, weak Wi-Fi, and the
// lifecycle of commands.
import { run, type Db } from "./db.js";
import type { DeviceStatus, EventKind, EventRow } from "./types.js";

export const SILENCE_S = 180; // no contact for longer than this = "reconnect" on the next request

export function logEvent(db: Db, deviceId: string, ts: number, kind: EventKind, level: EventRow["level"], message: string) {
  run(db, "INSERT INTO events (device_id, ts, kind, level, message) VALUES (?, ?, ?, ?, ?)",
      deviceId, ts, kind, level, message);
}

export function span(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
  return `${Math.floor(seconds / 86400)} j ${Math.round((seconds % 86400) / 3600)} h`;
}

export function onContact(db: Db, deviceId: string, lastSeen: number | null, now: number) {
  if (lastSeen === null) {
    logEvent(db, deviceId, now, "first_contact", "info", "Premier contact avec le serveur");
  } else if (now - lastSeen > SILENCE_S) {
    logEvent(db, deviceId, now, "reconnect", "warn", `Reconnectée après ${span(now - lastSeen)} sans contact`);
  }
}

const SENSOR_NAMES: Record<keyof DeviceStatus["sensors"], string> = {
  temperature: "température/humidité", co2: "CO₂", pm: "PM2.5", sound: "son",
};

type PartialStatus = Partial<DeviceStatus> & { boot_count: number; firmware_version: string };

export function onStatus(db: Db, deviceId: string, prev: PartialStatus | null, next: PartialStatus, now: number) {
  const bootChanged = prev && (next.boot_count !== prev.boot_count ||
    (typeof next.uptime_s === "number" && typeof prev.uptime_s === "number" && next.uptime_s < prev.uptime_s));
  if (!prev || bootChanged) {
    logEvent(db, deviceId, now, "boot", "info", `Démarrage n°${next.boot_count} (firmware v${next.firmware_version})`);
  }
  if (prev && prev.firmware_version !== next.firmware_version) {
    logEvent(db, deviceId, now, "firmware", "info", `Firmware v${prev.firmware_version} → v${next.firmware_version}`);
  }
  if (prev?.sensors && next.sensors) {
    for (const key of Object.keys(SENSOR_NAMES) as (keyof DeviceStatus["sensors"])[]) {
      const was = Boolean(prev.sensors[key]);
      const is = Boolean(next.sensors[key]);
      if (was && !is) logEvent(db, deviceId, now, "sensor_lost", "error", `Capteur ${SENSOR_NAMES[key]} non détecté`);
      if (!was && is) logEvent(db, deviceId, now, "sensor_found", "info", `Capteur ${SENSOR_NAMES[key]} détecté`);
    }
  }
  const droppedBefore = bootChanged || !prev?.queue ? 0 : prev.queue.dropped;
  if (next.queue && next.queue.dropped > droppedBefore) {
    logEvent(db, deviceId, now, "frames_dropped", "warn",
      `${next.queue.dropped - droppedBefore} mesure(s) perdue(s) : file pleine après une longue coupure`);
  }
  if (typeof next.rssi === "number" && next.rssi < -80 && !(typeof prev?.rssi === "number" && prev.rssi < -80)) {
    logEvent(db, deviceId, now, "weak_signal", "warn", `Signal Wi-Fi faible (${next.rssi} dBm)`);
  }
}

// Secrets in command params never leave the server once stored, and are wiped
// from the database when the command reaches a final state.
const SECRET_KEYS = ["password", "eap_password"];

export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const out = { ...params };
  for (const k of SECRET_KEYS) if (k in out && out[k] !== "") out[k] = "••••••";
  return out;
}
