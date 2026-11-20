import { WarningIcon } from "@phosphor-icons/react";
import { useMemo, useRef } from "react";
import { Skeleton } from "../../components/ui";
import { ZoneChart } from "../../components/ZoneChart";
import { csvColumns } from "../../measures";
import { metricDef, periodStats, soundDb, toDisplay } from "../../metrics";
import { isoDay, periodLabel, resolveRange, useRange } from "../../range";
import type { Selection } from "../../selection";
import { METRICS, type DeviceSummary, type Metric, type SoundCalibration } from "../../../../server/src/types";
import { downloadCsv } from "../../util";
import { stepLabel, useSeries } from "../device/shared";
import { Banner } from "./Banner";
import { Grid } from "./Grid";
import { StatsRow } from "./StatsRow";

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Mesures: banner + stats + one zone chart, or a grid of the metrics checked in the column.
export function MeasuresPage({ id, device, selection, onSelection }: {
  id: string;
  device: DeviceSummary | null;
  selection: Selection;
  onSelection: (s: Selection) => void;
}) {
  const [range, setRange] = useRange();
  const today = isoDay(new Date());
  const r = resolveRange(range, today);
  const series = useSeries(id, r.from, r.to, r.live, r.refresh);
  const head = useRef<HTMLElement>(null);

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
  const items = useMemo(() => METRICS.map((m) => {
    const def = metricDef(m, calibration);
    const ys = display[m];
    return { metric: m, def, ys, stats: periodStats(def, series.columns.xs, ys, period) };
  }), [display, calibration, series.columns.xs, period]);

  const grid = selection.view === "grid";
  const shown: Metric[] = grid ? selection.grid : [selection.metric];
  const single = items.find((i) => i.metric === selection.metric)!;
  const periodText = periodLabel(range);
  const rows = series.data?.rows ?? [];

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
    downloadCsv(`${id}-${name}-${isoDay(new Date(series.window[0] * 1000))}.csv`, header, lines);
  };

  const title = grid
    ? `${shown.length} mesure${shown.length > 1 ? "s" : ""}`
    : <>{single.def.label} <span className="muted ms-unit">{single.def.unit}</span></>;
  const subtitle = capital(r.title) + (series.step > 0 ? ` · moyennes sur ${stepLabel(series.step)}` : "");

  return (
    <div className="ms">
      <Banner headRef={head} title={title} subtitle={subtitle} range={range} onRange={setRange} today={today}
              view={selection.view} onView={(view) => onSelection({ ...selection, view })}
              onCsv={exportCsv} csvDisabled={!rows.length || !shown.length} />

      {series.error && !series.data && (
        <p className="callout warn" role="alert"><WarningIcon size={18} aria-hidden />{series.error}</p>
      )}

      {!grid && (
        <>
          <StatsRow def={single.def} stats={series.loading ? undefined : single.stats} span={series.window[1] - series.window[0]} period={periodText} />
          {series.loading
            ? <Skeleton height={310} />
            : <ZoneChart def={single.def} xs={series.columns.xs} ys={single.ys} range={series.window} height={310} />}
        </>
      )}

      {grid && (series.loading
        ? <Skeleton height={400} />
        : (
          <Grid headRef={head} xs={series.columns.xs} xRange={series.window} period={periodText}
                items={items.filter((i) => shown.includes(i.metric)).map((i) => ({ ...i, alertSeconds: i.stats?.alertSeconds ?? null }))}
                onOpen={(metric) => onSelection({ ...selection, view: "single", metric })} />
        ))}
    </div>
  );
}
