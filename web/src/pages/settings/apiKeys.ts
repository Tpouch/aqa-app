import { ago } from "../../util";
import { t } from "../../i18n/dict";

export const maskedKey = (prefix: string) => `aqa_${prefix}…`;

export const lastUsedText = (ts: number | null, now: number) =>
  ts === null ? t().settings.neverUsed : t().settings.used(ago(ts, now));
