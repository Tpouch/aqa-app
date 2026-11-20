import type { FrameRow, SoundCalibration } from "../../../../server/src/types";

const MAX_AGE_S = 120;

export type CalibrationResult = { ok: true; value: SoundCalibration } | { ok: false; error: string };

// Pairs the latest raw amplitude with the dB level the user read on a sound meter.
export function calibrationFrom(latest: FrameRow | null, now: number, dbInput: string): CalibrationResult {
  if (!latest || latest.snd === null || !(latest.snd > 0)) {
    return { ok: false, error: "Aucune mesure de son récente : vérifie que le micro est détecté." };
  }
  if (now - latest.ts > MAX_AGE_S) {
    return { ok: false, error: "Dernière mesure trop ancienne (plus de 2 min) : attends que la carte envoie une mesure." };
  }
  const trimmed = dbInput.trim().replace(",", ".");
  const db = trimmed === "" ? NaN : Number(trimmed);
  if (!Number.isFinite(db) || db < 20 || db > 130) {
    return { ok: false, error: "Saisis un niveau entre 20 et 130 dB." };
  }
  return { ok: true, value: { snd_ref: latest.snd, db_ref: db } };
}
