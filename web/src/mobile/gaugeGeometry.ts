import type { MetricDef, Tone } from "../metrics";
import type { Metric } from "../../../server/src/types";

// Dashboard gauges: a 270° arc open at the bottom. Angles in degrees,
// 0 = right, clockwise (SVG convention).
export const GAUGE_START = 135;
export const GAUGE_SWEEP = 270;

export interface GaugeScale { min: number; max: number }

// Scale ends: a value outside is pinned to the end of the arc; the number
// shown stays the real one. Sound is in dB once calibrated.
export const GAUGE_SCALE: Record<Metric, GaugeScale> = {
  co2: { min: 400, max: 2000 },
  pm25: { min: 0, max: 75 },
  snd: { min: 30, max: 90 },
  temp: { min: 10, max: 35 },
  hum: { min: 0, max: 100 },
};
const RAW_SOUND: GaugeScale = { min: 0, max: 4095 };

export function gaugeScale(metric: Metric, calibrated: boolean): GaugeScale {
  return metric === "snd" && !calibrated ? RAW_SOUND : GAUGE_SCALE[metric];
}

export function gaugeAngle(scale: GaugeScale, v: number): number {
  const t = (v - scale.min) / (scale.max - scale.min);
  return GAUGE_START + GAUGE_SWEEP * Math.min(1, Math.max(0, t));
}

export interface GaugeSegment { from: number; to: number; tone: Tone | null }

/** One arc per band, cut to the scale; no bands (uncalibrated sound) = one neutral arc. */
export function gaugeSegments(def: MetricDef, scale: GaugeScale): GaugeSegment[] {
  if (!def.bands) return [{ from: GAUGE_START, to: GAUGE_START + GAUGE_SWEEP, tone: null }];
  const out: GaugeSegment[] = [];
  let lo = scale.min;
  for (const b of def.bands) {
    const hi = Math.min(b.to ?? scale.max, scale.max);
    if (hi > lo) out.push({ from: gaugeAngle(scale, lo), to: gaugeAngle(scale, hi), tone: b.tone });
    lo = Math.max(lo, hi);
  }
  return out;
}
