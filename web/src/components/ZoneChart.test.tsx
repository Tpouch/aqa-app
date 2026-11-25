// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { metricDef } from "../metrics";

// uPlot reads the pixel ratio through matchMedia when it loads; jsdom has none.
vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
const { ZoneChart } = await import("./ZoneChart");

// Server rendering runs the component body (columns, current value) but no effect:
// the canvas itself is never drawn here.
const def = metricDef("co2", null);
const xs = [0, 60, 120, 180, 240];
const ys = [500, 520, 900, 540, 560];
const range: [number, number] = [0, 240];
const chart = (props: Partial<Parameters<typeof ZoneChart>[0]> = {}) =>
  renderToStaticMarkup(<ZoneChart def={def} xs={xs} ys={ys} range={range} height={200} {...props} />);
const label = (html: string) => /aria-label="([^"]*)"/.exec(html)![1];

describe("ZoneChart : lissage", () => {
  it("brut : la dernière valeur reçue", () => {
    expect(label(chart())).toContain("dernière valeur 560 ppm");
  });
  it("lissé : la dernière valeur de la courbe lissée", () => {
    // ± 60 s autour de 240 : moyenne de 540 et 560.
    expect(label(chart({ smoothing: { mode: "smooth", window: 120 } }))).toContain("dernière valeur 550 ppm");
  });
  it("marge + comparaison : la pièce comparée est lissée aussi", () => {
    const html = chart({
      smoothing: { mode: "band", window: 120 },
      compare: { here: "Salon", name: "Chambre", xs: [100, 150], ys: [700, 800], tolerance: 60 },
    });
    expect(label(html)).toContain("dernière valeur 550 ppm, Chambre 750 ppm");
  });
});
