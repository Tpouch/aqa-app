// Sentences of the report (bilan), in French, from its numbers. Pure: the same
// text will go into the weekly ntfy summary.
import { localClock } from "./localtime.js";
import { ZONES, type Band } from "./zones.js";
import type { AirTime, Comparison, DeviceReport, Metric, MetricPeriod, MetricReport, ReportKind, Tone } from "./types.js";

/** No-break space: before units, "%" and ":" so "22 h" never wraps on a phone. */
export const NBSP = "\u00a0";

export function fmtNum(v: number, decimals = 0): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);
const pc = (n: number) => `${n}${NBSP}%`;
const hourText = (h: number) => `${h}${NBSP}h`;

const WORDS: Record<ReportKind, { good: string; warn: string; bad: string; this: string; last: string }> = {
  week: { good: "Bonne semaine", warn: "Semaine moyenne", bad: "Mauvaise semaine", this: "cette semaine", last: "la semaine dernière" },
  month: { good: "Bon mois", warn: "Mois moyen", bad: "Mauvais mois", this: "ce mois-ci", last: "le mois dernier" },
  custom: { good: "Bonne période", warn: "Période moyenne", bad: "Mauvaise période", this: "sur la période", last: "la période précédente" },
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
export function verdict(kind: ReportKind, inProgress: boolean, air: AirTime, measured_s: number): DeviceReport["verdict"] {
  const w = WORDS[kind];
  const tone = airTone(air);
  if (tone === null) {
    return measured_s > 0
      ? { tone, head: "Pas de mesure de l'air", rest: ` ${w.this}${NBSP}: ni CO₂ ni particules fines, seulement le confort.` }
      : { tone, head: "Pas de mesure", rest: ` ${w.this}${NBSP}: la carte était peut-être hors ligne.` };
  }
  const g = pct(air.good_s, air.measured_s);
  const b = pct(air.bad_s, air.measured_s);
  const head = w[tone] + (inProgress ? " pour l'instant" : "");
  let rest: string;
  if (tone === "good") rest = `${NBSP}: l'air a été bon ${pc(g)} du temps.`;
  else if (tone === "warn") rest = `${NBSP}: l'air a été bon ${pc(g)} du temps${b >= 1 ? `, et mauvais ${pc(b)}` : ""}.`;
  else rest = air.bad_s / air.measured_s >= 0.15
    ? `${NBSP}: l'air a été mauvais ${pc(b)} du temps.`
    : `${NBSP}: l'air n'a été bon que ${pc(g)} du temps.`;
  return { tone, head, rest };
}

// ---- comparison with the previous period

const AVOID: Record<Metric, string> = {
  co2: "en zone mauvaise", pm25: "en zone mauvaise", temp: "hors confort", hum: "hors confort", snd: "avec un son fort",
};

const badSeconds = (p: MetricPeriod) => (p.zones ?? []).reduce((s, z) => (z.tone === "bad" ? s + z.seconds : s), 0);

export function comparison(
  metric: Metric, kind: ReportKind, cur: MetricPeriod, prev: MetricPeriod, prevElapsed: number,
): Comparison | null {
  if (!cur.zones || cur.measured_s === 0) return null;
  const last = WORDS[kind].last;
  if (!prev.zones || prevElapsed <= 0 || prev.measured_s < 0.1 * prevElapsed) {
    return { trend: null, text: `Pas assez de mesures ${last} pour comparer.` };
  }
  const label = AVOID[metric];
  const c = pct(badSeconds(cur), cur.measured_s);
  const p = pct(badSeconds(prev), prev.measured_s);
  const now = c === 0 ? `jamais ${label}` : `${pc(c)} du temps ${label}`;
  if (c === p) return { trend: "same", text: `Comme ${last}${NBSP}: ${now}.` };
  return c < p
    ? { trend: "better", text: `Mieux que ${last}${NBSP}: ${now}, contre ${pc(p)}.` }
    : { trend: "worse", text: `Moins bien que ${last}${NBSP}: ${now}, contre ${pc(p)}.` };
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
}

const limit = (bands: readonly Band[], tone: "warn" | "bad") => bands.find((_, i) => bands[i + 1]?.tone === tone)!.to!;

function moment(h: number): { every: string; often: string } {
  if (h < 6) return { every: "chaque nuit", often: "la nuit" };
  if (h < 12) return { every: "chaque matin", often: "le matin" };
  if (h < 18) return { every: "chaque après-midi", often: "l'après-midi" };
  return { every: "chaque soir", often: "le soir" };
}

function adviceAt(h: number): string {
  if (h >= 21 || h < 6) return "aère avant de dormir";
  if (h < 10) return "aère dès le réveil";
  return "aère un peu avant";
}

/** The hour of day when CO₂ most often reaches a zone, if it is a habit. */
function co2Habit(days: Map<string, (number | null)[]>): string | null {
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
    const m = moment(best.hour);
    const almost = best.hits / best.days >= 0.8;
    const ppm = `${fmtNum(threshold)}${NBSP}ppm`;
    const when = `vers ${hourText(best.hour)}${NBSP}: ${adviceAt(best.hour)}.`;
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

const COMFORT: Record<string, (p: string, lim: string) => string> = {
  froid: (p, lim) => `Il a fait trop froid ${p} du temps (moins de ${lim}${NBSP}°C)${NBSP}: monte un peu le chauffage.`,
  chaud: (p, lim) => `Il a fait trop chaud ${p} du temps (plus de ${lim}${NBSP}°C)${NBSP}: baisse le chauffage ou ferme les volets côté soleil.`,
  sec: (p, lim) => `L'air a été trop sec ${p} du temps (moins de ${lim}${NBSP}%)${NBSP}: aère moins longtemps ou utilise un humidificateur.`,
  humide: (p, lim) => `L'air a été trop humide ${p} du temps (plus de ${lim}${NBSP}%)${NBSP}: aère 10 minutes après la douche ou la cuisine.`,
};

function comfortIssue(metrics: MetricReport[]): string | null {
  let worst: { share: number; text: string } | null = null;
  for (const m of metrics) {
    if (m.metric !== "temp" && m.metric !== "hum") continue;
    const p = m.current;
    if (!p.zones || p.measured_s === 0) continue;
    const bands = ZONES[m.metric];
    p.zones.forEach((z, i) => {
      const share = z.seconds / p.measured_s;
      const write = COMFORT[z.word];
      if (z.tone !== "bad" || !write || share < 0.25 || (worst && share <= worst.share)) return;
      const lim = i === 0 ? bands[0]!.to! : bands[i - 1]!.to!;
      worst = { share, text: write(pc(Math.round(share * 100)), fmtNum(lim)) };
    });
  }
  return (worst as { text: string } | null)?.text ?? null;
}

const PEAK_NAME: Partial<Record<Metric, { name: string; unit: string }>> = {
  co2: { name: "CO₂", unit: "ppm" }, pm25: { name: "particules fines", unit: "µg/m³" },
};

function worstMoment(metrics: MetricReport[], tz: string): string | null {
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
  const { name, unit } = PEAK_NAME[pick.m.metric]!;
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" })
    .format(new Date(ts * 1000));
  const hour = localClock(tz)(ts).hour;
  return `Pire moment${NBSP}: ${fmtNum(Math.round(v))}${NBSP}${unit} de ${name} le ${day} vers ${hourText(hour)}.`;
}

export function durationText(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return h ? `${d}${NBSP}j ${h}${NBSP}h` : `${d}${NBSP}j`;
  if (h) return m ? `${h}${NBSP}h ${m}${NBSP}min` : `${h}${NBSP}h`;
  return `${m}${NBSP}min`;
}

function gaps(elapsed: number, measured: number): string | null {
  const missing = elapsed - measured;
  if (missing < 7200 || missing <= 0.1 * elapsed) return null;
  return `Pas de mesure pendant ${durationText(missing)}${NBSP}: vérifie que la carte reste branchée et connectée.`;
}

function alertsText(kind: ReportKind, a: DeviceReport["alerts"]): string {
  const w = WORDS[kind];
  const before = a.previous > 0 ? `, contre ${a.previous} ${w.last}` : a.current > 0 ? `, contre aucune ${w.last}` : "";
  if (a.current === 0) return `Aucune alerte ${w.this}${before}.`;
  const list = a.by_kind.map((k) => (k.count > 1 ? `${k.label} ×${k.count}` : k.label)).join(", ");
  return `${a.current} alerte${a.current > 1 ? "s" : ""} ${w.this} (${list})${before}.`;
}

export function takeaways(input: TakeawayInput): string[] {
  if (input.measured_s === 0) return [];
  const out = [
    co2Habit(input.dayHourCo2),
    comfortIssue(input.metrics),
    worstMoment(input.metrics, input.tz),
    gaps(input.elapsed_s, input.measured_s),
    alertsText(input.kind, input.alerts),
  ].filter((s): s is string => s !== null).slice(0, 3);
  if (out.length < 2 && input.tone === "good") out.push(`Rien d'autre à signaler${NBSP}: continue comme ça.`);
  return out;
}
