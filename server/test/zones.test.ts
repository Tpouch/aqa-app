import { describe, expect, it } from "vitest";
import { bandOf, ZONES, zonesOf } from "../src/zones.js";

describe("zones", () => {
  it("classe le CO₂ selon ses bandes", () => {
    expect([799, 800, 1199, 1200].map((v) => bandOf(ZONES.co2, v)?.word)).toEqual(["bon", "aérer", "aérer", "mauvais"]);
  });
  it("inclut la borne haute du confort", () => {
    expect(bandOf(ZONES.temp, 24)?.word).toBe("confort");
    expect(bandOf(ZONES.temp, 24.1)?.word).toBe("chaud");
    expect(bandOf(ZONES.temp, 18.9)?.word).toBe("froid");
    expect(bandOf(ZONES.hum, 60)?.word).toBe("confort");
  });
  it("n'a pas de zones pour le son non calibré", () => {
    expect(zonesOf("snd", false)).toBeNull();
    expect(zonesOf("snd", true)).toBe(ZONES.snd_db);
    expect(zonesOf("pm25", false)).toBe(ZONES.pm25);
  });
  it("renvoie null sans bandes ou sans valeur", () => {
    expect(bandOf(null, 5)).toBeNull();
    expect(bandOf(ZONES.co2, null)).toBeNull();
  });
});
