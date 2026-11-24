import { bandOf, metricDef, toDisplay } from "../metrics";
import type { DeviceSummary, Metric } from "../../../server/src/types";
import { fmt } from "../util";
import { gaugeAngle, gaugeScale, gaugeSegments } from "./gaugeGeometry";

const R = 34;
const CX = 50;
const CY = 44;
const GAP = 1; // degrees left empty between two zones

function point(deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [CX + R * Math.cos(r), CY + R * Math.sin(r)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Shown value, zone and definition of one metric for a board, in display units. */
export function reading(metric: Metric, device: DeviceSummary) {
  const cal = device.sound_calibration;
  const def = metricDef(metric, cal);
  const v = toDisplay(metric, device.latest?.[metric] ?? null, cal);
  return { def, v, band: bandOf(def, v), scale: gaugeScale(metric, cal !== null) };
}

export function Gauge({ metric, device, stale, editing, lifted, first, last, onOpen, onMove, pointer }: {
  metric: Metric;
  device: DeviceSummary;
  stale: boolean;
  editing: boolean;
  lifted: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onMove: (delta: -1 | 1) => void;
  // Long press on the card (dashboard) or drag on the handle (organise mode).
  pointer: React.DOMAttributes<HTMLElement>;
}) {
  const { def, v, band, scale } = reading(metric, device);
  const tone = !stale && band ? band.tone : null;
  const toneClass = tone ? ` tone-${tone}` : "";
  const segments = gaugeSegments(def, scale);
  const dot = v === null ? null : point(gaugeAngle(scale, v));
  const value = v === null ? "—" : fmt(v, def.decimals);
  const label = `${def.label} ${v === null ? "pas de mesure" : `${value} ${def.unit}`}${band ? `, ${band.word}` : ""}${stale ? ", valeur ancienne" : ""}`;

  const body = (
    <>
      <span className="mb-g-head">
        <span>{def.label}</span>
        <span className="muted">{def.unit}</span>
      </span>
      <svg className="mb-g-arc" viewBox="0 0 100 82" aria-hidden focusable="false">
        {segments.map((s, i) => (
          <path key={i} d={arc(s.from + GAP, s.to - GAP)} fill="none" strokeWidth={5}
                stroke={s.tone ? `var(--${s.tone})` : "var(--rule-strong)"} />
        ))}
        {dot && <circle cx={dot[0]} cy={dot[1]} r={5.5} fill="var(--bg)" stroke="var(--text)" strokeWidth={2.5} />}
      </svg>
      <span className={`mb-g-value${toneClass}`}>{value}</span>
      <span className={`mb-g-word${toneClass}`}>{band?.word ?? " "}</span>
    </>
  );

  const cls = `mb-gauge${tone === "bad" ? " bad" : ""}${stale ? " stale" : ""}${lifted ? " lifted" : ""}`;
  if (!editing) {
    return (
      <button type="button" className={cls} data-metric={metric} onClick={onOpen} {...pointer} aria-label={`${label}. Ouvrir le graphe`}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} data-metric={metric} role="group" aria-label={label}>
      <span className="mb-g-handle" aria-hidden {...pointer}>⋮⋮</span>
      {body}
      <span className="mb-g-move">
        <button type="button" disabled={first} onClick={() => onMove(-1)} aria-label={`Monter ${def.label}`}><span aria-hidden>↑</span></button>
        <button type="button" disabled={last} onClick={() => onMove(1)} aria-label={`Descendre ${def.label}`}><span aria-hidden>↓</span></button>
      </span>
    </div>
  );
}
