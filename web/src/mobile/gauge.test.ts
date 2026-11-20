import { expect, it } from "vitest";
import { metricDef } from "../metrics";
import { gaugeAngle, gaugeScale, gaugeSegments } from "./gauge";

const co2 = metricDef("co2", null);
const s = gaugeScale("co2", false);

it("gaugeAngle : bornes", () => {
  expect(gaugeAngle(s, 400)).toBe(135);
  expect(gaugeAngle(s, 2000)).toBe(405);
  expect(gaugeAngle(s, 1200)).toBe(270);
});

it("gaugeAngle plafonne", () => {
  expect(gaugeAngle(s, 2600)).toBe(405);
  expect(gaugeAngle(gaugeScale("temp", false), -3)).toBe(135);
});

it("gaugeSegments : bandes du CO₂", () =>
  expect(gaugeSegments(co2, s)).toEqual([
    { from: 135, to: 202.5, tone: "good" }, { from: 202.5, to: 270, tone: "warn" }, { from: 270, to: 405, tone: "bad" },
  ]));

it("gaugeSegments : température, deux côtés", () =>
  expect(gaugeSegments(metricDef("temp", null), gaugeScale("temp", false)).map((x) => x.tone)).toEqual(["bad", "good", "bad"]));

it("gaugeSegments : son non calibré, arc neutre", () =>
  expect(gaugeSegments(metricDef("snd", null), gaugeScale("snd", false))).toEqual([{ from: 135, to: 405, tone: null }]));

it("gaugeScale : son calibré en dB", () => expect(gaugeScale("snd", true)).toEqual({ min: 30, max: 90 }));
