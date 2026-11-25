// Display-only processing of a chart series: a centred moving average ("lissé"), and
// the same average ± 2 local standard deviations ("marge"). The stats and the CSV
// keep the raw values; only the curve changes.

export type SmoothMode = "smooth" | "band" | "raw";
export const SMOOTH_MODES: readonly SmoothMode[] = ["smooth", "band", "raw"];

/** Mode, and the width in seconds of the window each point is averaged over. */
export interface Smoothing { mode: SmoothMode; window: number }

type Ys = (number | null)[];

/** Window for a chart spanning `span` seconds sampled every `period` seconds:
 *  1/50 of the span, at least three samples so that a short range still smooths. */
export function smoothWindow(span: number, period: number): number {
  return Math.max(span / 50, 3 * period);
}

/** Writes into `out[start..end)` the mean of `vals` over the points within ± half of
 *  each point. Two pointers keep the window's running sum: O(end − start). */
function windowMeans(xs: number[], vals: number[], start: number, end: number, half: number, out: Ys) {
  let lo = start;
  let hi = start;
  let sum = 0;
  for (let i = start; i < end; i++) {
    while (hi < end && xs[hi]! <= xs[i]! + half) sum += vals[hi++]!;
    while (xs[lo]! < xs[i]! - half) sum -= vals[lo++]!;
    out[i] = sum / (hi - lo);
  }
}

/** Centred moving average of each point over ± window/2, and the standard deviation
 *  of the residuals y − mid over the same window: a clean rise has no spread, only
 *  the noise around the curve counts. A null (a hole: board offline) splits the
 *  series: no window reaches across it. */
export function smooth(xs: number[], ys: Ys, window: number): { mid: Ys; sd: Ys } {
  const mid: Ys = ys.map(() => null);
  const sd: Ys = ys.map(() => null);
  const half = window / 2;
  let start = 0;
  while (start < ys.length) {
    if (ys[start] == null) {
      start++;
      continue;
    }
    let end = start;
    while (end < ys.length && ys[end] != null) end++;
    const vals = ys as number[];
    windowMeans(xs, vals, start, end, half, mid);
    const sq = vals.map((y, i) => (i >= start && i < end ? (y - mid[i]!) ** 2 : 0));
    windowMeans(xs, sq, start, end, half, sd);
    // Running sums can leave a tiny negative mean square.
    for (let i = start; i < end; i++) sd[i] = Math.sqrt(Math.max(0, sd[i]!));
    start = end;
  }
  return { mid, sd };
}

/** What a chart draws for a series: the raw values, the smoothed curve, or the
 *  smoothed curve with its band (mid ∓ 2 sd). No setting means raw. */
export function displaySeries(xs: number[], ys: Ys, s: Smoothing | undefined): { ys: Ys; lo: Ys | null; hi: Ys | null; sd: Ys | null } {
  if (!s || s.mode === "raw") return { ys, lo: null, hi: null, sd: null };
  const { mid, sd } = smooth(xs, ys, s.window);
  if (s.mode === "smooth") return { ys: mid, lo: null, hi: null, sd: null };
  const shift = (sign: number) => mid.map((m, i) => (m === null ? null : m + sign * 2 * sd[i]!));
  return { ys: mid, lo: shift(-1), hi: shift(1), sd };
}
