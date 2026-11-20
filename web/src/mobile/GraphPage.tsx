import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "../components/ui";
import { ZoneChart } from "../components/ZoneChart";
import { metricDef, toDisplay } from "../metrics";
import { useSeries } from "../pages/device/shared";
import { PRESETS } from "../range";
import { METRICS, type DeviceSummary, type Metric } from "../../../server/src/types";
import { fmt } from "../util";
import { enterLandscape, exitLandscape } from "./fullscreen";
import { reading } from "./Gauge";

/**
 * Open a metric's chart from a tap: try full screen + landscape (needs the gesture), then route.
 * The history entry itself remembers it was opened from the app, so ✕ can go back to where
 * the user was; a link opened directly has no such mark and ✕ goes to the list instead.
 */
export function openGraph(metric: Metric): void {
  void enterLandscape();
  window.history.pushState({ aqaFromApp: true }, "", `#/graph/${metric}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

const openedFromApp = () => (window.history.state as { aqaFromApp?: boolean } | null)?.aqaFromApp === true;

export function GraphPage({ id, device, metric }: { id: string; device: DeviceSummary; metric: Metric | null }) {
  return metric ? <FullGraph id={id} device={device} metric={metric} /> : <GraphList device={device} />;
}

function GraphList({ device }: { device: DeviceSummary }) {
  return (
    <div className="mb-graph-list">
      <ul>
        {METRICS.map((m) => {
          const { def, v, band } = reading(m, device);
          return (
            <li key={m}>
              <button type="button" onClick={() => openGraph(m)}>
                <span>{def.label} <span className="muted">{def.unit}</span></span>
                <span className={band ? `tone-${band.tone}` : undefined}>
                  {v === null ? "—" : fmt(v, def.decimals)}{band && <span className="sr-only">, {band.word}</span>}
                  <span className="muted" aria-hidden> ›</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small mb-note">Touche un capteur : le graphe s'ouvre en plein écran. Tourne ton téléphone pour l'agrandir.</p>
    </div>
  );
}

function usePortrait(): boolean {
  const q = useMemo(() => window.matchMedia?.("(orientation: portrait)") ?? null, []);
  const [portrait, setPortrait] = useState(() => q?.matches ?? false);
  useEffect(() => {
    if (!q) return;
    const on = () => setPortrait(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [q]);
  return portrait;
}

function FullGraph({ id, device, metric }: { id: string; device: DeviceSummary; metric: Metric }) {
  const [seconds, setSeconds] = useState(86400);
  // A preset is live: useSeries slides the window to now; only its length matters here.
  const [from, to] = useMemo(() => { const now = Math.floor(Date.now() / 1000); return [now - seconds, now]; }, [seconds]);
  const series = useSeries(id, from, to, true);
  const cal = device.sound_calibration;
  const def = metricDef(metric, cal);
  const ys = useMemo(() => series.columns[metric].map((v) => toDisplay(metric, v, cal)), [series.columns, metric, cal]);
  const portrait = usePortrait();

  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => setHeight(Math.max(120, Math.floor(el.clientHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => {
    exitLandscape();
  }, []);

  const close = () => {
    exitLandscape();
    if (openedFromApp()) window.history.back();
    else window.location.replace("#/graph");
  };

  const label = PRESETS.find((p) => p.seconds === seconds)?.label ?? "";
  return (
    <div className="mb-fg">
      <header className="mb-fg-head">
        <h2><span>{def.label}</span> <span className="muted">{def.unit} · {label}</span></h2>
        <div className="seg mb-fg-range" role="group" aria-label="Période">
          {PRESETS.map((p) => (
            <button key={p.seconds} type="button" aria-pressed={p.seconds === seconds} onClick={() => setSeconds(p.seconds)}>{p.short}</button>
          ))}
        </div>
        <button type="button" className="mb-fg-close" onClick={close} aria-label="Fermer le graphe"><span aria-hidden>✕</span></button>
      </header>
      {portrait && <p className="mb-fg-hint muted small"><span aria-hidden>⟳ </span>Tourne ton téléphone pour agrandir</p>}
      {series.error && !series.data && <p className="callout warn" role="alert"><span aria-hidden>▲</span> {series.error}</p>}
      <div ref={box} className="mb-fg-chart">
        {height > 0 && (series.loading
          ? <Skeleton height={height} />
          : <ZoneChart def={def} xs={series.columns.xs} ys={ys} range={series.window} height={height} />)}
      </div>
    </div>
  );
}
