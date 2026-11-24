// Shapes returned by the app routes. The web client imports this file, so it
// must stay free of runtime code and Node imports.

export const METRICS = ["co2", "pm25", "snd", "temp", "hum"] as const;
export type Metric = (typeof METRICS)[number];

// How a value reads: inside the good zone, worth watching, or bad.
export type Tone = "good" | "warn" | "bad";

export const COMMAND_TYPES = ["status", "config", "geohash", "restart", "ota", "rollback", "wifi"] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];
export type CommandState = "pending" | "sent" | "in_progress" | "completed" | "failed";

export interface DeviceStatus {
  t: number | null;
  uptime_s: number;
  boot_count: number;
  firmware_version: string;
  hardware_version: number;
  ip: string;
  rssi: number;
  ssid: string;
  geohash: string;
  free_heap: number;
  sensors: { temperature: boolean; co2: string | null; pm: boolean; sound: boolean };
  queue: { pending: number; dropped: number };
  parameters: Record<string, number>;
  last_command_id: string | null;
}

export interface FrameRow {
  ts: number;
  ts_estimated: boolean;
  geohash: string | null;
  snd: number | null;
  co2: number | null;
  pm25: number | null;
  hum: number | null;
  temp: number | null;
  stale: boolean;
}

export interface AggregateRow {
  ts: number; // bucket start
  n: number;
  snd: number | null;
  co2: number | null;
  pm25: number | null;
  hum: number | null;
  temp: number | null;
}

// Maps the raw "snd" ADC reading of a board to dB: snd_ref reads as db_ref.
export interface SoundCalibration {
  snd_ref: number;
  db_ref: number;
}

export interface DeviceSummary {
  id: string;
  name: string;
  created_at: number;
  last_seen: number | null;
  online: boolean;
  status: DeviceStatus | null;
  status_at: number | null;
  latest: FrameRow | null;
  sound_calibration: SoundCalibration | null;
  open_alerts: number;
}

export const ALERT_KINDS = [
  "co2_high", "pm25_high", "temp_low", "temp_high", "hum_low", "hum_high", "snd_high", "offline",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export interface AlertRuleValues {
  enabled: boolean;
  threshold: number | null; // null for offline
  duration_s: number;
}

export interface AlertRule extends AlertRuleValues {
  kind: AlertKind;
  label: string;
  unit: string;
  metric: Metric | null;
  defaults: AlertRuleValues;
}

export interface AlertRow {
  id: number;
  kind: AlertKind;
  label: string;
  unit: string;
  metric: Metric | null;
  tone: "warn" | "bad";
  threshold: number | null;
  started_at: number;
  ended_at: number | null; // null = en cours
  start_value: number | null;
  peak_value: number | null;
  end_value: number | null;
  end_reason: "normal" | "disabled" | null;
  advice: string;
}

export interface UnknownDevice {
  id: string;
  first_seen: number;
  last_seen: number;
  ip: string | null;
}

export interface CommandRow {
  id: string;
  type: CommandType;
  params: Record<string, unknown>;
  state: CommandState;
  progress: number;
  detail: string | null;
  created_at: number;
  sent_at: number | null;
  updated_at: number;
}

export interface FirmwareRow {
  version: string;
  size: number;
  uploaded_at: number;
}

// Device journal, derived server-side from what the board reports.
export type EventKind =
  | "first_contact" | "boot" | "reconnect" | "firmware" | "sensor_lost" | "sensor_found"
  | "frames_dropped" | "weak_signal" | "command";

export interface EventRow {
  id: number;
  ts: number;
  kind: EventKind;
  level: "info" | "warn" | "error";
  message: string;
}

// ---- Bilan (GET /api/v1/devices/:id/report), computed by server/src/report.ts

export type ReportKind = "week" | "month" | "custom";

export interface ZoneTime { word: string; tone: Tone; seconds: number }

export interface MetricPeriod {
  measured_s: number;
  zones: ZoneTime[] | null; // null: sound without calibration
  avg: number | null; // sound in dB when calibrated, raw amplitude otherwise
  min: { v: number; ts: number } | null;
  max: { v: number; ts: number } | null;
}

export interface Comparison { trend: "better" | "worse" | "same" | null; text: string }

export interface MetricReport {
  metric: Metric;
  current: MetricPeriod;
  previous: MetricPeriod;
  comparison: Comparison | null;
}

// Air = the worse of CO₂ and PM2.5 at each minute.
export interface AirTime { measured_s: number; good_s: number; warn_s: number; bad_s: number }

export interface HeatRow {
  weekday: number; // 0 = Monday
  date: string | null; // YYYY-MM-DD when one row is one day; null when averaged by weekday
  cells: (number | null)[]; // 24 hourly CO₂ means, local time; null = no measurement
}

export interface DeviceReport {
  device_id: string;
  kind: ReportKind;
  tz: string;
  from: number;
  to: number;
  prev_from: number; // the previous period is [prev_from, from)
  now: number;
  first_ts: number | null; // oldest measurement of the board: no report before it
  in_progress: boolean;
  elapsed_s: number; // from → min(to, now)
  measured_s: number;
  prev_elapsed_s: number;
  prev_measured_s: number;
  sound_calibrated: boolean;
  verdict: { tone: Tone | null; head: string; rest: string };
  air: { current: AirTime; previous: AirTime };
  metrics: MetricReport[];
  heatmap: { metric: "co2"; by: "day" | "weekday"; rows: HeatRow[] };
  alerts: { current: number; previous: number; by_kind: { kind: AlertKind; label: string; count: number }[] };
  takeaways: string[];
}
