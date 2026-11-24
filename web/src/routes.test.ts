import { describe, expect, it } from "vitest";
import { parseRoute, TAB_ORDER } from "./routes";

describe("parseRoute", () => {
  it.each([
    ["", "mesures", "#/mesures"], ["#/overview", "mesures", "#/mesures"], ["#/sensor", "mesures", "#/mesures"],
    ["#/commands", "carte", "#/carte"], ["#/options", "reglages", "#/reglages"],
    ["#/alertes", "alertes", null], ["#/bilan", "bilan", null], ["#/mesures", "mesures", null], ["#/infos", "infos", null], ["#/carte", "carte", null], ["#/nimporte", "mesures", "#/mesures"],
    // Liens de la version mobile ouverts sur ordinateur (#/infos existe des deux côtés).
    ["#/dashboard", "mesures", "#/mesures"], ["#/graph/co2", "mesures", "#/mesures"],
  ])("%s → %s", (h, tab, redirect) => expect(parseRoute(h)).toMatchObject({ tab, redirect }));
  it("place Bilan juste après Mesures", () => expect(TAB_ORDER.slice(0, 2)).toEqual(["mesures", "bilan"]));
  it("reprend la carte des anciens liens", () =>
    expect(parseRoute("#/device/aqa-24A160B3C8F0/commands")).toEqual({ tab: "carte", redirect: "#/carte", device: "aqa-24A160B3C8F0" }));
});
