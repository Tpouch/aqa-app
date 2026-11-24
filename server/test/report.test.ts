import { describe, expect, it } from "vitest";
import { buildReport, type ReportInput } from "../src/report.js";
import type { AggregateRow, Metric } from "../src/types.js";

// Monday 16 November 2026, 00:00 in Paris; the week ends on Monday 23.
const FROM = Date.UTC(2026, 10, 15, 23) / 1000;
const TO = FROM + 7 * 86400;
const PREV = FROM - 7 * 86400;
const STEP = 60;

type Values = Partial<Record<Metric, number | null>>;
const blank: Record<Metric, null> = { co2: null, pm25: null, snd: null, temp: null, hum: null };

/** `minutes` one-minute buckets from `start`, all with the same values. */
function rows(start: number, minutes: number, v: Values): AggregateRow[] {
  return Array.from({ length: minutes }, (_, i) => ({ ts: start + i * STEP, n: 4, ...blank, ...v }));
}

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    deviceId: "aqa-24A160B3C8F0", kind: "week", tz: "Europe/Paris",
    from: FROM, to: TO, prevFrom: PREV, now: TO + 3600, cal: null, step: STEP,
    current: [], previous: [], alerts: { current: [], previous: [] },
    ...over,
  };
}

const metric = (r: ReturnType<typeof buildReport>, m: Metric) => r.metrics.find((x) => x.metric === m)!;

describe("buildReport", () => {
  it("compte le temps passé dans chaque zone", () => {
    const r = buildReport(input({ current: [...rows(FROM, 60, { co2: 600 }), ...rows(FROM + 3600, 30, { co2: 1300 })] }));
    expect(metric(r, "co2").current.zones).toEqual([
      { word: "bon", tone: "good", seconds: 3600 },
      { word: "aérer", tone: "warn", seconds: 0 },
      { word: "mauvais", tone: "bad", seconds: 1800 },
    ]);
    expect(metric(r, "co2").current.avg).toBeCloseTo((60 * 600 + 30 * 1300) / 90);
    expect(metric(r, "co2").current.max).toEqual({ v: 1300, ts: FROM + 3600 });
    expect(r.air.current).toEqual({ measured_s: 5400, good_s: 3600, warn_s: 0, bad_s: 1800 });
    expect(r.measured_s).toBe(5400);
  });

  it("prend la pire zone entre CO₂ et PM2.5", () => {
    const r = buildReport(input({ current: rows(FROM, 10, { co2: 600, pm25: 40 }) }));
    expect(r.air.current).toEqual({ measured_s: 600, good_s: 0, warn_s: 0, bad_s: 600 });
  });

  it("ignore les tranches hors de la période et coupe à maintenant", () => {
    const now = FROM + 2 * 86400;
    const r = buildReport(input({
      now,
      current: [...rows(FROM - 600, 10, { co2: 600 }), ...rows(FROM, 10, { co2: 600 }), ...rows(now, 10, { co2: 600 })],
    }));
    expect(r.measured_s).toBe(600);
    expect(r.elapsed_s).toBe(2 * 86400);
    expect(r.in_progress).toBe(true);
    expect(buildReport(input()).in_progress).toBe(false);
  });

  it("calcule la période précédente", () => {
    const r = buildReport(input({ previous: rows(PREV, 120, { co2: 1300 }) }));
    expect(metric(r, "co2").previous.zones?.[2]?.seconds).toBe(7200);
    expect(r.prev_measured_s).toBe(7200);
    expect(r.prev_elapsed_s).toBe(7 * 86400);
  });

  it("calcule l'air sur le CO₂ seul sans PM2.5", () => {
    const r = buildReport(input({ current: rows(FROM, 10, { co2: 600 }) }));
    expect(r.air.current.good_s).toBe(600);
    expect(metric(r, "pm25").current).toMatchObject({ measured_s: 0, avg: null, min: null, max: null });
  });

  it("convertit le son avec la calibration", () => {
    const cal = buildReport(input({ cal: { snd_ref: 100, db_ref: 60 }, current: rows(FROM, 10, { snd: 100 }) }));
    expect(cal.sound_calibrated).toBe(true);
    expect(metric(cal, "snd").current.avg).toBeCloseTo(60);
    expect(metric(cal, "snd").current.zones?.find((z) => z.seconds > 0)?.word).toBe("bruyant");
    const raw = buildReport(input({ current: rows(FROM, 10, { snd: 100 }) }));
    expect(raw.sound_calibrated).toBe(false);
    expect(metric(raw, "snd").current).toMatchObject({ zones: null, avg: 100 });
    expect(metric(raw, "snd").comparison).toBeNull();
  });

  it("remplit la carte de chaleur jour par jour en heure locale", () => {
    // Tuesday 17 November, 22:00–22:59 in Paris = 21:00 UTC.
    const r = buildReport(input({ current: rows(Date.UTC(2026, 10, 17, 21) / 1000, 60, { co2: 1300 }) }));
    expect(r.heatmap.by).toBe("day");
    expect(r.heatmap.rows).toHaveLength(7);
    expect(r.heatmap.rows.map((x) => x.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.heatmap.rows[0]!.date).toBe("2026-11-16");
    expect(r.heatmap.rows[1]!.date).toBe("2026-11-17");
    expect(r.heatmap.rows[1]!.cells).toHaveLength(24);
    expect(r.heatmap.rows[1]!.cells[22]).toBe(1300);
    expect(r.heatmap.rows[1]!.cells[21]).toBeNull();
  });

  it("moyenne les jours de la semaine sur un mois", () => {
    const tue = (d: number) => Date.UTC(2026, 10, d, 21) / 1000;
    const from = Date.UTC(2026, 9, 31, 23) / 1000; // 1 November 2026, Paris
    const r = buildReport(input({
      kind: "month", from, to: Date.UTC(2026, 10, 30, 23) / 1000, prevFrom: Date.UTC(2026, 8, 30, 22) / 1000,
      current: [...rows(tue(10), 60, { co2: 1000 }), ...rows(tue(17), 60, { co2: 1400 })],
    }));
    expect(r.heatmap.by).toBe("weekday");
    expect(r.heatmap.rows[1]).toMatchObject({ weekday: 1, date: null });
    expect(r.heatmap.rows[1]!.cells[22]).toBe(1200);
  });

  it("reste calme sans aucune mesure", () => {
    const r = buildReport(input());
    expect(r.measured_s).toBe(0);
    expect(r.verdict.tone).toBeNull();
    expect(r.takeaways).toEqual([]);
    expect(r.heatmap.rows.every((x) => x.cells.every((c) => c === null))).toBe(true);
  });

  it("compte les alertes par type", () => {
    const r = buildReport(input({ alerts: { current: ["hum_low", "co2_high", "co2_high"], previous: ["co2_high"] } }));
    expect(r.alerts.current).toBe(3);
    expect(r.alerts.previous).toBe(1);
    expect(r.alerts.by_kind).toEqual([
      { kind: "co2_high", label: "CO₂ élevé", count: 2 },
      { kind: "hum_low", label: "Air trop sec", count: 1 },
    ]);
  });

  it("assemble verdict, comparaisons et constats", () => {
    const r = buildReport(input({
      current: rows(FROM, 600, { co2: 600, temp: 21, hum: 50 }),
      previous: rows(PREV, 2000, { co2: 1300, temp: 21, hum: 50 }),
    }));
    expect(r.verdict.head).toBe("Bonne semaine");
    expect(metric(r, "co2").comparison?.trend).toBe("better");
    expect(r.takeaways.length).toBeGreaterThan(0);
  });
});
