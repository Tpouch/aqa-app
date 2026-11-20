import { describe, expect, it } from "vitest";
import { parseMobileRoute, PHONE_QUERY } from "./routes";

describe("parseMobileRoute", () => {
  it.each([
    ["#/dashboard", "dashboard", null, null],
    ["#/alertes", "alertes", null, null],
    ["#/infos", "infos", null, null],
    ["#/graph", "graph", null, null],
    ["#/graph/co2", "graph", "co2", null],
    ["#/graph/xyz", "graph", null, "#/graph"],
    ["", "dashboard", null, "#/dashboard"],
    ["#/mesures", "dashboard", null, "#/dashboard"],
    ["#/carte", "dashboard", null, "#/dashboard"],
    ["#/reglages", "dashboard", null, "#/dashboard"],
    ["#/device/aqa-24A160B3C8F0/commands", "dashboard", null, "#/dashboard"],
  ])("%s → %s", (h, tab, metric, redirect) =>
    expect(parseMobileRoute(h)).toEqual({ tab, metric, redirect }));
});

it("PHONE_QUERY : tactile et petit côté ≤ 720", () => {
  expect(PHONE_QUERY).toContain("pointer: coarse");
  expect(PHONE_QUERY).toContain("max-width: 720px");
  expect(PHONE_QUERY).toContain("max-height: 720px");
});
