import { soundDb } from "../../server/src/sound";
import type { Metric, SoundCalibration } from "../../server/src/types";

export type Tone = "good" | "warn" | "bad";
/** Bandes triées : v appartient à la 1re bande où v < to (ou v <= to si inclusive) ; to null = +∞. */
export interface Band { to: number | null; inclusive?: boolean; word: string; tone: Tone }
export interface MetricDef {
  metric: Metric;
  label: string;
  unit: string;
  decimals: number;
  bands: Band[] | null;
  alertLabel: string | null;
  nonNegative: boolean;
}

const BAD_ZONE = "EN ZONE MAUVAISE";
const OUT_OF_COMFORT = "HORS CONFORT";

export function metricDef(metric: Metric, cal: SoundCalibration | null): MetricDef {
  switch (metric) {
    case "co2":
      return {
        metric, label: "CO₂", unit: "ppm", decimals: 0, alertLabel: BAD_ZONE, nonNegative: true,
        bands: [
          { to: 800, word: "bon", tone: "good" },
          { to: 1200, word: "aérer", tone: "warn" },
          { to: null, word: "mauvais", tone: "bad" },
        ],
      };
    case "pm25":
      return {
        metric, label: "PM2.5", unit: "µg/m³", decimals: 0, alertLabel: BAD_ZONE, nonNegative: true,
        bands: [
          { to: 15, word: "bon", tone: "good" },
          { to: 35, word: "aérer", tone: "warn" },
          { to: null, word: "mauvais", tone: "bad" },
        ],
      };
    case "temp":
      return {
        metric, label: "Température", unit: "°C", decimals: 1, alertLabel: OUT_OF_COMFORT, nonNegative: false,
        bands: [
          { to: 19, word: "froid", tone: "bad" },
          { to: 24, inclusive: true, word: "confort", tone: "good" },
          { to: null, word: "chaud", tone: "bad" },
        ],
      };
    case "hum":
      return {
        metric, label: "Humidité", unit: "%", decimals: 0, alertLabel: OUT_OF_COMFORT, nonNegative: true,
        bands: [
          { to: 40, word: "sec", tone: "bad" },
          { to: 60, inclusive: true, word: "confort", tone: "good" },
          { to: null, word: "humide", tone: "bad" },
        ],
      };
    case "snd":
      return cal
        ? {
            metric, label: "Son", unit: "dB (estimé)", decimals: 0, alertLabel: "SON FORT", nonNegative: true,
            bands: [
              { to: 55, word: "calme", tone: "good" },
              { to: 70, word: "bruyant", tone: "warn" },
              { to: null, word: "fort", tone: "bad" },
            ],
          }
        : {
            metric, label: "Son", unit: "amplitude", decimals: 0, alertLabel: null, nonNegative: true,
            bands: null,
          };
  }
}

export function bandOf(def: MetricDef, v: number | null): Band | null {
  if (v === null || !def.bands) return null;
  for (const b of def.bands) {
    if (b.to === null || (b.inclusive ? v <= b.to : v < b.to)) return b;
  }
  return null;
}

export { soundDb };

export function toDisplay(metric: Metric, raw: number | null, cal: SoundCalibration | null): number | null {
  return metric === "snd" && cal ? soundDb(raw, cal) : raw;
}

/** Axe Y : englobe les données et montre toujours la zone voisine (ou la zone de confort entière). */
export function yRange(def: MetricDef, min: number | null, max: number | null): [number, number] {
  const bands = def.bands;
  let lo: number;
  let hi: number;
  const twoSided = bands !== null && bands[0]?.tone === "bad";
  const comfortIdx = twoSided ? bands.findIndex((b) => b.tone === "good") : -1;
  const comfortLo = comfortIdx > 0 ? bands![comfortIdx - 1]!.to : null;
  const comfortHi = comfortIdx >= 0 ? bands![comfortIdx]!.to : null;

  if (min === null || max === null) {
    if (!bands) {
      [lo, hi] = [0, 1];
    } else if (comfortLo !== null && comfortHi !== null) {
      [lo, hi] = [comfortLo, comfortHi];
    } else {
      [lo, hi] = [0, bands[0]!.to ?? 1];
    }
  } else {
    lo = min;
    hi = max;
    if (comfortLo !== null && comfortHi !== null) {
      lo = Math.min(lo, comfortLo);
      hi = Math.max(hi, comfortHi);
    } else if (bands) {
      const next = bands.find((b) => b.to !== null && b.to > max);
      if (next?.to != null) hi = next.to;
    }
  }
  const margin = (hi - lo || 1) * 0.05;
  lo -= margin;
  hi += margin;
  if (def.nonNegative) lo = Math.max(0, lo);
  return [lo, hi];
}

export interface PeriodStats {
  min: { v: number; ts: number };
  max: { v: number; ts: number };
  avg: number;
  alertSeconds: number | null;
}

export function periodStats(
  def: MetricDef, xs: number[], ys: (number | null)[], period: number,
): PeriodStats | null {
  let min: PeriodStats["min"] | null = null;
  let max: PeriodStats["max"] | null = null;
  let sum = 0;
  let n = 0;
  let bad = 0;
  ys.forEach((v, i) => {
    const ts = xs[i];
    if (v === null || ts === undefined) return;
    if (!min || v < min.v) min = { v, ts };
    if (!max || v > max.v) max = { v, ts };
    sum += v;
    n++;
    if (bandOf(def, v)?.tone === "bad") bad++;
  });
  if (!min || !max) return null;
  return { min, max, avg: sum / n, alertSeconds: def.bands ? bad * period : null };
}
