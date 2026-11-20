import { describe, expect, it } from "vitest";
import { bandOf, bandRanges, metricDef, periodStats, SOUND_DB_BANDS, soundDb, toDisplay, yRange } from "./metrics";

const cal = { snd_ref: 31, db_ref: 45 };

describe("metrics", () => {
  it("classe le CO₂", () => {
    const d = metricDef("co2", null);
    expect([799, 800, 1199, 1200].map((v) => bandOf(d, v)?.word)).toEqual(["bon", "aérer", "aérer", "mauvais"]);
    expect(bandOf(d, null)).toBeNull();
  });
  it("inclut 24 °C et 60 % dans le confort", () => {
    expect(bandOf(metricDef("temp", null), 24)?.word).toBe("confort");
    expect(bandOf(metricDef("temp", null), 24.1)?.word).toBe("chaud");
    expect(bandOf(metricDef("temp", null), 18.9)?.tone).toBe("bad");
    expect(bandOf(metricDef("hum", null), 60)?.word).toBe("confort");
  });
  it("convertit le son", () => {
    expect(soundDb(31, cal)).toBeCloseTo(45);
    expect(soundDb(310, cal)).toBeCloseTo(65);
    expect(soundDb(0, cal)).toBeNull();
    expect(soundDb(null, cal)).toBeNull();
    expect(toDisplay("snd", 310, null)).toBe(310);
    expect(toDisplay("co2", 612, cal)).toBe(612);
  });
  it("change le son selon la calibration", () => {
    expect(metricDef("snd", null).bands).toBeNull();
    expect(metricDef("snd", cal).unit).toBe("dB (estimé)");
  });
  it("montre toujours la zone suivante (2c)", () => {
    const [lo, hi] = yRange(metricDef("co2", null), 450, 600);
    expect(hi).toBeGreaterThanOrEqual(800);
    expect(lo).toBeLessThanOrEqual(450);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(yRange(metricDef("co2", null), 450, 1000)[1]).toBeGreaterThanOrEqual(1200);
    const [tlo, thi] = yRange(metricDef("temp", null), 20, 21);
    expect(tlo).toBeLessThanOrEqual(19);
    expect(thi).toBeGreaterThanOrEqual(24);
  });
  it("calcule un axe sans données", () => {
    const [lo, hi] = yRange(metricDef("pm25", null), null, null);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThanOrEqual(15);
  });
  it("calcule les stats en ignorant les trous", () => {
    const d = metricDef("co2", null);
    const s = periodStats(d, [0, 60, 120, 180, 240], [700, null, 1300, 1250, 900], 60)!;
    expect(s.min).toEqual({ v: 700, ts: 0 });
    expect(s.max).toEqual({ v: 1300, ts: 120 });
    expect(s.avg).toBeCloseTo(1037.5);
    expect(s.alertSeconds).toBe(120);
    expect(periodStats(d, [0, 60], [null, null], 60)).toBeNull();
    expect(periodStats(metricDef("snd", null), [0], [12], 60)!.alertSeconds).toBeNull();
  });
});

describe("bandRanges", () => {
  const nb = (s: string) => s.replace(/ | /g, " ");
  it("CO₂", () => expect(bandRanges(metricDef("co2", null).bands!, "ppm").map(nb))
    .toEqual(["moins de 800 ppm", "800 à 1 200 ppm", "1 200 ppm et plus"]));
  it("température, borne inclusive", () => expect(bandRanges(metricDef("temp", null).bands!, "°C"))
    .toEqual(["moins de 19 °C", "19 à 24 °C", "plus de 24 °C"]));
  it("humidité, borne inclusive", () => expect(bandRanges(metricDef("hum", null).bands!, "%"))
    .toEqual(["moins de 40 %", "40 à 60 %", "plus de 60 %"]));
  it("son en dB", () => expect(bandRanges(SOUND_DB_BANDS, "dB"))
    .toEqual(["moins de 55 dB", "55 à 70 dB", "70 dB et plus"]));
});
