import { describe, expect, it } from "vitest";
import { METRICS } from "../../../../server/src/types";
import { METRIC_INFO } from "./infoText";

describe("METRIC_INFO", () => {
  it.each(METRICS)("%s a tous ses textes", (m) => {
    const info = METRIC_INFO[m];
    for (const k of ["what", "why", "todo", "danger", "unitHelp"] as const) expect(info[k].trim()).not.toBe("");
  });
  it("donne les repères de danger chiffrés", () => {
    expect(METRIC_INFO.co2.danger).toContain("5 000");
    expect(METRIC_INFO.pm25.danger).toContain("15");
  });
});
