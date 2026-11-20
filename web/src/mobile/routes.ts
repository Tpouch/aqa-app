import { METRICS, type Metric } from "../../../server/src/types";

// Phone view: four tabs at the bottom. Any other hash (the web tabs, legacy
// links, nothing at all) lands on the dashboard; #/graph/<metric> is the
// full-screen chart of one metric.
export type MobileTab = "dashboard" | "alertes" | "infos" | "graph";

export const MOBILE_TABS: MobileTab[] = ["dashboard", "alertes", "infos", "graph"];
export const MOBILE_LABEL: Record<MobileTab, string> = {
  dashboard: "Dashboard", alertes: "Alertes", infos: "Infos", graph: "Graph",
};

// A touch screen whose short side is at most 720 px: a phone, in either
// orientation. A desktop window, however narrow, stays on the web view.
export const PHONE_QUERY = "(pointer: coarse) and (max-width: 720px), (pointer: coarse) and (max-height: 720px)";

export interface MobileRoute { tab: MobileTab; metric: Metric | null; redirect: string | null }

const isMetric = (v: string): v is Metric => (METRICS as readonly string[]).includes(v);

export function parseMobileRoute(hash: string): MobileRoute {
  const path = hash.replace(/^#\/?/, "");
  const graph = path.match(/^graph\/(.+)$/);
  if (graph) {
    const m = graph[1]!;
    return isMetric(m) ? { tab: "graph", metric: m, redirect: null } : { tab: "graph", metric: null, redirect: "#/graph" };
  }
  if ((MOBILE_TABS as string[]).includes(path)) return { tab: path as MobileTab, metric: null, redirect: null };
  return { tab: "dashboard", metric: null, redirect: "#/dashboard" };
}
