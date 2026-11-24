import { ago } from "../../util";

export const maskedKey = (prefix: string) => `aqa_${prefix}…`;

export const lastUsedText = (ts: number | null, now: number) =>
  ts === null ? "jamais utilisée" : `utilisée ${ago(ts, now)}`;
