import type { DeviceSummary, Metric } from "../../server/src/types";

// Comparing two rooms on the Mesures chart (single view, desktop).

/** Rooms that can go next to the shown one: sound only between two calibrated boards (dB vs dB). */
export function compareChoices(metric: Metric, here: DeviceSummary | null, others: DeviceSummary[]): DeviceSummary[] {
  if (metric !== "snd") return others;
  return here?.sound_calibration ? others.filter((d) => d.sound_calibration) : [];
}

/** The remembered room, if it can be shown now (deleted, now on screen, or not comparable → null). */
export function compareTarget(
  id: string | null, metric: Metric, here: DeviceSummary | null, others: DeviceSummary[],
): DeviceSummary | null {
  if (id === null) return null;
  return compareChoices(metric, here, others).find((d) => d.id === id) ?? null;
}

/** null = a hole in the data (board offline); undefined = no point at this time (uPlot skips it). */
export type Cell = number | null | undefined;

/** Two series on one time axis. Boards sample at their own instants, so each one gets
 *  `undefined` at the other's timestamps: the curve goes straight through, real holes stay. */
export function mergeSeries(
  xa: number[], ya: (number | null)[], xb: number[], yb: (number | null)[],
): { xs: number[]; a: Cell[]; b: Cell[] } {
  const xs: number[] = [];
  const a: Cell[] = [];
  const b: Cell[] = [];
  let i = 0;
  let j = 0;
  while (i < xa.length || j < xb.length) {
    const ta = i < xa.length ? xa[i]! : Infinity;
    const tb = j < xb.length ? xb[j]! : Infinity;
    const t = Math.min(ta, tb);
    xs.push(t);
    a.push(ta === t ? ya[i++] : undefined);
    b.push(tb === t ? yb[j++] : undefined);
  }
  return { xs, a, b };
}

/** Value of a merged series at `idx`, or at its nearest point within `tolerance` seconds
 *  (left wins a tie). Nothing that close, or a hole: null, never a far-away value. */
export function valueNear(xs: number[], ys: Cell[], idx: number, tolerance: number): number | null {
  const x = xs[idx];
  if (x === undefined) return null;
  if (ys[idx] !== undefined) return ys[idx];
  let l = idx - 1;
  while (l >= 0 && ys[l] === undefined) l--;
  let r = idx + 1;
  while (r < ys.length && ys[r] === undefined) r++;
  const dl = l >= 0 ? x - xs[l]! : Infinity;
  const dr = r < ys.length ? xs[r]! - x : Infinity;
  const k = dl <= dr ? l : r;
  return Math.min(dl, dr) <= tolerance ? ys[k] ?? null : null;
}

// Room for a label above the end of a curve, in canvas pixels (font ~13 px + gap).
const ABOVE = 22;

/** Where the labels at the end of each curve go (y in canvas px, `top`/`bottom` = plot edges):
 *  the higher end writes above, the lower one below, so they never sit on each other.
 *  Against the bottom edge, the lower one writes above too when the other is far enough. */
export function labelSides(main: number, other: number | null, top: number, bottom = Infinity, room = ABOVE) {
  type Side = "above" | "below";
  const fitsAbove = (y: number) => y - top >= room;
  if (other === null) return { main: (fitsAbove(main) ? "above" : "below") as Side, other: "below" as Side };
  const [hi, lo] = main <= other ? [main, other] : [other, main];
  const hiSide: Side = fitsAbove(hi) ? "above" : "below";
  const loSide: Side = bottom - lo < room && hiSide === "above" && lo - hi >= room && fitsAbove(lo) ? "above" : "below";
  return main <= other ? { main: hiSide, other: loSide } : { main: loSide, other: hiSide };
}
