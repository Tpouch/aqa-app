import { describe, expect, it } from "vitest";
import { periodAt } from "./period";

// Runs in Europe/Paris (web/vite.config.ts), so the clock-change case is real.

const s = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h).getTime() / 1000;

describe("periodAt", () => {
  it("semaine en cours, du lundi au lundi suivant", () => {
    const p = periodAt("week", 0, new Date(2026, 10, 24, 15));
    expect(p).toMatchObject({
      kind: "week", offset: 0, current: true,
      from: s(2026, 10, 23), to: s(2026, 10, 30), prevFrom: s(2026, 10, 16),
      label: "23 – 29 nov.", long: "semaine du 23 au 29 novembre 2026",
    });
  });
  it("semaine précédente", () => {
    expect(periodAt("week", -1, new Date(2026, 10, 24))).toMatchObject({ from: s(2026, 10, 16), current: false });
  });
  it("un dimanche soir appartient encore à sa semaine", () => {
    expect(periodAt("week", 0, new Date(2026, 10, 29, 23, 30)).from).toBe(s(2026, 10, 23));
  });
  it("suit le changement d'heure", () => {
    const now = new Date(2026, 10, 24);
    expect(periodAt("week", -4, now)).toMatchObject({ from: s(2026, 9, 26) });
    expect(periodAt("week", -4, now).to - periodAt("week", -4, now).from).toBe(7 * 86400);
    const dst = periodAt("week", -5, now); // 19 → 26 October, clocks go back on the 25th
    expect(dst.to - dst.from).toBe(7 * 86400 + 3600);
  });
  it("semaine à cheval sur deux mois ou deux années", () => {
    expect(periodAt("week", 1, new Date(2026, 10, 24))).toMatchObject({
      label: "30 nov. – 6 déc.", long: "semaine du 30 novembre au 6 décembre 2026",
    });
    expect(periodAt("week", 0, new Date(2025, 11, 31))).toMatchObject({
      label: "29 déc. 2025 – 4 janv. 2026", long: "semaine du 29 décembre 2025 au 4 janvier 2026",
    });
  });
  it("mois calendaire", () => {
    expect(periodAt("month", 0, new Date(2026, 10, 24))).toMatchObject({
      from: s(2026, 10, 1), to: s(2026, 11, 1), prevFrom: s(2026, 9, 1),
      label: "novembre 2026", long: "mois de novembre 2026", current: true,
    });
    expect(periodAt("month", -11, new Date(2026, 10, 24))).toMatchObject({ from: s(2025, 11, 1), label: "décembre 2025" });
    expect(periodAt("month", -10, new Date(2026, 10, 24)).label).toBe("janvier 2026");
  });
});
