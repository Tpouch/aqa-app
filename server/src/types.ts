// Shapes returned by the app routes. The web client imports this file, so it
// must stay free of runtime code and Node imports.

export const METRICS = ["co2", "pm25", "snd", "temp", "hum"] as const;
export type Metric = (typeof METRICS)[number];

export const COMMAND_TYPES = ["status", "config", "geohash", "restart", "ota", "rollback"] as const;
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

export interface DeviceSummary {
  id: string;
  name: string;
  created_at: number;
  last_seen: number | null;
  online: boolean;
  status: DeviceStatus | null;
  status_at: number | null;
  latest: FrameRow | null;
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
