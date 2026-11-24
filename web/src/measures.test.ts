import { describe, expect, it } from "vitest";
import { bannerSubtitle, csvFileName } from "./measures";

describe("csvFileName", () => {
  it("nomme le fichier d'après la pièce, sans accents ni espaces", () =>
    expect(csvFileName("Chambre d'Élise", "aqa-24A160B3C8F0", "co2", "2026-11-24")).toBe("chambre-d-elise-co2-2026-11-24.csv"));
  it("garde l'identifiant si le nom ne donne rien d'utilisable", () =>
    expect(csvFileName("!!", "aqa-24A160B3C8F0", "grille", "2026-11-24")).toBe("aqa-24A160B3C8F0-grille-2026-11-24.csv"));
});

describe("bannerSubtitle", () => {
  it("avec plusieurs pièces, la pièce en tête", () =>
    expect(bannerSubtitle("Chambre", "24 h glissantes", "1 min")).toBe("Chambre · 24 h glissantes · moyennes sur 1 min"));
  it("une seule pièce : comme avant", () =>
    expect(bannerSubtitle(null, "24 h glissantes", "1 min")).toBe("24 h glissantes · moyennes sur 1 min"));
  it("mesures brutes : pas de pas de moyenne, première lettre en capitale", () =>
    expect(bannerSubtitle(null, "dernière heure", null)).toBe("Dernière heure"));
});
