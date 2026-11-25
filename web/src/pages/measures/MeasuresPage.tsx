import { useMemo, useRef } from "react";
import { Skeleton } from "../../components/ui";
import { ZoneChart, type Compare } from "../../components/ZoneChart";
import { compareChoices, compareTarget } from "../../compare";
import { bannerSubtitle, csvColumns, csvFileName } from "../../measures";
import { metricDef, periodStats, soundDb, toDisplay } from "../../metrics";
import { isoDay, periodLabel, resolveRange, useRange } from "../../range";
import type { Selection } from "../../selection";
import { smoothWindow, type Smoothing } from "../../smooth";
import { METRICS, type DeviceSummary, type Metric, type SoundCalibration } from "../../../../server/src/types";
import { downloadCsv } from "../../util";
import { stepLabel, useSeries } from "../device/shared";
import { Banner, type CompareControl } from "./Banner";
import { Grid } from "./Grid";
import { StatsRow } from "./StatsRow";

const SOUND_NOTE = "Le son ne se compare qu'entre deux cartes calibrées (Réglages → Calibrer le son).";

// Mesures: banner + stats + one zone chart, or a grid of the metrics checked in the column.
// The single chart can show another room next to this one (dashed).
export function MeasuresPage({ id, device, others, selection, onSelection }: {
  id: string;
  device: DeviceSummary | null;
  others: DeviceSummary[]; // the other boards: the banner names the room, and offers to compare
  selection: Selection;
  onSelection: (s: Selection) => void;
}) {
  const [range, setRange] = useRange();
  const today = isoDay(new Date());
  const r = resolveRange(range, today);
  const series = useSeries(id, r.from, r.to, r.live, r.refresh);
  const head = useRef<HTMLElement>(null);
  const multi = others.length > 0;
  const grid = selection.view === "grid";

  // Room compared on the single chart: fetched over the same window, shown once its rows are in.
  const target = grid ? null : compareTarget(selection.compare, selection.metric, device, others);
  const otherSeries = useSeries(target?.id ?? null, r.from, r.to, r.live, r.refresh);
  const otherCal = target?.sound_calibration ?? null;
  const otherCalKey = otherCal ? `${otherCal.snd_ref}/${otherCal.db_ref}` : "";
  const otherYs = useMemo(
    () => otherSeries.columns[selection.metric].map((v) => toDisplay(selection.metric, v, otherCal)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [otherSeries.columns, selection.metric, otherCalKey],
  );

  // Keyed on the values, not the object: the device poll hands a new one every 15 s.
  const cal: SoundCalibration | null = device?.sound_calibration ?? null;
  const calKey = cal ? `${cal.snd_ref}/${cal.db_ref}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calibration = useMemo(() => cal, [calKey]);

  // Display units: calibrated sound in dB, everything else as received.
  const display = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m, series.columns[m].map((v) => toDisplay(m, v, calibration))])) as Record<Metric, (number | null)[]>,
    [series.columns, calibration],
  );
  const period = series.step || 15;
  // Same width on every chart; rounded so the 30 s poll, which nudges the window, keeps it.
  const smoothWin = Math.round(smoothWindow(series.window[1] - series.window[0], period));
  const smoothing = useMemo<Smoothing>(() => ({ mode: selection.smoothing, window: smoothWin }), [selection.smoothing, smoothWin]);
  const items = useMemo(() => METRICS.map((m) => {
    const def = metricDef(m, calibration);
    const ys = display[m];
    return { metric: m, def, ys, stats: periodStats(def, series.columns.xs, ys, period) };
  }), [display, calibration, series.columns.xs, period]);

  const shown: Metric[] = grid ? selection.grid : [selection.metric];
  const single = items.find((i) => i.metric === selection.metric)!;
  const periodText = periodLabel(range);
  const rows = series.data?.rows ?? [];
  // Nothing loaded and the fetch failed: the error replaces the skeletons.
  const failed = !!series.error && !series.data;

  const exportCsv = () => {
    const header = csvColumns(shown, calibration);
    const lines = rows.map((row) => [
      new Date(row.ts * 1000).toISOString(),
      ...shown.flatMap((m) => {
        if (m !== "snd" || !calibration) return [row[m]];
        const db = soundDb(row.snd, calibration);
        return [row.snd, db === null ? null : +db.toFixed(1)];
      }),
    ]);
    const name = grid ? "grille" : selection.metric;
    downloadCsv(csvFileName(device?.name ?? "", id, name, isoDay(new Date(series.window[0] * 1000))), header, lines);
  };

  const title = grid
    ? `${shown.length} mesure${shown.length > 1 ? "s" : ""}`
    : <>{single.def.label} <span className="muted ms-unit">{single.def.unit}</span></>;
  const subtitle = bannerSubtitle(multi && device ? device.name : null, r.title, series.step > 0 ? stepLabel(series.step) : null);

  const loaded = target !== null && otherSeries.data?.id === target.id;
  const compare = useMemo<Compare | undefined>(
    () => loaded ? { here: device?.name ?? id, name: target.name, xs: otherSeries.columns.xs, ys: otherYs, tolerance: period } : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, device?.name, id, target?.name, otherSeries.columns.xs, otherYs, period],
  );
  const choices = compareChoices(selection.metric, device, others);
  const compareControl: CompareControl | undefined = !grid && multi ? {
    choices: choices.map((d) => ({ id: d.id, name: d.name })),
    current: target && { id: target.id, name: target.name },
    note: selection.metric === "snd" && choices.length < others.length ? SOUND_NOTE : null,
    onPick: (compare) => onSelection({ ...selection, compare }),
  } : undefined;

  return (
    <div className="ms">
      <Banner headRef={head} title={title} subtitle={subtitle} range={range} onRange={setRange} today={today}
              view={selection.view} onView={(view) => onSelection({ ...selection, view })}
              onCsv={exportCsv} csvDisabled={!rows.length || !shown.length}
              smoothing={selection.smoothing} onSmoothing={(smoothing) => onSelection({ ...selection, smoothing })}
              compare={compareControl} />

      {failed && (
        <p className="callout warn" role="alert"><span aria-hidden>▲</span> {series.error}</p>
      )}

      {!failed && !grid && (
        <>
          <StatsRow def={single.def} stats={series.loading ? undefined : single.stats} span={series.window[1] - series.window[0]} period={periodText} />
          {series.loading
            ? <Skeleton height={310} />
            : <ZoneChart def={single.def} xs={series.columns.xs} ys={single.ys} range={series.window} height={310} compare={compare} smoothing={smoothing} />}
        </>
      )}

      {!failed && grid && (series.loading
        ? <Skeleton height={400} />
        : (
          <Grid headRef={head} xs={series.columns.xs} xRange={series.window} period={periodText} smoothing={smoothing}
                items={items.filter((i) => shown.includes(i.metric)).map((i) => ({ ...i, alertSeconds: i.stats?.alertSeconds ?? null }))}
                onOpen={(metric) => onSelection({ ...selection, view: "single", metric })} />
        ))}
    </div>
  );
}
