import type { FrameRow, SoundCalibration } from "../../../../server/src/types";
import { t } from "../../i18n/dict";

const MAX_AGE_S = 120;

export type CalibrationResult = { ok: true; value: SoundCalibration } | { ok: false; error: string };

// Pairs the latest raw amplitude with the dB level the user read on a sound meter.
export function calibrationFrom(latest: FrameRow | null, now: number, dbInput: string): CalibrationResult {
  if (!latest || latest.snd === null || !(latest.snd > 0)) {
    return { ok: false, error: t().settings.noRecentSound };
  }
  if (now - latest.ts > MAX_AGE_S) {
    return { ok: false, error: t().settings.tooOld };
  }
  const trimmed = dbInput.trim().replace(",", ".");
  const db = trimmed === "" ? NaN : Number(trimmed);
  if (!Number.isFinite(db) || db < 20 || db > 130) {
    return { ok: false, error: t().settings.levelRange };
  }
  return { ok: true, value: { snd_ref: latest.snd, db_ref: db } };
}
