import { describe, expect, it } from "vitest";
import { addDays, isoLocal, isTimeZone, localClock, localMidnight, withIsoTimes } from "../src/localtime.js";

const at = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m, d, h, min) / 1000;

describe("localClock", () => {
  it("donne la date, le jour (0 = lundi) et l'heure locale", () => {
    expect(localClock("Europe/Paris")(at(2026, 10, 23, 21, 30))).toEqual({ date: "2026-11-23", weekday: 0, hour: 22 });
    expect(localClock("UTC")(at(2026, 10, 23, 21, 30))).toEqual({ date: "2026-11-23", weekday: 0, hour: 21 });
    expect(localClock("Europe/Paris")(at(2026, 10, 22, 23, 30))).toEqual({ date: "2026-11-23", weekday: 0, hour: 0 });
    expect(localClock("Europe/Paris")(at(2026, 10, 22, 22, 59))).toEqual({ date: "2026-11-22", weekday: 6, hour: 23 });
  });
  it("suit le passage à l'heure d'hiver (2 h deux fois)", () => {
    const paris = localClock("Europe/Paris");
    expect(paris(at(2026, 9, 25, 0, 30)).hour).toBe(2);
    expect(paris(at(2026, 9, 25, 1, 30)).hour).toBe(2);
    expect(paris(at(2026, 9, 25, 2, 30)).hour).toBe(3);
  });
  it("gère un fuseau à la demi-heure", () => {
    expect(localClock("Asia/Kolkata")(at(2026, 10, 23, 0, 45)).hour).toBe(6);
  });
});

describe("isTimeZone", () => {
  it("reconnaît les fuseaux IANA", () => {
    expect(isTimeZone("Europe/Paris")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("localMidnight", () => {
  it("donne minuit local en secondes unix", () => {
    expect(localMidnight("2026-11-24", "Europe/Paris")).toBe(Date.UTC(2026, 10, 23, 23) / 1000);
    expect(localMidnight("2026-11-24", "UTC")).toBe(Date.UTC(2026, 10, 24) / 1000);
  });
  it("tient les jours de changement d'heure (23 h et 25 h)", () => {
    const p = "Europe/Paris";
    expect(localMidnight("2026-03-30", p) - localMidnight("2026-03-29", p)).toBe(23 * 3600);
    expect(localMidnight("2026-10-26", p) - localMidnight("2026-10-25", p)).toBe(25 * 3600);
  });
});

describe("addDays", () => {
  it("passe les fins de mois et d'année", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("isoLocal", () => {
  it("écrit l'heure locale avec son décalage", () => {
    expect(isoLocal(at(2026, 10, 24, 20), "Europe/Paris")).toBe("2026-11-24T21:00:00+01:00");
    expect(isoLocal(at(2026, 6, 14, 20), "Europe/Paris")).toBe("2026-07-14T22:00:00+02:00");
    expect(isoLocal(0, "UTC")).toBe("1970-01-01T00:00:00+00:00");
  });
});

describe("withIsoTimes", () => {
  it("convertit les horodatages connus, en profondeur", () => {
    const out = withIsoTimes(
      { ts: 0, started_at: null, value: 1340, nested: [{ ended_at: 1795190400 }] }, "UTC");
    expect(out).toEqual({
      ts: "1970-01-01T00:00:00+00:00", started_at: null, value: 1340,
      nested: [{ ended_at: isoLocal(1795190400, "UTC") }],
    });
  });
});
