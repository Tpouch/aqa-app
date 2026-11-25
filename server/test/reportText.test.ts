import { describe, expect, it } from "vitest";
import { comparison, takeaways, verdict, type TakeawayInput } from "../src/reportText.js";
import type { MetricPeriod, MetricReport, Metric, ZoneTime } from "../src/types.js";
import { ZONES } from "../src/zones.js";

// Generated text puts a no-break space before units and "%"; thousands use the
// narrow no-break space of fr-FR. Written out here so the tests read naturally.
const t = (s: string) => s.replace(/ (%|h\b|j\b|ppm|°C|µg|:)/g, "\u00a0$1").replace(/(\d) (\d{3})/g, "$1\u202f$2");

const air = (good: number, warn: number, bad: number) => ({ measured_s: good + warn + bad, good_s: good, warn_s: warn, bad_s: bad });

function period(metric: Metric, shares: number[] | null, measured = 100, extra: Partial<MetricPeriod> = {}): MetricPeriod {
  const bands = metric === "snd" ? (shares ? ZONES.snd_db : null) : ZONES[metric];
  const zones: ZoneTime[] | null = bands && shares
    ? bands.map((b, i) => ({ word: b.word, tone: b.tone, seconds: shares[i]! * measured / 100 })) : null;
  return { measured_s: measured, zones, avg: 1, min: null, max: null, ...extra };
}

describe("verdict", () => {
  it("bonne semaine", () => {
    expect(verdict("week", false, air(86, 14, 0), 100))
      .toEqual({ tone: "good", head: "Bonne semaine", rest: t(" : l'air a été bon 86 % du temps.") });
  });
  it("semaine moyenne, en cours", () => {
    expect(verdict("week", true, air(72, 24, 4), 100))
      .toEqual({ tone: "warn", head: "Semaine moyenne pour l'instant", rest: t(" : l'air a été bon 72 % du temps, et mauvais 4 %.") });
  });
  it("mauvais mois", () => {
    expect(verdict("month", false, air(60, 18, 22), 100))
      .toEqual({ tone: "bad", head: "Mauvais mois", rest: t(" : l'air a été mauvais 22 % du temps.") });
  });
  it("mauvaise semaine quand l'air est rarement bon", () => {
    expect(verdict("week", false, air(41, 55, 4), 100))
      .toEqual({ tone: "bad", head: "Mauvaise semaine", rest: t(" : l'air n'a été bon que 41 % du temps.") });
  });
  it("sans mesure", () => {
    expect(verdict("week", false, air(0, 0, 0), 0))
      .toEqual({ tone: null, head: "Pas de mesure", rest: t(" cette semaine : la carte était peut-être hors ligne.") });
  });
});

describe("verdict sans capteur d'air", () => {
  it("ne dit pas « hors ligne » quand seuls température et humidité ont été mesurées", () => {
    expect(verdict("week", false, air(0, 0, 0), 3600))
      .toEqual({ tone: null, head: "Pas de mesure de l'air", rest: t(" cette semaine : ni CO₂ ni particules fines, seulement le confort.") });
  });
});

describe("comparison", () => {
  it("mieux, moins bien, pareil", () => {
    expect(comparison("co2", "week", period("co2", [70, 24, 6]), period("co2", [60, 29, 11]), 100))
      .toEqual({ trend: "better", text: t("Mieux que la semaine dernière : 6 % du temps en zone mauvaise, contre 11 %.") });
    expect(comparison("temp", "week", period("temp", [4, 81, 15]), period("temp", [2, 88, 10]), 100))
      .toEqual({ trend: "worse", text: t("Moins bien que la semaine dernière : 19 % du temps hors confort, contre 12 %.") });
    expect(comparison("co2", "week", period("co2", [90, 10, 0]), period("co2", [80, 20, 0]), 100))
      .toEqual({ trend: "same", text: t("Comme la semaine dernière : jamais en zone mauvaise.") });
    expect(comparison("hum", "month", period("hum", [0, 96, 4]), period("hum", [0.5, 96, 3.6]), 100))
      .toEqual({ trend: "same", text: t("Comme le mois dernier : 4 % du temps hors confort.") });
  });
  it("ne compare pas avec une période presque vide", () => {
    expect(comparison("co2", "week", period("co2", [70, 24, 6]), period("co2", [100, 0, 0], 5), 100))
      .toEqual({ trend: null, text: "Pas assez de mesures la semaine dernière pour comparer." });
    expect(comparison("co2", "week", period("co2", [70, 24, 6]), period("co2", [100, 0, 0], 0), 0))
      .toEqual({ trend: null, text: "Pas assez de mesures la semaine dernière pour comparer." });
  });
  it("rien pour le son non calibré ou une mesure absente", () => {
    expect(comparison("snd", "week", period("snd", null), period("snd", null), 100)).toBeNull();
    expect(comparison("pm25", "week", period("pm25", [0, 0, 0], 0), period("pm25", [100, 0, 0]), 100)).toBeNull();
  });
});

