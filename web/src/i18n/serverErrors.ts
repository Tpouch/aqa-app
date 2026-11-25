// The few server errors written in French (firmware routes in server/src/routes/app.ts),
// shown in English when English is on. Every other server error is already English.
import { getLang } from "./lang";

const RULES: [RegExp, (...m: string[]) => string][] = [
  [/^(.+) ne contient le jeton d'aucune carte \(jeton changé depuis la compilation \?\)\.$/s,
    (v) => `${v} doesn't contain any board's token (token changed since it was built?).`],
  [/^(.+) a été compilée pour (.+), pas pour (.+)\.$/s, (v, a, b) => `${v} was built for ${a}, not for ${b}.`],
  [/^(.+) existe déjà pour (.+) : choisis un autre numéro \(par ex\. (.+)\)\.$/s,
    (v, a, s) => `${v} already exists for ${a}: pick another number (e.g. ${s}).`],
];

export function serverError(message: string): string {
  if (getLang() !== "en") return message;
  for (const [re, write] of RULES) {
    const m = message.match(re);
    if (m) return write(...m.slice(1));
  }
  return message;
}

// Failure reasons of the last ntfy / webhook send (server/src/notify.ts, webhook.ts).
const SEND_RULES: [RegExp, (...m: string[]) => string][] = [
  [/^délai dépassé \((\d+) s\)$/, (n) => `timed out (${n} s)`],
  [/^injoignable : (.*)$/s, (why) => `unreachable: ${why}`],
  [/^erreur interne : (.*)$/s, (why) => `internal error: ${why}`],
  [/^HTTP 3xx \(redirection\)$/, () => "HTTP 3xx (redirect)"],
  [/^HTTP (\d+) : (.*)$/s, (code, why) => `HTTP ${code}: ${why}`],
  [/^aucun sujet configuré$/, () => "no topic set"],
  [/^aucune URL configurée$/, () => "no URL set"],
  [/^aucun secret configuré$/, () => "no secret set"],
  [/^échec : vérifie l'URL et le secret$/, () => "failed: check the URL and the secret"],
  [/^hôte non autorisé \((.*)\)$/, (what) => `host not allowed (${what})`],
];

export function sendError(message: string): string {
  if (getLang() !== "en") return message;
  for (const [re, write] of SEND_RULES) {
    const m = message.match(re);
    if (m) return write(...m.slice(1));
  }
  return message;
}
