import { describe, expect, it } from "vitest";
import { metricDef } from "./metrics";
import { alertPhrase, csvColumns, formatDuration, gridColumns } from "./measures";
import { periodLabel, resolveRange, shiftDay } from "./range";

describe("range", () => {
  it("donne une fenêtre glissante pour un raccourci", () =>
    expect(resolveRange({ kind: "preset", seconds: 86400 }, "2026-11-20")).toMatchObject({ from: 0, to: 86400, live: true, title: "24 h glissantes" }));
  it("donne la journée entière", () => {
    const r = resolveRange({ kind: "day", date: "2026-11-19" }, "2026-11-20");
    expect(r.to - r.from).toBe(86399); expect(r.live).toBe(false); expect(r.refresh).toBe(false);
  });
  it("rafraîchit la journée en cours", () => expect(resolveRange({ kind: "day", date: "2026-11-20" }, "2026-11-20").refresh).toBe(true));
  it("passe d'un mois à l'autre", () => expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01"));
});

describe("mesures", () => {
  it.each([[1, 1], [2, 1], [3, 2], [5, 2]])("grille de %i mesures → %i colonne(s)", (n, c) => expect(gridColumns(n)).toBe(c));
  it("ajoute la colonne dB au CSV", () => {
    expect(csvColumns(["co2", "snd"], { snd_ref: 31, db_ref: 45 })).toEqual(["time", "co2", "snd", "snd_db"]);
    expect(csvColumns(["snd"], null)).toEqual(["time", "snd"]);
  });
  it("formate les durées", () => {
    expect([0, 59, 600, 3600, 4800, 90000].map(formatDuration)).toEqual(["0 min", "1 min", "10 min", "1 h", "1 h 20", "25 h"]);
  });
  it("nomme le temps en alerte", () => {
    expect(alertPhrase(metricDef("co2", null))).toBe("CO₂ en zone mauvaise");
    expect(alertPhrase(metricDef("temp", null))).toBe("Température hors confort");
    expect(alertPhrase(metricDef("snd", { snd_ref: 31, db_ref: 45 }))).toBe("Son fort");
  });
  it("nomme la période", () => {
    expect(periodLabel({ kind: "preset", seconds: 86400 })).toBe("24 h");
    expect(periodLabel({ kind: "day", date: "2026-11-19" })).toBe("la journée");
    expect(periodLabel({ kind: "custom", from: 0, to: 1 })).toBe("la plage");
  });
});
