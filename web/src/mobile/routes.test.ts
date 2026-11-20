import { describe, expect, it } from "vitest";
import { isPhoneScreen, parseMobileRoute } from "./routes";

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

describe("isPhoneScreen : tactile et petit côté de l'écran ≤ 720", () => {
  it.each([
    [true, 390, 844, true],    // iPhone portrait
    [true, 844, 390, true],    // iPhone paysage
    [true, 744, 1133, false],  // iPad mini, quelle que soit l'orientation
    [true, 1133, 744, false],
    [true, 1280, 800, false],  // tablette Android paysage
    [false, 600, 900, false],  // ordinateur, fenêtre étroite
  ])("coarse=%s %sx%s → %s", (coarse, w, h, want) => expect(isPhoneScreen(coarse, w, h)).toBe(want));
});
