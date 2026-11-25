import { METRICS, type Metric } from "../../../server/src/types";
import { t } from "../i18n/dict";

// Phone view: five tabs at the bottom. Any other hash (the web tabs, legacy
// links, nothing at all) lands on the dashboard; #/graph/<metric> is the
// full-screen chart of one metric.
export type MobileTab = "dashboard" | "bilan" | "alertes" | "infos" | "graph";

export const MOBILE_TABS: MobileTab[] = ["dashboard", "bilan", "alertes", "infos", "graph"];
/** Tab name in the active language. */
export const mobileLabel = (tab: MobileTab): string =>
  tab === "bilan" || tab === "alertes" || tab === "infos" ? t().tabs[tab] : MOBILE_LABEL[tab];

export const MOBILE_LABEL: Record<MobileTab, string> = {
  dashboard: "Dashboard", bilan: "Bilan", alertes: "Alertes", infos: "Infos", graph: "Graph",
};

// A touch screen whose short side is at most 720 px: a phone, in either
// orientation. Judged on the screen, not the viewport, so a tablet never flips
// between views when rotated. A desktop window, however narrow, stays on the web view.
export const COARSE_QUERY = "(pointer: coarse)";

export function isPhoneScreen(coarse: boolean, screenWidth: number, screenHeight: number): boolean {
  return coarse && Math.min(screenWidth, screenHeight) <= 720;
}

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
