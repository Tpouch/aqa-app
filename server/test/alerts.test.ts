import { describe, expect, it } from "vitest";
import { decideMetric, decideOffline, type Sample } from "../src/alerts.js";

const now = 10_000;
const rule = { enabled: true, threshold: 1200, duration_s: 300 };
const series = (from: number, to: number, v: number): Sample[] => {
  const out: Sample[] = [];
  for (let ts = from; ts <= to; ts += 15) out.push({ ts, v });
  return out;
};

describe("decideMetric", () => {
  it("ouvre après la durée", () => {
    const s = series(now - 300, now, 1300);
    expect(decideMetric("co2_high", rule, null, s, now)).toEqual({
      action: "open", started_at: now - 300, start_value: 1300, peak_value: 1300,
    });
  });
  it("prend le pic de la fenêtre", () => {
    const s = series(now - 300, now, 1300);
    s[5] = { ts: s[5]!.ts, v: 1500 };
    expect(decideMetric("co2_high", rule, null, s, now)).toMatchObject({ action: "open", peak_value: 1500 });
  });
  it("n'ouvre pas avant la durée", () => {
    const s = [...series(now - 600, now - 215, 900), ...series(now - 200, now, 1300)];
    expect(decideMetric("co2_high", rule, null, s, now)).toEqual({ action: "none" });
  });
  it("n'ouvre pas si une valeur repasse sous le seuil", () => {
    const s = series(now - 300, now, 1300);
    s[10] = { ts: s[10]!.ts, v: 1100 };
    expect(decideMetric("co2_high", rule, null, s, now)).toEqual({ action: "none" });
  });
  it("n'ouvre pas sur des mesures anciennes", () => {
    expect(decideMetric("co2_high", rule, null, series(now - 900, now - 400, 1300), now)).toEqual({ action: "none" });
  });
  it("fenêtre vide", () => {
    expect(decideMetric("co2_high", rule, null, [], now)).toEqual({ action: "none" });
    expect(decideMetric("co2_high", rule, { threshold: 1200, peak_value: 1300 }, [], now)).toEqual({ action: "none" });
  });
  it("met à jour le pic", () => {
    const open = { threshold: 1200, peak_value: 1300 };
    const s = [...series(now - 300, now - 15, 1300), { ts: now, v: 1400 }];
    expect(decideMetric("co2_high", rule, open, s, now)).toEqual({ action: "update", peak_value: 1400 });
    expect(decideMetric("co2_high", rule, open, series(now - 300, now, 1300), now)).toEqual({ action: "none" });
  });
  it("ferme après 2 min sous le seuil", () => {
    const open = { threshold: 1200, peak_value: 1300 };
    expect(decideMetric("co2_high", rule, open, series(now - 120, now, 700), now)).toEqual({ action: "close", end_value: 700 });
    expect(decideMetric("co2_high", rule, open, series(now - 60, now, 700), now).action).not.toBe("close");
  });
  it("ferme contre le seuil de l'alerte", () => {
    const open = { threshold: 1200, peak_value: 1300 };
    const r = { ...rule, threshold: 1000 };
    expect(decideMetric("co2_high", r, open, series(now - 120, now, 1100), now).action).toBe("close");
  });
  it("règles basses", () => {
    const r = { enabled: true, threshold: 19, duration_s: 1800 };
    const s = series(now - 1800, now, 18);
    s[3] = { ts: s[3]!.ts, v: 17 };
    expect(decideMetric("temp_low", r, null, s, now)).toMatchObject({ action: "open", peak_value: 17 });
  });
});

describe("decideOffline", () => {
  const r = { enabled: true, threshold: null, duration_s: 300 };
  it("ouvre après la durée", () => {
    expect(decideOffline(r, false, now - 400, 0, now)).toEqual({
      action: "open", started_at: now - 400, start_value: null, peak_value: null,
    });
  });
  it("compte depuis le démarrage du serveur", () => {
    expect(decideOffline(r, false, now - 400, now - 60, now)).toEqual({ action: "none" });
  });
  it("jamais vue", () => {
    expect(decideOffline(r, false, null, 0, now)).toEqual({ action: "none" });
  });
  it("ferme au retour", () => {
    expect(decideOffline(r, true, now - 10, 0, now)).toEqual({ action: "close", end_value: null });
  });
});
