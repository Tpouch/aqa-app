import { describe, expect, it } from "vitest";
import { parseRoute } from "./routes";

describe("parseRoute", () => {
  it.each([
    ["", "mesures", "#/mesures"], ["#/overview", "mesures", "#/mesures"], ["#/sensor", "mesures", "#/mesures"],
    ["#/commands", "carte", "#/carte"], ["#/options", "reglages", "#/reglages"],
    ["#/alertes", "alertes", null], ["#/mesures", "mesures", null], ["#/infos", "infos", null], ["#/carte", "carte", null], ["#/nimporte", "mesures", "#/mesures"],
  ])("%s → %s", (h, tab, redirect) => expect(parseRoute(h)).toMatchObject({ tab, redirect }));
  it("reprend la carte des anciens liens", () =>
    expect(parseRoute("#/device/aqa-24A160B3C8F0/commands")).toEqual({ tab: "carte", redirect: "#/carte", device: "aqa-24A160B3C8F0" }));
});
