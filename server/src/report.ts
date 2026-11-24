// The report (bilan) of one board over a period, from one-minute averages.
// Pure: no database, no clock. The route reads the rows; the weekly ntfy
// summary will call this too.
import { CATALOG } from "./alerts.js";
import { localClock } from "./localtime.js";
import { comparison, takeaways, verdict } from "./reportText.js";
import { soundDb } from "./sound.js";
import { bandOf, zonesOf } from "./zones.js";
import {
  METRICS,
  type AggregateRow, type AirTime, type AlertKind, type DeviceReport, type HeatRow, type Metric, type MetricPeriod,
  type ReportKind, type SoundCalibration, type Tone,
} from "./types.js";

/** Bucket length of the rows the report is computed from, in seconds. */
export const REPORT_STEP = 60;
/** A measurement stands until the next one if that one comes within this delay;
 *  a longer silence is an outage and the bucket only counts for itself. */
export const MAX_GAP_S = 600;

export interface ReportInput {
  deviceId: string;
  kind: ReportKind;
  tz: string;
  from: number;
  to: number;
  prevFrom: number;
  now: number;
  firstTs: number | null;
  cal: SoundCalibration | null;
  step: number;
  current: AggregateRow[]; // buckets of `step` seconds
  previous: AggregateRow[];
  alerts: { current: AlertKind[]; previous: AlertKind[] };
}

const RANK: Record<Tone, number> = { good: 0, warn: 1, bad: 2 };

function valueOf(row: AggregateRow, m: Metric, cal: SoundCalibration | null): number | null {
  const raw = row[m];
  if (raw === null || raw === undefined) return null;
  return m === "snd" && cal ? soundDb(raw, cal) : raw;
}

interface Summary { measured_s: number; air: AirTime; metrics: Record<Metric, MetricPeriod> }

function summarize(rows: AggregateRow[], step: number, cal: SoundCalibration | null): Summary {
  const air: AirTime = { measured_s: 0, good_s: 0, warn_s: 0, bad_s: 0 };
  let measured = 0;
  const metrics = {} as Record<Metric, MetricPeriod>;
  const sums = {} as Record<Metric, number>;
  for (const m of METRICS) {
    const bands = zonesOf(m, cal !== null);
    metrics[m] = {
      measured_s: 0, avg: null, min: null, max: null,
      zones: bands ? bands.map((b) => ({ word: b.word, tone: b.tone, seconds: 0 })) : null,
    };
    sums[m] = 0;
  }

  rows.forEach((row, i) => {
    const next = rows[i + 1]?.ts;
    const span = next !== undefined && next - row.ts <= MAX_GAP_S ? next - row.ts : step;
    let any = false;
    let worst: Tone | null = null;
    for (const m of METRICS) {
      const v = valueOf(row, m, cal);
      if (v === null) continue;
      any = true;
      const p = metrics[m];
      p.measured_s += span;
      sums[m] += v * span;
      if (!p.min || v < p.min.v) p.min = { v, ts: row.ts };
      if (!p.max || v > p.max.v) p.max = { v, ts: row.ts };
      const bands = zonesOf(m, cal !== null);
      const band = bandOf(bands, v);
      if (band && p.zones) p.zones[bands!.indexOf(band)]!.seconds += span;
      if ((m === "co2" || m === "pm25") && band && (worst === null || RANK[band.tone] > RANK[worst])) worst = band.tone;
    }
    if (any) measured += span;
    if (worst) {
      air.measured_s += span;
      air[`${worst}_s`] += span;
    }
  });
  for (const m of METRICS) {
    const p = metrics[m];
    if (p.measured_s) p.avg = sums[m] / p.measured_s;
  }
  return { measured_s: measured, air, metrics };
}

