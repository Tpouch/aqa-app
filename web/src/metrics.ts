import { soundDb } from "../../server/src/sound";
import { bandOf as bandIn, ZONES, type Band } from "../../server/src/zones";
import type { Metric, SoundCalibration, Tone } from "../../server/src/types";

export type { Band, Tone };
export interface MetricDef {
  metric: Metric;
  label: string;
  unit: string;
  decimals: number;
  bands: readonly Band[] | null;
  alertLabel: string | null;
  nonNegative: boolean;
}

const BAD_ZONE = "EN ZONE MAUVAISE";
const OUT_OF_COMFORT = "HORS CONFORT";

/** Zones du son une fois calibré en dB estimés (définies dans server/src/zones.ts). */
export const SOUND_DB_BANDS = ZONES.snd_db;

export function metricDef(metric: Metric, cal: SoundCalibration | null): MetricDef {
  switch (metric) {
    case "co2":
      return { metric, label: "CO₂", unit: "ppm", decimals: 0, alertLabel: BAD_ZONE, nonNegative: true, bands: ZONES.co2 };
    case "pm25":
      return { metric, label: "PM2.5", unit: "µg/m³", decimals: 0, alertLabel: BAD_ZONE, nonNegative: true, bands: ZONES.pm25 };
    case "temp":
      return { metric, label: "Température", unit: "°C", decimals: 1, alertLabel: OUT_OF_COMFORT, nonNegative: false, bands: ZONES.temp };
    case "hum":
      return { metric, label: "Humidité", unit: "%", decimals: 0, alertLabel: OUT_OF_COMFORT, nonNegative: true, bands: ZONES.hum };
    case "snd":
      return cal
        ? { metric, label: "Son", unit: "dB (estimé)", decimals: 0, alertLabel: "SON FORT", nonNegative: true, bands: ZONES.snd_db }
        : { metric, label: "Son", unit: "amplitude", decimals: 0, alertLabel: null, nonNegative: true, bands: null };
  }
}

const frNum = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Plage lisible de chaque bande, dans l'ordre : « moins de 800 ppm », « 800 à 1 200 ppm », « 1 200 ppm et plus ». */
export function bandRanges(bands: readonly Band[], unit: string): string[] {
  return bands.map((b, i) => {
    const prev = bands[i - 1];
    if (b.to === null) {
      const lo = frNum(prev?.to ?? 0);
      return prev?.inclusive ? `plus de ${lo} ${unit}` : `${lo} ${unit} et plus`;
    }
    const to = `${frNum(b.to)} ${unit}`;
    if (!prev || prev.to === null) return b.inclusive ? `jusqu'à ${to}` : `moins de ${to}`;
    return `${frNum(prev.to)} à ${to}`;
  });
}

export function bandOf(def: MetricDef, v: number | null): Band | null {
  return bandIn(def.bands, v);
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
