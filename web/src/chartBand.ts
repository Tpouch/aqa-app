// How ZoneChart hands the smoothed curves and the ± 2σ band to uPlot. Pure, so the
// parts the canvas can't show in a test are tested here.
import type uPlot from "uplot";
import { valueNear, type Cell } from "./compare";
import type { MetricDef } from "./metrics";
import type { ChartColumns } from "./smooth";
import { fmt } from "./util";

/** uPlot data: x, this room, the other room if any, then the band's lower and upper
 *  edges. `bandFrom` is the lower edge's index (upper = +1). */
export function chartData(c: ChartColumns): { data: uPlot.AlignedData; bandFrom: number; banded: boolean } {
  const banded = c.lo !== null && c.hi !== null;
  const data: Cell[][] = [c.a, ...(c.b ? [c.b] : []), ...(banded ? [c.lo!, c.hi!] : [])];
  return { data: [c.xs, ...data] as uPlot.AlignedData, bandFrom: c.b ? 3 : 2, banded };
}

/** The band's two thin edges and the fill between them (uPlot: [upper, lower]). */
export function bandOptions(banded: boolean, bandFrom: number, stroke: string, fill: string): { series: uPlot.Series[]; bands: uPlot.Band[] } {
  if (!banded) return { series: [], bands: [] };
  const edge = (): uPlot.Series => ({ stroke, width: 1, spanGaps: false, points: { show: false } });
  return { series: [edge(), edge()], bands: [{ series: [bandFrom + 1, bandFrom], fill }] };
}

/** Hover dots on the curves, none on the band's edges. */
export function hoverDot(bandFrom: number) {
  return {
    size: (_u: uPlot, si: number) => (si >= bandFrom ? 0 : 8),
    width: (_u: uPlot, si: number, _size: number) => (si >= bandFrom ? 0 : 2),
  };
}

/** "612 ppm", or "612 ppm ± 40" with the band's half-width (2 sd). */
export function withSpread(def: Pick<MetricDef, "unit" | "decimals">, value: number | null, spread: number | null): string {
  const text = `${fmt(value, def.decimals)} ${def.unit}`;
  return spread === null ? text : `${text} ± ${fmt(2 * spread, def.decimals)}`;
}

/** Standard deviation under the cursor, or null (no band, no hover, cursor off the data). */
export function spreadAt(xs: number[], sd: Cell[] | null, hover: { idx: number } | null, tolerance: number): number | null {
  if (!sd || !hover || xs[hover.idx] === undefined) return null;
  return valueNear(xs, sd, hover.idx, tolerance);
}
