import type { Metric, SoundCalibration } from "../../server/src/types";
import type { MetricDef } from "./metrics";

// Grid of the Mesures page: one or two charts get the full width (taller), more go in two columns.
export function gridColumns(n: number): 1 | 2 {
  return n <= 2 ? 1 : 2;
}

// CSV header for the exported metrics; calibrated sound also gets its estimated dB next to the raw value.
export function csvColumns(metrics: Metric[], cal: SoundCalibration | null): string[] {
  return ["time", ...metrics.flatMap((m) => (m === "snd" && cal ? ["snd", "snd_db"] : [m]))];
}

// "0 min", "45 min", "1 h", "1 h 20".
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
}

// Summary line name: "CO₂ en zone mauvaise", "Température hors confort", "Son fort".
export function alertPhrase(def: MetricDef): string {
  const alert = (def.alertLabel ?? "").toLowerCase();
  return alert.startsWith(def.label.toLowerCase())
    ? alert.charAt(0).toUpperCase() + alert.slice(1)
    : `${def.label} ${alert}`;
}