/** Local date → 24 hourly CO₂ means (null = no measurement), plus each date's weekday. */
function co2ByDayHour(rows: AggregateRow[], tz: string) {
  const clock = localClock(tz);
  const acc = new Map<string, { weekday: number; sum: number[]; n: number[] }>();
  for (const row of rows) {
    if (row.co2 === null) continue;
    const t = clock(row.ts);
    let day = acc.get(t.date);
    if (!day) acc.set(t.date, day = { weekday: t.weekday, sum: Array(24).fill(0), n: Array(24).fill(0) });
    day.sum[t.hour] = day.sum[t.hour]! + row.co2;
    day.n[t.hour] = day.n[t.hour]! + 1;
  }
  const means = new Map<string, (number | null)[]>();
  const weekdays = new Map<string, number>();
  for (const [date, d] of [...acc].sort(([a], [b]) => a.localeCompare(b))) {
    means.set(date, d.sum.map((s, h) => (d.n[h] ? s / d.n[h]! : null)));
    weekdays.set(date, d.weekday);
  }
  return { means, weekdays };
}

function heatRows(
  kind: ReportKind, from: number, tz: string,
  means: Map<string, (number | null)[]>, weekdays: Map<string, number>,
): HeatRow[] {
  if (kind === "week") {
    const clock = localClock(tz);
    // Noon of each day: safe from the hour lost or gained when clocks change.
    return Array.from({ length: 7 }, (_, i) => {
      const t = clock(from + i * 86400 + 12 * 3600);
      return { weekday: t.weekday, date: t.date, cells: means.get(t.date) ?? Array(24).fill(null) };
    }).sort((a, b) => a.weekday - b.weekday);
  }
  return Array.from({ length: 7 }, (_, wd) => {
    const days = [...means].filter(([date]) => weekdays.get(date) === wd).map(([, cells]) => cells);
    const cells = Array.from({ length: 24 }, (_, h) => {
      const vs = days.map((c) => c[h]).filter((v): v is number => v !== null && v !== undefined);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    });
    return { weekday: wd, date: null, cells };
  });
}

function countAlerts(kinds: AlertKind[]) {
  const counts = new Map<AlertKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts].map(([kind, count]) => ({ kind, label: CATALOG[kind].label, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildReport(input: ReportInput): DeviceReport {
  const { from, to, prevFrom, now, step, cal, tz, kind } = input;
  const end = Math.min(to, now);
  const prevEnd = Math.min(from, now);
  const inside = (lo: number, hi: number) => (r: AggregateRow) => r.ts >= lo && r.ts < hi;
  const curRows = input.current.filter(inside(from, end));
  const prevRows = input.previous.filter(inside(prevFrom, prevEnd));

  const cur = summarize(curRows, step, cal);
  const prev = summarize(prevRows, step, cal);
  const elapsed = Math.max(0, end - from);
  const prevElapsed = Math.max(0, prevEnd - prevFrom);
  const inProgress = to > now;

  const metrics = METRICS.map((m) => ({
    metric: m,
    current: cur.metrics[m],
    previous: prev.metrics[m],
    comparison: comparison(m, kind, cur.metrics[m], prev.metrics[m], prevElapsed),
  }));
  const { means, weekdays } = co2ByDayHour(curRows, tz);
  const alerts = {
    current: input.alerts.current.length,
    previous: input.alerts.previous.length,
    by_kind: countAlerts(input.alerts.current),
  };
  const v = verdict(kind, inProgress, cur.air);

  return {
    device_id: input.deviceId, kind, tz, from, to, prev_from: prevFrom, now, first_ts: input.firstTs,
    in_progress: inProgress,
    elapsed_s: elapsed,
    measured_s: cur.measured_s,
    prev_elapsed_s: prevElapsed,
    prev_measured_s: prev.measured_s,
    sound_calibrated: cal !== null,
    verdict: v,
    air: { current: cur.air, previous: prev.air },
    metrics,
    heatmap: { metric: "co2", by: kind === "week" ? "day" : "weekday", rows: heatRows(kind, from, tz, means, weekdays) },
    alerts,
    takeaways: takeaways({
      kind, tz, tone: v.tone, elapsed_s: elapsed, measured_s: cur.measured_s, metrics, dayHourCo2: means, alerts,
    }),
  };
}

