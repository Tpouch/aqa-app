import { describe, expect, it } from "vitest";
import type { DeviceSummary } from "../../server/src/types";
import { compareChoices, compareTarget, labelSides, mergeSeries, valueNear } from "./compare";

const CAL = { snd_ref: 100, db_ref: 40 };
const board = (id: string, calibrated = false) =>
  ({ id, name: id, sound_calibration: calibrated ? CAL : null }) as unknown as DeviceSummary;

describe("comparer : pièces proposées", () => {
  const here = board("aqa-A");
  const hereCal = board("aqa-A", true);
  const a = board("aqa-B");
  const b = board("aqa-C");
  const aCal = board("aqa-B", true);

  it("toutes les autres pièces hors son", () => {
    expect(compareChoices("co2", here, [a, b])).toEqual([a, b]);
  });
  it("son : seulement si les deux cartes sont calibrées", () => {
    expect(compareChoices("snd", hereCal, [aCal, b])).toEqual([aCal]);
    expect(compareChoices("snd", here, [aCal])).toEqual([]);
    expect(compareChoices("snd", null, [aCal])).toEqual([]);
  });
  it("retrouve la pièce retenue, ou rien", () => {
    expect(compareTarget("aqa-B", "co2", here, [a])).toBe(a);
    expect(compareTarget("aqa-Z", "co2", here, [a])).toBeNull();
    expect(compareTarget(null, "co2", here, [a])).toBeNull();
    // Son non calibré ici : la pièce reste retenue mais n'est pas montrée.
    expect(compareTarget("aqa-B", "snd", here, [aCal])).toBeNull();
  });
});

describe("comparer : fusion de deux séries", () => {
  it("horodatages décalés : undefined pour l'alignement, pas de trou", () => {
    expect(mergeSeries([0, 15, 30], [1, 2, 3], [7, 22], [10, 20])).toEqual({
      xs: [0, 7, 15, 22, 30],
      a: [1, undefined, 2, undefined, 3],
      b: [undefined, 10, undefined, 20, undefined],
    });
  });
  it("horodatages égaux partagés, vrai trou (null) gardé", () => {
    expect(mergeSeries([0, 60], [1, null], [0, 60], [5, 6])).toEqual({ xs: [0, 60], a: [1, null], b: [5, 6] });
  });
  it("une série vide", () => {
    expect(mergeSeries([0, 15], [1, 2], [], [])).toEqual({ xs: [0, 15], a: [1, 2], b: [undefined, undefined] });
  });
});

describe("comparer : valeur sous le curseur", () => {
  const xs = [0, 7, 15];
  const a = [1, undefined, 2];
  it("la valeur au point, ou la plus proche à moins d'un pas", () => {
    expect(valueNear(xs, a, 0, 15)).toBe(1);
    expect(valueNear(xs, a, 1, 15)).toBe(1); // 7 s à gauche, 8 s à droite
    expect(valueNear([0, 8, 15], a, 1, 15)).toBe(2);
  });
  it("rien de proche : null, jamais une valeur lointaine", () => {
    expect(valueNear([0, 100], [undefined, 5], 0, 15)).toBeNull();
  });
  it("le plus proche est un trou : null", () => {
    expect(valueNear([0, 7], [null, undefined], 1, 15)).toBeNull();
  });
});

describe("comparer : étiquettes au bout des courbes", () => {
  it("seule : au-dessus, sauf contre le haut", () => {
    expect(labelSides(100, null, 0).main).toBe("above");
    expect(labelSides(10, null, 0).main).toBe("below");
  });
  it("deux : la plus haute au-dessus, l'autre en dessous", () => {
    expect(labelSides(100, 80, 0)).toEqual({ main: "below", other: "above" });
    expect(labelSides(80, 100, 0)).toEqual({ main: "above", other: "below" });
    expect(labelSides(10, 50, 0)).toEqual({ main: "below", other: "below" });
  });
});
