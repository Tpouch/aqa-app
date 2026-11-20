import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, ClockIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Chart } from "../../components/Chart";
import { Badge, Button, Field, Skeleton } from "../../components/ui";
import { METRICS, type DeviceSummary, type Metric } from "../../../../server/src/types";
import { ago, downloadCsv, fmt, level, METRIC_INFO } from "../../util";
import { stepLabel, useSeries } from "./shared";

type Range =
  | { kind: "preset"; seconds: number }
  | { kind: "day"; date: string }               // YYYY-MM-DD, local time
  | { kind: "custom"; from: number; to: number };

const PRESETS = [
  { label: "1 h", seconds: 3600 },
  { label: "6 h", seconds: 6 * 3600 },
  { label: "24 h", seconds: 86400 },
  { label: "7 j", seconds: 7 * 86400 },
  { label: "30 j", seconds: 30 * 86400 },
];

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoLocal = (s: number) => { const d = new Date(s * 1000); return `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayStart = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(y!, m! - 1, d!).getTime() / 1000; };
const shiftDay = (date: string, delta: number) => { const [y, m, d] = date.split("-").map(Number); return isoDay(new Date(y!, m! - 1, d! + delta)); };
const longDay = new Intl.DateTimeFormat("fr", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDT = new Intl.DateTimeFormat("fr", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}

export function SensorTab({ id, device, now }: { id: string; device: DeviceSummary | null; now: number }) {
  const [metric, setMetric] = useState<Metric>(() => load("aqa-sensor-metric", "co2"));
  const [range, setRange] = useState<Range>(() => load("aqa-sensor-range", { kind: "preset", seconds: 86400 }));
  useEffect(() => { sessionStorage.setItem("aqa-sensor-metric", JSON.stringify(metric)); }, [metric]);
  useEffect(() => { sessionStorage.setItem("aqa-sensor-range", JSON.stringify(range)); }, [range]);

  const today = isoDay(new Date());
  const { from, to, live, refresh, title } = useMemo(() => {
    if (range.kind === "preset") {
      return { from: 0, to: range.seconds, live: true, refresh: true, title: `${PRESETS.find((p) => p.seconds === range.seconds)?.label ?? ""} glissantes` };
    }
    if (range.kind === "day") {
      const start = dayStart(range.date);
      return { from: start, to: start + 86400 - 1, live: false, refresh: range.date === today, title: longDay.format(new Date(start * 1000)) };
    }
    return { from: range.from, to: range.to, live: false, refresh: false, title: `${shortDT.format(range.from * 1000)} → ${shortDT.format(range.to * 1000)}` };
  }, [range, today]);

  const series = useSeries(id, from, to, live, refresh);
  const info = METRIC_INFO[metric];
  const current = device?.latest?.[metric] ?? null;
  const currentLevel = level(metric, current);
  const Icon = info.icon;

  return (
    <div className="sensor-tab">
      <div className="metric-picker" role="group" aria-label="Mesure affichée">
        {METRICS.map((m) => {
          const mi = METRIC_INFO[m];
          const MIcon = mi.icon;
          const v = device?.latest?.[m] ?? null;
          return (
            <button key={m} type="button" className="metric-choice" aria-pressed={m === metric} onClick={() => setMetric(m)}
                    style={{ "--series": mi.color } as React.CSSProperties}>
              <span className="mc-label"><MIcon size={16} aria-hidden />{mi.label}</span>
              <span className="mc-value">{fmt(v, mi.decimals)} <small>{mi.unit}</small></span>
            </button>
          );
        })}
      </div>

      <div className="sensor-grid">
        <section className="card current" aria-labelledby="current-title">
          <div className="card-body">
            <h2 id="current-title" className="section-title"><Icon size={16} aria-hidden /> {info.label} actuel</h2>
            <div className="hero-metric" style={{ marginTop: "0.5rem" }}>
              <span className="value" style={{ fontSize: "3.25rem" }}>{fmt(current, info.decimals)}</span>
              <span className="unit">{info.unit}</span>
            </div>
            <div className="toolbar" style={{ marginTop: "0.75rem" }}>
              {currentLevel && <Badge tone={currentLevel.tone}>{currentLevel.label}</Badge>}
              <span className="muted small"><ClockIcon size={14} aria-hidden /> {device?.latest ? `mesuré ${ago(device.latest.ts, now)}` : "aucune mesure"}</span>
            </div>
            {info.thresholds && (
              <p className="muted small" style={{ marginTop: "1rem" }}>
                Bon sous {fmt(info.thresholds[0])} {info.unit}, mauvais à partir de {fmt(info.thresholds[1])} {info.unit}.
                {info.thresholdSource && <> Repère : {info.thresholdSource}.</>}
              </p>
            )}
          </div>
        </section>

        <RangePicker range={range} onChange={setRange} today={today} />
      </div>

      <section className="card" aria-labelledby="period-title">
        <div className="card-head">
          <h2 id="period-title"><CalendarBlankIcon size={18} aria-hidden /><span>{title.charAt(0).toUpperCase() + title.slice(1)}</span></h2>
          <div className="toolbar">
            {series.step > 0 && <span className="muted small">moyennes sur {stepLabel(series.step)}</span>}
            <Button size="sm" icon={<DownloadSimpleIcon size={16} aria-hidden />} disabled={!series.data?.rows.length}
                    onClick={() => downloadCsv(`${id}-${metric}-${isoDay(new Date(series.window[0] * 1000))}.csv`, ["time", metric],
                      (series.data?.rows ?? []).map((r) => [new Date(r.ts * 1000).toISOString(), r[metric]]))}>CSV</Button>
          </div>
        </div>
        <div style={{ padding: "0 0.3rem 0.3rem" }}>
          {series.loading
            ? <div style={{ padding: "1rem" }}><Skeleton height={380} /></div>
            : <Chart key={metric} metric={metric} xs={series.columns.xs} ys={series.columns[metric]} range={series.window} height={380} />}
        </div>
      </section>
    </div>
  );
}

function RangePicker({ range, onChange, today }: { range: Range; onChange: (r: Range) => void; today: string }) {
  const day = range.kind === "day" ? range.date : today;
  const [customFrom, setCustomFrom] = useState(() => isoLocal(range.kind === "custom" ? range.from : Date.now() / 1000 - 3 * 3600));
  const [customTo, setCustomTo] = useState(() => isoLocal(range.kind === "custom" ? range.to : Date.now() / 1000));
  const [error, setError] = useState<string | null>(null);

  function applyCustom(e: FormEvent) {
    e.preventDefault();
    const from = new Date(customFrom).getTime() / 1000;
    const to = new Date(customTo).getTime() / 1000;
    if (!Number.isFinite(from) || !Number.isFinite(to)) return setError("Renseigne les deux dates.");
    if (to <= from) return setError("La fin doit être après le début.");
    if (to - from > 366 * 86400) return setError("Un an maximum.");
    setError(null);
    onChange({ kind: "custom", from, to });
  }

  return (
    <section className="card" aria-labelledby="range-title">
      <div className="card-head"><h2 id="range-title"><CalendarBlankIcon size={18} aria-hidden />Période</h2></div>
      <div className="card-body stack" style={{ paddingTop: "0.75rem" }}>
        <div>
          <div className="section-title" style={{ marginBottom: "0.4rem" }}>Jusqu'à maintenant</div>
          <div className="segmented" role="group" aria-label="Période glissante">
            {PRESETS.map((p) => (
              <button key={p.seconds} type="button" aria-pressed={range.kind === "preset" && range.seconds === p.seconds}
                      onClick={() => onChange({ kind: "preset", seconds: p.seconds })}>{p.label}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="section-title" style={{ marginBottom: "0.4rem" }}>Un jour précis</div>
          <div className="row no-label" style={{ alignItems: "center" }}>
            <Button iconOnly icon={<CaretLeftIcon size={18} aria-hidden />} onClick={() => onChange({ kind: "day", date: shiftDay(day, -1) })}>Jour précédent</Button>
            <input className="input" type="date" value={day} max={today} aria-label="Jour"
                   aria-current={range.kind === "day" ? "date" : undefined}
                   style={range.kind === "day" ? { borderColor: "var(--primary)" } : undefined}
                   onChange={(e) => e.target.value && onChange({ kind: "day", date: e.target.value })} />
            <Button iconOnly icon={<CaretRightIcon size={18} aria-hidden />} disabled={day >= today}
                    onClick={() => onChange({ kind: "day", date: shiftDay(day, 1) })}>Jour suivant</Button>
          </div>
        </div>

        <form onSubmit={applyCustom}>
          <div className="section-title" style={{ marginBottom: "0.4rem" }}>Plage personnalisée</div>
          <div className="range-fields">
            <Field label="Début"><input className="input" type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></Field>
            <Field label="Fin"><input className="input" type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></Field>
          </div>
          {error && <p className="field-error small" role="alert" style={{ marginTop: "0.4rem" }}>{error}</p>}
          <Button type="submit" variant={range.kind === "custom" ? "primary" : "default"} style={{ marginTop: "0.6rem", width: "100%" }}>Afficher cette plage</Button>
        </form>
      </div>
    </section>
  );
}