// Week of Monday 16 November 2026 (Europe/Paris).
const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
const flat = (v: number) => Array<number | null>(24).fill(v);

function input(over: Partial<TakeawayInput> = {}): TakeawayInput {
  const metrics: MetricReport[] = (["co2", "pm25", "snd", "temp", "hum"] as Metric[]).map((m) => ({
    metric: m,
    current: period(m, m === "snd" ? null : m === "temp" || m === "hum" ? [0, 100, 0] : [100, 0, 0], 7 * 86400),
    previous: period(m, null, 0),
    comparison: null,
  }));
  return {
    kind: "week", tz: "Europe/Paris", tone: "good", elapsed_s: 7 * 86400, measured_s: 7 * 86400,
    metrics, dayHourCo2: new Map(DAYS.map((d) => [d, flat(600)])),
    alerts: { current: 0, previous: 0, by_kind: [] },
    ...over,
  };
}

function withHour(days: number, hour: number, v: number) {
  return new Map(DAYS.map((d, i) => {
    const cells = flat(600);
    if (i < days) cells[hour] = v;
    return [d, cells];
  }));
}

describe("takeaways", () => {
  it("rien à signaler", () => {
    expect(takeaways(input())).toEqual(["Aucune alerte cette semaine.", t("Rien d'autre à signaler : continue comme ça.")]);
  });
  it("habitude du soir", () => {
    expect(takeaways(input({ dayHourCo2: withHour(6, 22, 1300) }))[0])
      .toBe(t("Le CO₂ dépasse 1 200 ppm presque chaque soir vers 22 h : aère avant de dormir."));
  });
  it("habitude fréquente l'après-midi", () => {
    expect(takeaways(input({ dayHourCo2: withHour(4, 15, 1300) }))[0])
      .toBe(t("Le CO₂ dépasse souvent 1 200 ppm l'après-midi vers 15 h : aère un peu avant."));
  });
  it("pas d'habitude sur deux jours", () => {
    expect(takeaways(input({ dayHourCo2: withHour(2, 22, 1300) }))[0]).toBe("Aucune alerte cette semaine.");
  });
  it("habitude en zone aérer", () => {
    expect(takeaways(input({ dayHourCo2: withHour(7, 8, 900) }))[0])
      .toBe(t("Le CO₂ passe au-dessus de 800 ppm presque chaque matin vers 8 h : aère dès le réveil."));
  });
  it("confort : air trop sec", () => {
    const base = input();
    base.metrics[4]!.current = period("hum", [40, 60, 0], 7 * 86400);
    expect(takeaways(base)[0])
      .toBe(t("L'air a été trop sec 40 % du temps (moins de 40 %) : aère moins longtemps ou utilise un humidificateur."));
  });
  it("pire moment", () => {
    const base = input();
    // Thursday 19 November 2026, 22:10 in Paris.
    base.metrics[0]!.current = period("co2", [80, 10, 10], 7 * 86400, { max: { v: 1850, ts: Date.UTC(2026, 10, 19, 21, 10) / 1000 } });
    expect(takeaways(base)).toContain(t("Pire moment : 1 850 ppm de CO₂ le jeudi 19 novembre vers 22 h."));
  });
  it("trous dans les mesures", () => {
    expect(takeaways(input({ measured_s: 5 * 86400 + 20 * 3600 }))[0])
      .toBe(t("Pas de mesure pendant 1 j 4 h : vérifie que la carte reste branchée et connectée."));
  });
  it("alertes de la période", () => {
    const alerts = { current: 3, previous: 5, by_kind: [
      { kind: "co2_high" as const, label: "CO₂ élevé", count: 2 }, { kind: "hum_low" as const, label: "Air trop sec", count: 1 }] };
    expect(takeaways(input({ alerts, tone: "warn" })))
      .toEqual(["3 alertes cette semaine (CO₂ élevé ×2, Air trop sec), contre 5 la semaine dernière."]);
    expect(takeaways(input({ alerts: { current: 0, previous: 2, by_kind: [] }, kind: "month" }))[0])
      .toBe("Aucune alerte ce mois-ci, contre 2 le mois dernier.");
  });
  it("garde au plus trois constats", () => {
    const base = input({ dayHourCo2: withHour(7, 22, 1300), measured_s: 5 * 86400, alerts: { current: 1, previous: 0, by_kind: [{ kind: "co2_high", label: "CO₂ élevé", count: 1 }] } });
    base.metrics[4]!.current = period("hum", [40, 60, 0], 5 * 86400);
    base.metrics[0]!.current = period("co2", [60, 20, 20], 5 * 86400, { max: { v: 1500, ts: Date.UTC(2026, 10, 19, 21, 10) / 1000 } });
    const out = takeaways(base);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatch(/^Le CO₂ dépasse/);
    expect(out[1]).toMatch(/^L'air a été trop sec/);
    expect(out[2]).toMatch(/^Pire moment/);
  });
  it("aucun constat sans mesure", () => {
    expect(takeaways(input({ measured_s: 0 }))).toEqual([]);
  });
});

// English: no space before ":" and "%", a no-break space between a number and its unit.
const e = (s: string) => s.replace(/(\d) (ppm|°C|µg|d\b|h\b|min\b)/g, "$1 $2");

describe("report in English", () => {
  it("verdicts", () => {
    expect(verdict("week", false, air(86, 14, 0), 100, "en"))
      .toEqual({ tone: "good", head: "Good week", rest: ": the air was good 86% of the time." });
    expect(verdict("week", true, air(72, 24, 4), 100, "en"))
      .toEqual({ tone: "warn", head: "Average week so far", rest: ": the air was good 72% of the time, and bad 4%." });
    expect(verdict("month", false, air(60, 18, 22), 100, "en"))
      .toEqual({ tone: "bad", head: "Bad month", rest: ": the air was bad 22% of the time." });
    expect(verdict("week", false, air(41, 55, 4), 100, "en").rest).toBe(": the air was only good 41% of the time.");
    expect(verdict("week", false, air(0, 0, 0), 0, "en"))
      .toEqual({ tone: null, head: "No readings", rest: " this week: the board may have been offline." });
    expect(verdict("week", false, air(0, 0, 0), 3600, "en"))
      .toEqual({ tone: null, head: "No air readings", rest: " this week: no CO₂ or fine particles, only comfort." });
  });

  it("comparisons", () => {
    expect(comparison("co2", "week", period("co2", [70, 24, 6]), period("co2", [60, 29, 11]), 100, "en"))
      .toEqual({ trend: "better", text: "Better than last week: 6% of the time in the bad zone, against 11%." });
    expect(comparison("temp", "week", period("temp", [4, 81, 15]), period("temp", [2, 88, 10]), 100, "en"))
      .toEqual({ trend: "worse", text: "Worse than last week: 19% of the time out of comfort, against 12%." });
    expect(comparison("co2", "week", period("co2", [90, 10, 0]), period("co2", [80, 20, 0]), 100, "en"))
      .toEqual({ trend: "same", text: "Same as last week: never in the bad zone." });
    expect(comparison("co2", "custom", period("co2", [70, 24, 6]), period("co2", [100, 0, 0], 5), 100, "en"))
      .toEqual({ trend: null, text: "Not enough readings in the previous period to compare." });
  });

  it("takeaways", () => {
    const en = (over: Partial<TakeawayInput> = {}) => input({ lang: "en", ...over });
    expect(takeaways(en())).toEqual(["No alerts this week.", "Nothing else to report: keep it up."]);
    expect(takeaways(en({ dayHourCo2: withHour(6, 22, 1300) }))[0])
      .toBe(e("CO₂ goes over 1,200 ppm almost every evening around 22:00: ventilate before going to bed."));
    expect(takeaways(en({ dayHourCo2: withHour(4, 15, 1300) }))[0])
      .toBe(e("CO₂ often goes over 1,200 ppm in the afternoon around 15:00: ventilate a little before."));
    expect(takeaways(en({ dayHourCo2: withHour(7, 8, 900) }))[0])
      .toBe(e("CO₂ rises above 800 ppm almost every morning around 8:00: ventilate as soon as you wake up."));
    const dry = en();
    dry.metrics[4]!.current = period("hum", [40, 60, 0], 7 * 86400);
    expect(takeaways(dry)[0]).toBe("The air was too dry 40% of the time (below 40%): ventilate for shorter periods or use a humidifier.");
    const peak = en();
    peak.metrics[0]!.current = period("co2", [80, 10, 10], 7 * 86400, { max: { v: 1850, ts: Date.UTC(2026, 10, 19, 21, 10) / 1000 } });
    expect(takeaways(peak)).toContain(e("Worst moment: 1,850 ppm of CO₂ on Thursday 19 November around 22:00."));
    expect(takeaways(en({ measured_s: 5 * 86400 + 20 * 3600 }))[0])
      .toBe(e("No readings for 1 d 4 h: check that the board stays plugged in and connected."));
    const alerts = { current: 3, previous: 5, by_kind: [
      { kind: "co2_high" as const, label: "CO₂ élevé", count: 2 }, { kind: "hum_low" as const, label: "Air trop sec", count: 1 }] };
    expect(takeaways(en({ alerts, tone: "warn" })))
      .toEqual(["3 alerts this week (High CO₂ ×2, Air too dry), against 5 last week."]);
    expect(takeaways(en({ alerts: { current: 1, previous: 0, by_kind: [{ kind: "offline", label: "Carte hors ligne", count: 1 }] }, tone: "warn" })))
      .toEqual(["1 alert this week (Board offline), against none last week."]);
    expect(takeaways(en({ alerts: { current: 0, previous: 2, by_kind: [] }, kind: "month" }))[0])
      .toBe("No alerts this month, against 2 last month.");
  });
});
