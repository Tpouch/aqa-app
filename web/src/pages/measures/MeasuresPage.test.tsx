// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { METRICS } from "../../../../server/src/types";
import type { Selection } from "../../selection";

// uPlot (via ZoneChart) and the grid read matchMedia; jsdom has none.
const state = vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return { loading: false };
});

// Five one-minute averages of every metric; `state.loading` switches to the skeleton.
vi.mock("../device/shared", async (importOriginal) => {
  const real = await importOriginal<typeof import("../device/shared")>();
  return {
    ...real,
    useSeries: (id: string | null) => {
      const xs = [0, 60, 120, 180, 240];
      const col = [500, 520, 900, 540, 560];
      const columns = { xs, ...Object.fromEntries(METRICS.map((m) => [m, id ? col : []])) };
      return {
        data: state.loading ? null : { id, from: 0, to: 240, rows: [] },
        columns, step: 60, window: [0, 240] as [number, number], loading: state.loading, error: null,
      };
    },
  };
});
const { MeasuresPage } = await import("./MeasuresPage");

const selection = (over: Partial<Selection>): Selection =>
  ({ view: "single", metric: "co2", grid: ["co2", "temp"], compare: null, smoothing: "smooth", ...over });
const page = (s: Selection) =>
  renderToStaticMarkup(<MeasuresPage id="aqa-A" device={null} others={[]} selection={s} onSelection={() => {}} />);

describe("Mesures : lissage", () => {
  it("1 graphe lissé : la courbe montre la valeur lissée", () => {
    state.loading = false;
    // Fenêtre minimale de 3 pas (180 s) : la dernière valeur moyenne 540 et 560.
    expect(page(selection({}))).toContain("dernière valeur 550 ppm");
  });
  it("brut : la valeur reçue", () => {
    state.loading = false;
    expect(page(selection({ smoothing: "raw" }))).toContain("dernière valeur 560 ppm");
  });
  it("grille lissée : chaque graphe lissé", () => {
    state.loading = false;
    const html = page(selection({ view: "grid" }));
    expect(html).toContain("Ouvrir CO₂ en grand, dernière valeur 550 ppm");
  });
  it("en chargement : le sélecteur est déjà là", () => {
    state.loading = true;
    expect(page(selection({ smoothing: "band" }))).toMatch(/aria-pressed="true"[^>]*>marge</);
  });
});
