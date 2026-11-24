import { describe, expect, it } from "vitest";
import { isTimeZone, localClock } from "../src/localtime.js";

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
