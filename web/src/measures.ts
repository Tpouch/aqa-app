import type { Metric, SoundCalibration } from "../../server/src/types";
import type { MetricDef } from "./metrics";
import { t } from "./i18n/dict";

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

// Summary line name: "CO₂ en zone mauvaise", "Température hors confort", "Son fort"
// ("Loud sound" in English: the alert already names the metric, wherever the word sits).
export function alertPhrase(def: MetricDef): string {
  const alert = (def.alertLabel ?? "").toLowerCase();
  return alert.split(" ").includes(def.label.toLowerCase())
    ? alert.charAt(0).toUpperCase() + alert.slice(1)
    : `${def.label} ${alert}`;
}

// CSV file named after the room ("chambre-co2-2026-11-24.csv"); the board id
// when the name leaves nothing usable.
export function csvFileName(room: string, id: string, what: string, day: string): string {
  const slug = room.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || id}-${what}-${day}.csv`;
}

// Banner subtitle: "Chambre · 24 h glissantes · moyennes sur 1 min" (room only with several boards).
export function bannerSubtitle(room: string | null, period: string, step: string | null): string {
  const text = period.charAt(0).toUpperCase() + period.slice(1) + (step ? t().measures.averagesOver(step) : "");
  return room ? `${room} · ${text}` : text;
}
