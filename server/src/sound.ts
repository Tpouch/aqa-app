import type { SoundCalibration } from "./types.js";

// Maps the raw "snd" ADC reading to estimated dB. Shared with the web client.
export function soundDb(snd: number | null, cal: SoundCalibration): number | null {
  if (snd === null || snd <= 0) return null;
  return cal.db_ref + 20 * Math.log10(snd / cal.snd_ref);
}
