// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { METRICS } from "../../server/src/types";
import { readSelection } from "./selection";

const DEFAULTS = { view: "single", metric: "co2", grid: [...METRICS] };

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
    expect(readSelection()).toEqual(DEFAULTS);
  });
  it("relit une sélection valide", () => {
    sessionStorage.setItem("aqa-view", JSON.stringify("grid"));
    sessionStorage.setItem("aqa-sensor-metric", JSON.stringify("pm25"));
    sessionStorage.setItem("aqa-grid-metrics", JSON.stringify(["pm25", "co2"]));
    expect(readSelection()).toMatchObject({ view: "grid", metric: "pm25" });
  });
});
