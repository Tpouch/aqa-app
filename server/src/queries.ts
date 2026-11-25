// Read queries shared by the REST routes and the MCP tools.
import { all, get, now, type Db } from "./db.js";
import { buildReport, REPORT_STEP } from "./report.js";
import type {
  AggregateRow, AlertKind, DeviceReport, DeviceSummary, FrameRow, ReportKind, ReportLang, SoundCalibration,
} from "./types.js";

export const ONLINE_WINDOW_S = 180;
export const AGGREGATE_STEPS = [60, 300, 900, 3600, 10800, 21600, 86400];

export interface DeviceDbRow {
  id: string; name: string; created_at: number; last_seen: number | null;
  status_json: string | null; status_at: number | null;
  snd_ref: number | null; db_ref: number | null;
}

export interface FrameDbRow extends Omit<FrameRow, "ts_estimated" | "stale"> {
  ts_estimated: number; stale: number;
}

export const toFrame = (r: FrameDbRow): FrameRow => ({ ...r, ts_estimated: !!r.ts_estimated, stale: !!r.stale });

const DEVICE_COLS = "id, name, created_at, last_seen, status_json, status_at, snd_ref, db_ref";

export function findDevice(db: Db, id: string): DeviceDbRow | undefined {
  return get<DeviceDbRow>(db, `SELECT ${DEVICE_COLS} FROM devices WHERE id = ?`, id);
}

export function listDeviceRows(db: Db): DeviceDbRow[] {
  return all<DeviceDbRow>(db, `SELECT ${DEVICE_COLS} FROM devices ORDER BY name`);
}

export function calibrationOf(d: DeviceDbRow): SoundCalibration | null {
  return d.snd_ref !== null && d.db_ref !== null ? { snd_ref: d.snd_ref, db_ref: d.db_ref } : null;
}

export function deviceSummary(db: Db, d: DeviceDbRow): DeviceSummary {
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
    sound_calibration: calibrationOf(d),
    open_alerts: get<{ n: number }>(db,
      "SELECT COUNT(*) AS n FROM alerts WHERE device_id = ? AND ended_at IS NULL", d.id)!.n,
  };
}

// Averages per bucket of `step` seconds over [from, to].
// Not aliased "ts": SQLite would resolve GROUP BY ts to the alias. The CAST
// matters: node:sqlite binds JS numbers as REAL, and ts / 3600.0 would be a
// float division putting every frame in its own bucket.
export function aggregateRows(db: Db, id: string, from: number, to: number, step: number): AggregateRow[] {
  const rows = all<Omit<AggregateRow, "ts"> & { bucket: number }>(db,
    `SELECT (ts / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS bucket, COUNT(*) AS n,
            AVG(snd) AS snd, AVG(co2) AS co2, AVG(pm25) AS pm25, AVG(hum) AS hum, AVG(temp) AS temp
     FROM frames WHERE device_id = ? AND ts BETWEEN ? AND ?
     GROUP BY bucket ORDER BY bucket`,
    step, step, id, from, to);
  return rows.map(({ bucket, ...r }) => ({ ts: bucket, ...r }));
}

export function deviceReport(
  db: Db, d: DeviceDbRow,
  q: { from: number; to: number; prevFrom: number; kind: ReportKind; tz: string; now: number; lang?: ReportLang },
): DeviceReport {
  const { from, to, prevFrom, kind, tz } = q;
  const alertKinds = (lo: number, hi: number) => all<{ kind: AlertKind }>(db,
    "SELECT kind FROM alerts WHERE device_id = ? AND started_at >= ? AND started_at < ?", d.id, lo, hi)
    .map((a) => a.kind);
  return buildReport({
    deviceId: d.id, kind, tz, from, to, prevFrom, now: q.now, step: REPORT_STEP,
    firstTs: get<{ ts: number | null }>(db, "SELECT MIN(ts) AS ts FROM frames WHERE device_id = ?", d.id)!.ts,
    cal: calibrationOf(d),
    current: aggregateRows(db, d.id, from, to - 1, REPORT_STEP),
    previous: aggregateRows(db, d.id, prevFrom, from - 1, REPORT_STEP),
    alerts: { current: alertKinds(from, to), previous: alertKinds(prevFrom, from) },
    lang: q.lang,
  });
}
