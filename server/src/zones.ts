// Air-quality zones of each metric: the one definition shared by the server
// (report) and the web client (charts, gauges, words). Type imports only, so
// the browser bundle can import it.
import type { Metric, Tone } from "./types.js";

/** Sorted: v belongs to the first band where v < to (v <= to if inclusive); to null = +∞. */
export interface Band { to: number | null; inclusive?: boolean; word: string; tone: Tone }

export const ZONES = {
  co2: [
    { to: 800, word: "bon", tone: "good" },
    { to: 1200, word: "aérer", tone: "warn" },
    { to: null, word: "mauvais", tone: "bad" },
  ],
  pm25: [
    { to: 15, word: "bon", tone: "good" },
    { to: 35, word: "aérer", tone: "warn" },
    { to: null, word: "mauvais", tone: "bad" },
  ],
  temp: [
    { to: 19, word: "froid", tone: "bad" },
    { to: 24, inclusive: true, word: "confort", tone: "good" },
    { to: null, word: "chaud", tone: "bad" },
  ],
  hum: [
    { to: 40, word: "sec", tone: "bad" },
    { to: 60, inclusive: true, word: "confort", tone: "good" },
    { to: null, word: "humide", tone: "bad" },
  ],
  // Sound once calibrated, in estimated dB. Raw amplitude has no zones.
  snd_db: [
    { to: 55, word: "calme", tone: "good" },
    { to: 70, word: "bruyant", tone: "warn" },
    { to: null, word: "fort", tone: "bad" },
  ],
} as const satisfies Record<string, readonly Band[]>;

export function zonesOf(metric: Metric, soundCalibrated: boolean): readonly Band[] | null {
  if (metric === "snd") return soundCalibrated ? ZONES.snd_db : null;
  return ZONES[metric];
}

export function bandOf(bands: readonly Band[] | null, v: number | null): Band | null {
  if (v === null || !bands) return null;
  for (const b of bands) {
    if (b.to === null || (b.inclusive ? v <= b.to : v < b.to)) return b;
  }
  return null;
}
