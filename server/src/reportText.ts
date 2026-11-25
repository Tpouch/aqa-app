// Sentences of the report (bilan), in French or English, from its numbers. Pure:
// the same text will go into the weekly ntfy summary (French, the default).
import { localClock } from "./localtime.js";
import { ZONES, type Band } from "./zones.js";
import type { AirTime, AlertKind, Comparison, DeviceReport, Metric, MetricPeriod, MetricReport, ReportKind, ReportLang, Tone } from "./types.js";

/** No-break space: before units, "%" and ":" so "22 h" never wraps on a phone. */
export const NBSP = "\u00a0";

const LOCALE: Record<ReportLang, string> = { fr: "fr-FR", en: "en-GB" };

export function fmtNum(v: number, decimals = 0, lang: ReportLang = "fr"): string {
  return v.toLocaleString(LOCALE[lang], { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);
// French puts a no-break space before "%" and ":"; English puts none.
const pcOf = (lang: ReportLang) => (n: number) => (lang === "fr" ? `${n}${NBSP}%` : `${n}%`);
const colonOf = (lang: ReportLang) => (lang === "fr" ? `${NBSP}:` : ":");
const hourText = (h: number, lang: ReportLang = "fr") => (lang === "fr" ? `${h}${NBSP}h` : `${h}:00`);

/** `lastIn`: "last week" in a sentence such as "not enough readings ___". */
type Words = { good: string; warn: string; bad: string; this: string; last: string; lastIn: string };
const WORDS: Record<ReportLang, Record<ReportKind, Words>> = {
  fr: {
    week: { good: "Bonne semaine", warn: "Semaine moyenne", bad: "Mauvaise semaine", this: "cette semaine", last: "la semaine dernière", lastIn: "la semaine dernière" },
    month: { good: "Bon mois", warn: "Mois moyen", bad: "Mauvais mois", this: "ce mois-ci", last: "le mois dernier", lastIn: "le mois dernier" },
    custom: { good: "Bonne période", warn: "Période moyenne", bad: "Mauvaise période", this: "sur la période", last: "la période précédente", lastIn: "la période précédente" },
  },
  en: {
    week: { good: "Good week", warn: "Average week", bad: "Bad week", this: "this week", last: "last week", lastIn: "last week" },
    month: { good: "Good month", warn: "Average month", bad: "Bad month", this: "this month", last: "last month", lastIn: "last month" },
    custom: { good: "Good period", warn: "Average period", bad: "Bad period", this: "over the period", last: "the previous period", lastIn: "in the previous period" },
  },
};

// ---- verdict

export function airTone(air: AirTime): Tone | null {
  if (air.measured_s === 0) return null;
  const good = air.good_s / air.measured_s;
  const bad = air.bad_s / air.measured_s;
  if (bad >= 0.15 || good < 0.5) return "bad";
  if (bad >= 0.03 || good < 0.8) return "warn";
  return "good";
}

/** `measured_s`: time with any measurement, air or comfort. */
export function verdict(
  kind: ReportKind, inProgress: boolean, air: AirTime, measured_s: number, lang: ReportLang = "fr",
): DeviceReport["verdict"] {
  const w = WORDS[lang][kind];
  const pc = pcOf(lang);
  const c = colonOf(lang);
  const fr = lang === "fr";
  const tone = airTone(air);
  if (tone === null) {
    if (measured_s > 0) {
      return fr
        ? { tone, head: "Pas de mesure de l'air", rest: ` ${w.this}${c} ni CO₂ ni particules fines, seulement le confort.` }
        : { tone, head: "No air readings", rest: ` ${w.this}${c} no CO₂ or fine particles, only comfort.` };
    }
    return fr
      ? { tone, head: "Pas de mesure", rest: ` ${w.this}${c} la carte était peut-être hors ligne.` }
      : { tone, head: "No readings", rest: ` ${w.this}${c} the board may have been offline.` };
  }
  const g = pct(air.good_s, air.measured_s);
  const b = pct(air.bad_s, air.measured_s);
  const head = w[tone] + (inProgress ? (fr ? " pour l'instant" : " so far") : "");
  const mostlyBad = air.bad_s / air.measured_s >= 0.15;
  let rest: string;
  if (fr) {
    if (tone === "good") rest = `${c} l'air a été bon ${pc(g)} du temps.`;
    else if (tone === "warn") rest = `${c} l'air a été bon ${pc(g)} du temps${b >= 1 ? `, et mauvais ${pc(b)}` : ""}.`;
    else rest = mostlyBad ? `${c} l'air a été mauvais ${pc(b)} du temps.` : `${c} l'air n'a été bon que ${pc(g)} du temps.`;
  } else {
    if (tone === "good") rest = `${c} the air was good ${pc(g)} of the time.`;
    else if (tone === "warn") rest = `${c} the air was good ${pc(g)} of the time${b >= 1 ? `, and bad ${pc(b)}` : ""}.`;
    else rest = mostlyBad ? `${c} the air was bad ${pc(b)} of the time.` : `${c} the air was only good ${pc(g)} of the time.`;
  }
  return { tone, head, rest };
}

// ---- comparison with the previous period

const AVOID: Record<ReportLang, Record<Metric, string>> = {
  fr: { co2: "en zone mauvaise", pm25: "en zone mauvaise", temp: "hors confort", hum: "hors confort", snd: "avec un son fort" },
  en: { co2: "in the bad zone", pm25: "in the bad zone", temp: "out of comfort", hum: "out of comfort", snd: "with loud sound" },
};

const badSeconds = (p: MetricPeriod) => (p.zones ?? []).reduce((s, z) => (z.tone === "bad" ? s + z.seconds : s), 0);

export function comparison(
  metric: Metric, kind: ReportKind, cur: MetricPeriod, prev: MetricPeriod, prevElapsed: number, lang: ReportLang = "fr",
): Comparison | null {
  if (!cur.zones || cur.measured_s === 0) return null;
  const { last, lastIn } = WORDS[lang][kind];
  const fr = lang === "fr";
  const pc = pcOf(lang);
  const colon = colonOf(lang);
  if (!prev.zones || prevElapsed <= 0 || prev.measured_s < 0.1 * prevElapsed) {
    return { trend: null, text: fr ? `Pas assez de mesures ${lastIn} pour comparer.` : `Not enough readings ${lastIn} to compare.` };
  }
  const label = AVOID[lang][metric];
  const c = pct(badSeconds(cur), cur.measured_s);
  const p = pct(badSeconds(prev), prev.measured_s);
  const now = c === 0 ? `${fr ? "jamais" : "never"} ${label}` : `${pc(c)} ${fr ? "du temps" : "of the time"} ${label}`;
  if (c === p) return { trend: "same", text: `${fr ? "Comme" : "Same as"} ${last}${colon} ${now}.` };
  const against = fr ? "contre" : "against";
  return c < p
    ? { trend: "better", text: `${fr ? "Mieux que" : "Better than"} ${last}${colon} ${now}, ${against} ${pc(p)}.` }
    : { trend: "worse", text: `${fr ? "Moins bien que" : "Worse than"} ${last}${colon} ${now}, ${against} ${pc(p)}.` };
}

// ---- takeaways ("À retenir")

export interface TakeawayInput {
  kind: ReportKind;
  tz: string;
  tone: Tone | null; // verdict tone
  elapsed_s: number;
  measured_s: number;
  metrics: MetricReport[];
  dayHourCo2: Map<string, (number | null)[]>; // local date → 24 hourly CO₂ means
  alerts: DeviceReport["alerts"];
  lang?: ReportLang; // default French
}

const limit = (bands: readonly Band[], tone: "warn" | "bad") => bands.find((_, i) => bands[i + 1]?.tone === tone)!.to!;

const MOMENTS: Record<ReportLang, { every: string; often: string }[]> = {
  fr: [
    { every: "chaque nuit", often: "la nuit" }, { every: "chaque matin", often: "le matin" },
    { every: "chaque après-midi", often: "l'après-midi" }, { every: "chaque soir", often: "le soir" },
  ],
  en: [
    { every: "every night", often: "at night" }, { every: "every morning", often: "in the morning" },
    { every: "every afternoon", often: "in the afternoon" }, { every: "every evening", often: "in the evening" },
  ],
};

function moment(h: number, lang: ReportLang): { every: string; often: string } {
  return MOMENTS[lang][h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3]!;
}

const ADVICE: Record<ReportLang, [night: string, morning: string, other: string]> = {
  fr: ["aère avant de dormir", "aère dès le réveil", "aère un peu avant"],
  en: ["ventilate before going to bed", "ventilate as soon as you wake up", "ventilate a little before"],
};

function adviceAt(h: number, lang: ReportLang): string {
  const a = ADVICE[lang];
  if (h >= 21 || h < 6) return a[0];
  if (h < 10) return a[1];
  return a[2];
}

/** The hour of day when CO₂ most often reaches a zone, if it is a habit. */
function co2Habit(days: Map<string, (number | null)[]>, lang: ReportLang): string | null {
  for (const tone of ["bad", "warn"] as const) {
    const threshold = limit(ZONES.co2, tone);
    let best: { hour: number; hits: number; days: number; sum: number } | null = null;
    for (let h = 0; h < 24; h++) {
      let hits = 0, measured = 0, sum = 0;
      for (const cells of days.values()) {
        const v = cells[h];
        if (v === null || v === undefined) continue;
        measured++;
        if (v >= threshold) { hits++; sum += v; }
      }
      if (!best || hits > best.hits || (hits === best.hits && sum > best.sum)) best = { hour: h, hits, days: measured, sum };
    }
    if (!best || best.hits < 3 || best.hits / best.days < 0.5) continue;
    const m = moment(best.hour, lang);
    const almost = best.hits / best.days >= 0.8;
    const ppm = `${fmtNum(threshold, 0, lang)}${NBSP}ppm`;
    if (lang === "en") {
      const when = `around ${hourText(best.hour, lang)}: ${adviceAt(best.hour, lang)}.`;
      const verb = tone === "bad" ? "goes over" : "rises above";
      return almost ? `CO₂ ${verb} ${ppm} almost ${m.every} ${when}` : `CO₂ often ${verb} ${ppm} ${m.often} ${when}`;
    }
    const when = `vers ${hourText(best.hour)}${NBSP}: ${adviceAt(best.hour, lang)}.`;
    if (tone === "bad") {
      return almost
        ? `Le CO₂ dépasse ${ppm} presque ${m.every} ${when}`
        : `Le CO₂ dépasse souvent ${ppm} ${m.often} ${when}`;
    }
    return almost
      ? `Le CO₂ passe au-dessus de ${ppm} presque ${m.every} ${when}`
      : `Le CO₂ passe souvent au-dessus de ${ppm} ${m.often} ${when}`;
  }
  return null;
}

// Keyed by the zone words of server/src/zones.ts.
const COMFORT_EN: Record<string, (p: string, lim: string) => string> = {
  froid: (p, lim) => `It was too cold ${p} of the time (below ${lim}${NBSP}°C): turn the heating up a little.`,
  chaud: (p, lim) => `It was too hot ${p} of the time (above ${lim}${NBSP}°C): turn the heating down or close the shutters on the sunny side.`,
  sec: (p, lim) => `The air was too dry ${p} of the time (below ${lim}%): ventilate for shorter periods or use a humidifier.`,
  humide: (p, lim) => `The air was too humid ${p} of the time (above ${lim}%): ventilate for 10 minutes after a shower or cooking.`,
};

const COMFORT: Record<string, (p: string, lim: string) => string> = {
  froid: (p, lim) => `Il a fait trop froid ${p} du temps (moins de ${lim}${NBSP}°C)${NBSP}: monte un peu le chauffage.`,
  chaud: (p, lim) => `Il a fait trop chaud ${p} du temps (plus de ${lim}${NBSP}°C)${NBSP}: baisse le chauffage ou ferme les volets côté soleil.`,
  sec: (p, lim) => `L'air a été trop sec ${p} du temps (moins de ${lim}${NBSP}%)${NBSP}: aère moins longtemps ou utilise un humidificateur.`,
  humide: (p, lim) => `L'air a été trop humide ${p} du temps (plus de ${lim}${NBSP}%)${NBSP}: aère 10 minutes après la douche ou la cuisine.`,
};

function comfortIssue(metrics: MetricReport[], lang: ReportLang): string | null {
  const table = lang === "fr" ? COMFORT : COMFORT_EN;
  let worst: { share: number; text: string } | null = null;
  for (const m of metrics) {
    if (m.metric !== "temp" && m.metric !== "hum") continue;
    const p = m.current;
    if (!p.zones || p.measured_s === 0) continue;
    const bands = ZONES[m.metric];
    p.zones.forEach((z, i) => {
      const share = z.seconds / p.measured_s;
      const write = table[z.word];
      if (z.tone !== "bad" || !write || share < 0.25 || (worst && share <= worst.share)) return;
      const lim = i === 0 ? bands[0]!.to! : bands[i - 1]!.to!;
      worst = { share, text: write(pcOf(lang)(Math.round(share * 100)), fmtNum(lim, 0, lang)) };
    });
  }
  return (worst as { text: string } | null)?.text ?? null;
}

const PEAK_NAME: Record<ReportLang, Partial<Record<Metric, { name: string; unit: string }>>> = {
  fr: { co2: { name: "CO₂", unit: "ppm" }, pm25: { name: "particules fines", unit: "µg/m³" } },
  en: { co2: { name: "CO₂", unit: "ppm" }, pm25: { name: "fine particles", unit: "µg/m³" } },
};

function worstMoment(metrics: MetricReport[], tz: string, lang: ReportLang): string | null {
  let pick: { m: MetricReport; bad: number; ratio: number } | null = null;
  for (const m of metrics) {
    const max = m.current.max;
    const zones = m.metric === "co2" ? ZONES.co2 : m.metric === "pm25" ? ZONES.pm25 : null;
    if (!zones || !max || max.v < zones[0].to) continue;
    const bad = m.current.measured_s ? badSeconds(m.current) / m.current.measured_s : 0;
    const ratio = max.v / zones[0].to;
    if (!pick || bad > pick.bad || (bad === pick.bad && ratio > pick.ratio)) pick = { m, bad, ratio };
  }
  if (!pick) return null;
  const { v, ts } = pick.m.current.max!;
  const { name, unit } = PEAK_NAME[lang][pick.m.metric]!;
  const day = new Intl.DateTimeFormat(LOCALE[lang], { timeZone: tz, weekday: "long", day: "numeric", month: "long" })
    .format(new Date(ts * 1000));
  const hour = localClock(tz)(ts).hour;
  const value = `${fmtNum(Math.round(v), 0, lang)}${NBSP}${unit}`;
  return lang === "fr"
    ? `Pire moment${NBSP}: ${value} de ${name} le ${day} vers ${hourText(hour)}.`
    : `Worst moment: ${value} of ${name} on ${day} around ${hourText(hour, lang)}.`;
}

export function durationText(seconds: number, lang: ReportLang = "fr"): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const day = lang === "fr" ? "j" : "d";
  if (d) return h ? `${d}${NBSP}${day} ${h}${NBSP}h` : `${d}${NBSP}${day}`;
  if (h) return m ? `${h}${NBSP}h ${m}${NBSP}min` : `${h}${NBSP}h`;
  return `${m}${NBSP}min`;
}

function gaps(elapsed: number, measured: number, lang: ReportLang): string | null {
  const missing = elapsed - measured;
  if (missing < 7200 || missing <= 0.1 * elapsed) return null;
  return lang === "fr"
    ? `Pas de mesure pendant ${durationText(missing)}${NBSP}: vérifie que la carte reste branchée et connectée.`
    : `No readings for ${durationText(missing, lang)}: check that the board stays plugged in and connected.`;
}

// English names of the alert catalog (server/src/alerts.ts keeps the French ones).
const ALERT_EN: Record<AlertKind, string> = {
  co2_high: "High CO₂", pm25_high: "Fine particles", temp_low: "Too cold", temp_high: "Too hot",
  hum_low: "Air too dry", hum_high: "Air too humid", snd_high: "Loud noise", offline: "Board offline",
};

function alertsText(kind: ReportKind, a: DeviceReport["alerts"], lang: ReportLang): string {
  const w = WORDS[lang][kind];
  const label = (k: DeviceReport["alerts"]["by_kind"][number]) => (lang === "fr" ? k.label : ALERT_EN[k.kind] ?? k.label);
  const list = a.by_kind.map((k) => (k.count > 1 ? `${label(k)} ×${k.count}` : label(k))).join(", ");
  if (lang === "en") {
    const before = a.previous > 0 ? `, against ${a.previous} ${w.lastIn}` : a.current > 0 ? `, against none ${w.lastIn}` : "";
    if (a.current === 0) return `No alerts ${w.this}${before}.`;
    return `${a.current} alert${a.current > 1 ? "s" : ""} ${w.this} (${list})${before}.`;
  }
  const before = a.previous > 0 ? `, contre ${a.previous} ${w.last}` : a.current > 0 ? `, contre aucune ${w.last}` : "";
  if (a.current === 0) return `Aucune alerte ${w.this}${before}.`;
  return `${a.current} alerte${a.current > 1 ? "s" : ""} ${w.this} (${list})${before}.`;
}

export function takeaways(input: TakeawayInput): string[] {
  if (input.measured_s === 0) return [];
  const lang = input.lang ?? "fr";
  const out = [
    co2Habit(input.dayHourCo2, lang),
    comfortIssue(input.metrics, lang),
    worstMoment(input.metrics, input.tz, lang),
    gaps(input.elapsed_s, input.measured_s, lang),
    alertsText(input.kind, input.alerts, lang),
  ].filter((s): s is string => s !== null).slice(0, 3);
  if (out.length < 2 && input.tone === "good") {
    out.push(lang === "fr" ? `Rien d'autre à signaler${NBSP}: continue comme ça.` : "Nothing else to report: keep it up.");
  }
  return out;
}
