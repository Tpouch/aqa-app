import type { NotifyLast } from "../../../../server/src/types";
import { alertDate } from "./format";
import { t } from "../../i18n/dict";

/** "réussi · auj. 14:02", "échec · hier 22:40 · HTTP 403 : forbidden". */
export function lastSendText(last: NotifyLast | null, nowSec: number): { tone: "good" | "bad" | null; text: string } {
  if (!last) return { tone: null, text: t().alerts.nothingSent };
  const when = alertDate(last.at, nowSec);
  return last.ok
    ? { tone: "good", text: t().alerts.sentOk(when) }
    : { tone: "bad", text: `${t().alerts.sentFailed(when)}${last.error ? ` · ${last.error}` : ""}` };
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** On ntfy.sh anyone who knows a topic can read it: suggest one nobody will guess. */
export function randomTopic(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return "aqa-" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Shared secret for the webhook signature: 32 base64url characters (192 bits). */
export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => B64URL[b % 64]).join("");
}
