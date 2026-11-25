import { describe, expect, it } from "vitest";
import { bandOptions, chartData, hoverDot, spreadAt, withSpread } from "./chartBand";
import type { MetricDef } from "./metrics";
import { chartColumns } from "./smooth";

const xs = [0, 15, 30];
const ys = [400, 410, 420];
const band = { mode: "band", window: 30 } as const;
const def = { unit: "ppm", decimals: 0 } as MetricDef;
const u = null as never; // uPlot instance: unused by the callbacks

describe("données du graphe", () => {
  it("brut sans comparaison : x et la courbe, pas de bande", () => {
    expect(chartData(chartColumns(xs, ys, null, undefined))).toEqual({ data: [xs, ys], bandFrom: 2, banded: false });
  });
  it("marge : bornes basse puis haute après la courbe", () => {
    const c = chartColumns(xs, ys, null, band);
    expect(chartData(c)).toEqual({ data: [xs, c.a, c.lo, c.hi], bandFrom: 2, banded: true });
  });
  it("marge + comparaison : la pièce comparée avant la bande", () => {
    const c = chartColumns(xs, ys, { xs: [7], ys: [500] }, band);
    expect(chartData(c)).toEqual({ data: [c.xs, c.a, c.b, c.lo, c.hi], bandFrom: 3, banded: true });
  });
});

describe("options de la bande", () => {
  it("sans bande : rien", () => {
    expect(bandOptions(false, 2, "grey", "tint")).toEqual({ series: [], bands: [] });
  });
  it("bords fins sans points, remplissage du haut vers le bas", () => {
    const o = bandOptions(true, 3, "grey", "tint");
    expect(o.series).toEqual([0, 1].map(() => ({ stroke: "grey", width: 1, spanGaps: false, points: { show: false } })));
    expect(o.bands).toEqual([{ series: [4, 3], fill: "tint" }]);
  });
  it("pas de point de survol sur les bords", () => {
    const dot = hoverDot(3);
    expect([1, 2, 3, 4].map((si) => dot.size(u, si))).toEqual([8, 8, 0, 0]);
    expect([1, 2, 3, 4].map((si) => dot.width(u, si, 8))).toEqual([2, 2, 0, 0]);
  });
});

describe("valeur ± marge", () => {
  it("sans marge : valeur et unité", () => {
    expect(withSpread(def, 612, null)).toBe("612 ppm");
  });
  it("avec marge : ± 2 écarts-types", () => {
    expect(withSpread(def, 612, 20)).toBe("612 ppm ± 40");
  });
  it("écart sous le curseur", () => {
    const sd = [1, 2, 3];
    expect(spreadAt(xs, sd, { idx: 1 }, 0)).toBe(2);
    expect(spreadAt(xs, sd, null, 0)).toBeNull();
    expect(spreadAt(xs, null, { idx: 1 }, 0)).toBeNull();
    expect(spreadAt(xs, sd, { idx: 9 }, 0)).toBeNull();
  });
});
