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
const { ZoneChart, ZoneTip, axisSplits, currentLabel, toneClass } = await import("./ZoneChart");

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

describe("ZoneChart : morceaux", () => {
  it("graduations : limites de zone toujours, graduations régulières si elles ne les serrent pas", () => {
    expect(axisSplits([], 0, 1000, 250)).toEqual([0, 250, 500, 750, 1000]);
    expect(axisSplits([800, null, 5000], 0, 1000, 250)).toEqual([0, 250, 500, 800, 1000]);
  });
  it("texte lu : valeur actuelle, dernière valeur, aucune mesure, pièce comparée", () => {
    expect(currentLabel(def, false, 612, null)).toBe("valeur actuelle 612 ppm");
    expect(currentLabel(def, true, 612, null)).toBe("dernière valeur 612 ppm");
    expect(currentLabel(def, false, null, null)).toBe("aucune mesure sur cette période");
    expect(currentLabel(def, false, 612, { name: "Chambre", value: 700 })).toBe("valeur actuelle 612 ppm, Chambre 700 ppm");
    expect(currentLabel(def, false, 612, { name: "Chambre", value: null })).toBe("valeur actuelle 612 ppm, Chambre aucune mesure");
  });
  it("classe de zone", () => {
    expect(toneClass("bad")).toBe("tone-bad");
    expect(toneClass(undefined)).toBe("");
  });
  it("infobulle : une valeur, ou une ligne par pièce", () => {
    const one = renderToStaticMarkup(<ZoneTip left={10} flip={false} time="jeu. 13:50" own={{ text: "612 ppm ± 40", tone: "warn" }} other={undefined} />);
    expect(one).toContain('class="zc-tip"');
    expect(one).toContain('<span class="zc-tip-value tone-warn">612 ppm ± 40</span>');
    const two = renderToStaticMarkup(<ZoneTip left={10} flip time="jeu. 13:50"
      own={{ room: "Salon", text: "612 ppm", tone: undefined }} other={{ room: "Chambre", text: "700 ppm", tone: "good" }} />);
    expect(two).toContain('class="zc-tip flip"');
    expect(two).toContain('Salon</span><span class="zc-tip-value">612 ppm</span>');
    expect(two).toContain('Chambre</span><span class="zc-tip-value tone-good">700 ppm</span>');
  });
});
