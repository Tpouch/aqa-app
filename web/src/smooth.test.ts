import { describe, expect, it } from "vitest";
import { mergeSeries } from "./compare";
import { displaySeries, smooth, smoothWindow } from "./smooth";

const xs = (n: number, step = 15) => Array.from({ length: n }, (_, i) => i * step);

describe("lissage", () => {
  it("série constante : mid = valeur, écart nul", () => {
    const { mid, sd } = smooth(xs(10), Array(10).fill(500), 60);
    expect(mid).toEqual(Array(10).fill(500));
    expect(sd.every((v) => v === 0)).toBe(true);
  });
  it("bruit autour d'une droite : mid proche de la droite, ~95 % des points dans la bande", () => {
    // y = 400 + i, bruit alterné ±10 ; fenêtre 150 s (11 points)
    const x = xs(200);
    const y = x.map((_, i) => 400 + i + (i % 2 ? 10 : -10));
    const r = displaySeries(x, y, { mode: "band", window: 150 });
    for (let i = 10; i < 190; i++) expect(Math.abs(r.ys[i]! - (400 + i))).toBeLessThan(2);
    const inside = y.filter((v, i) => v >= r.lo![i]! && v <= r.hi![i]!).length;
    expect(inside / y.length).toBeGreaterThanOrEqual(0.95);
  });
  it("droite sans bruit : marge quasi nulle hors des bords (la pente ne compte pas)", () => {
    // Montée de CO₂ propre de 25 ppm/min, pas de 60 s, fenêtre 1728 s (±14 points) ;
    // les bords, où la moyenne centrée est tronquée, sont laissés de côté.
    const x = xs(200, 60);
    const y = x.map((_, i) => 450 + i * 25);
    const { sd } = smooth(x, y, 1728);
    for (let i = 30; i < 170; i++) expect(sd[i]!).toBeLessThan(1);
  });
  it("respecte les trous", () => {
    const { mid } = smooth(xs(7), [10, 10, 10, null, 50, 50, 50], 1000); // fenêtre qui couvrirait tout
    expect(mid).toEqual([10, 10, 10, null, 50, 50, 50]);
  });
  it("point isolé : mid = valeur, écart 0", () => {
    const { mid, sd } = smooth(xs(3), [null, 42, null], 100);
    expect(mid).toEqual([null, 42, null]);
    expect(sd).toEqual([null, 0, null]);
  });
  it("marge : rien sur un trou", () => {
    const r = displaySeries(xs(3), [1, null, 3], { mode: "band", window: 60 });
    expect(r.lo).toEqual([1, null, 3]);
    expect(r.hi).toEqual([1, null, 3]);
  });
  it("tableau vide", () => {
    expect(smooth([], [], 60)).toEqual({ mid: [], sd: [] });
  });
  it("bords : fenêtre tronquée, pas de NaN", () => {
    const { mid } = smooth(xs(5), [0, 10, 20, 30, 40], 30); // ±15 s : voisins immédiats
    expect(mid).toEqual([5, 10, 20, 30, 35]);
  });
  it("brut ou sans réglage : séries inchangées, pas de bande", () => {
    const y = [1, 2, 3];
    expect(displaySeries(xs(3), y, undefined)).toEqual({ ys: y, lo: null, hi: null, sd: null });
    expect(displaySeries(xs(3), y, { mode: "raw", window: 60 }).ys).toBe(y);
  });
  it("lissé : pas de bande", () => {
    const r = displaySeries(xs(3), [1, 2, 3], { mode: "smooth", window: 30 });
    expect(r.lo).toBeNull();
    expect(r.hi).toBeNull();
    expect(r.ys).toEqual([1.5, 2, 2.5]);
  });
  it("smoothWindow : 1/50 de la durée, au moins 3 périodes", () => {
    expect(smoothWindow(86400, 60)).toBe(1728);
    expect(smoothWindow(600, 15)).toBe(45);
  });
  it("bande alignable avec mergeSeries (comparaison)", () => {
    const r = displaySeries(xs(4), [1, 2, 3, 4], { mode: "band", window: 30 });
    const m = mergeSeries(xs(4), r.lo!, [7, 22], [5, 6]);
    expect(m.a.length).toBe(m.xs.length);
  });
});
