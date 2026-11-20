import { describe, expect, it } from "vitest";
import type { FrameRow } from "../../../../server/src/types";
import { calibrationFrom } from "./calibration";

const f = (snd: number | null, ts: number) => ({ ts, snd } as FrameRow);

describe("calibrationFrom", () => {
  it("prend la dernière amplitude", () => expect(calibrationFrom(f(31, 1000), 1060, "45")).toEqual({ ok: true, value: { snd_ref: 31, db_ref: 45 } }));
  it("accepte la virgule", () => expect(calibrationFrom(f(31, 1000), 1060, "45,5")).toMatchObject({ value: { db_ref: 45.5 } }));
  it("refuse une mesure de plus de 2 min", () =>
    expect(calibrationFrom(f(31, 1000), 1121, "45")).toEqual({ ok: false, error: "Dernière mesure trop ancienne (plus de 2 min) : attends que la carte envoie une mesure." }));
  it("refuse un son nul ou absent", () => {
    expect(calibrationFrom(f(0, 1000), 1010, "45").ok).toBe(false);
    expect(calibrationFrom(f(null, 1000), 1010, "45").ok).toBe(false);
    expect(calibrationFrom(null, 1010, "45").ok).toBe(false);
  });
  it("refuse un niveau hors 20–130 dB", () => {
    expect(calibrationFrom(f(31, 1000), 1010, "12")).toEqual({ ok: false, error: "Saisis un niveau entre 20 et 130 dB." });
    expect(calibrationFrom(f(31, 1000), 1010, "abc").ok).toBe(false);
  });
});
