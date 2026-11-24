// Six tabs. Every older hash (#/overview, #/sensor, #/commands, #/options,
// #/device/<id>/<tab>) maps onto one of them and is replaced by its canonical form.
export type Tab = "mesures" | "bilan" | "alertes" | "carte" | "reglages" | "infos";

export const TAB_LABEL: Record<Tab, string> = { mesures: "Mesures", bilan: "Bilan", alertes: "Alertes", carte: "Carte", reglages: "Réglages", infos: "Infos" };
export const TAB_ORDER: Tab[] = ["mesures", "bilan", "alertes", "carte", "reglages", "infos"];

const ALIASES = new Map<string, Tab>([
  ["mesures", "mesures"], ["bilan", "bilan"], ["alertes", "alertes"], ["carte", "carte"], ["reglages", "reglages"], ["infos", "infos"],
  ["overview", "mesures"], ["sensor", "mesures"], ["commands", "carte"], ["options", "reglages"],
]);

export interface Route { tab: Tab; redirect: string | null; device: string | null }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "");
  const legacy = path.match(/^\/device\/(aqa-[0-9A-F]{12})(?:\/(\w+))?\/?$/);
  const key = legacy ? legacy[2] ?? "" : path.replace(/^\//, "");
  const tab = ALIASES.get(key) ?? "mesures";
  const canonical = `#/${tab}`;
  return { tab, redirect: hash === canonical ? null : canonical, device: legacy ? legacy[1]! : null };
}
