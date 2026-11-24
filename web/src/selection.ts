import { useCallback, useState } from "react";
import { METRICS, type Metric } from "../../server/src/types";

// What the Mesures page shows: one metric, or a grid of the checked ones, and the
// room put next to the shown one on the single chart (board id, null = none).
// Kept for the browser tab's lifetime, like the other view settings.
export interface Selection { view: "single" | "grid"; metric: Metric; grid: Metric[]; compare: string | null }

const KEYS = { view: "aqa-view", metric: "aqa-sensor-metric", grid: "aqa-grid-metrics", compare: "aqa-compare" } as const;

const isMetric = (v: unknown): v is Metric => (METRICS as readonly unknown[]).includes(v);

function load(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function readSelection(): Selection {
  const view = load(KEYS.view);
  const metric = load(KEYS.metric);
  const grid = load(KEYS.grid);
  const compare = load(KEYS.compare);
  const checked = Array.isArray(grid) ? METRICS.filter((m) => grid.includes(m)) : [];
  return {
    view: view === "grid" ? "grid" : "single",
    metric: isMetric(metric) ? metric : "co2",
    grid: checked.length ? checked : [...METRICS],
    compare: typeof compare === "string" ? compare : null,
  };
}

function save(s: Selection) {
  try {
    sessionStorage.setItem(KEYS.view, JSON.stringify(s.view));
    sessionStorage.setItem(KEYS.metric, JSON.stringify(s.metric));
    sessionStorage.setItem(KEYS.grid, JSON.stringify(s.grid));
    sessionStorage.setItem(KEYS.compare, JSON.stringify(s.compare));
  } catch {
    // Blocked storage: the selection still holds for this page view.
  }
}

export function useSelection(): [Selection, (s: Selection) => void] {
  const [selection, setSelection] = useState(readSelection);
  const update = useCallback((s: Selection) => {
    // Grid metrics stay in the column's order.
    const next = { ...s, grid: METRICS.filter((m) => s.grid.includes(m)) };
    save(next);
    setSelection(next);
  }, []);
  return [selection, update];
}
