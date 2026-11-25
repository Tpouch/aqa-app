// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { METRICS } from "../../server/src/types";
import { readSelection } from "./selection";

const DEFAULTS = { view: "single", metric: "co2", grid: [...METRICS], compare: null, smoothing: "smooth" };

describe("sélection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });
  it("revient aux valeurs par défaut si le stockage lève", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => readSelection()).not.toThrow();
    expect(readSelection()).toEqual(DEFAULTS);
  });
  it("ignore un JSON illisible", () => {
    sessionStorage.setItem("aqa-view", "{oops");
    sessionStorage.setItem("aqa-sensor-metric", "not json");
    sessionStorage.setItem("aqa-grid-metrics", "[");
    sessionStorage.setItem("aqa-compare", "{");
    sessionStorage.setItem("aqa-smoothing", "{");
    expect(readSelection()).toEqual(DEFAULTS);
  });
  it("relit une sélection valide", () => {
    sessionStorage.setItem("aqa-view", JSON.stringify("grid"));
    sessionStorage.setItem("aqa-sensor-metric", JSON.stringify("pm25"));
    sessionStorage.setItem("aqa-grid-metrics", JSON.stringify(["pm25", "co2"]));
    sessionStorage.setItem("aqa-compare", JSON.stringify("aqa-B"));
    sessionStorage.setItem("aqa-smoothing", JSON.stringify("band"));
    expect(readSelection()).toMatchObject({ view: "grid", metric: "pm25", compare: "aqa-B", smoothing: "band" });
  });
  it("pièce comparée : seulement un identifiant", () => {
    sessionStorage.setItem("aqa-compare", JSON.stringify(42));
    expect(readSelection().compare).toBeNull();
  });
  it("mode de lissage inconnu : lissé", () => {
    sessionStorage.setItem("aqa-smoothing", JSON.stringify("foo"));
    expect(readSelection().smoothing).toBe("smooth");
    sessionStorage.setItem("aqa-smoothing", JSON.stringify(42));
    expect(readSelection().smoothing).toBe("smooth");
  });
});
