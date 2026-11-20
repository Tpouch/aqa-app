import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { fmt, level, METRIC_INFO } from "../util";
import type { Metric } from "../../../server/src/types";
import { Badge } from "./ui";

interface Props {
  metric: Metric;
  xs: number[];
  ys: (number | null)[];
  range: [number, number];
  height?: number;
  // false: no title/readout (the page shows them itself).
  header?: boolean;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const hm = new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit" });
const dm = new Intl.DateTimeFormat("fr", { day: "2-digit", month: "2-digit" });
const full = new Intl.DateTimeFormat("fr", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// 24 h French tick labels; the date goes under midnight ticks and on day steps.
function timeTicks(_u: uPlot, splits: number[], _axis: number, _space: number, incr: number) {
  return splits.map((s) => {
    const d = new Date(s * 1000);
    if (incr >= 86400) return dm.format(d);
    return d.getHours() === 0 && d.getMinutes() === 0 ? `${hm.format(d)}\n${dm.format(d)}` : hm.format(d);
  });
}

// One time series. Charts share the "aqa" cursor sync key, so hovering one
// shows the same instant on all of them.
export function Chart({ metric, xs, ys, range, height = 190, header = true }: Props) {
  const info = METRIC_INFO[metric];
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const stats = useMemo(() => {
    let min = Infinity, max = -Infinity, sum = 0, n = 0;
    for (const v of ys) {
      if (v === null) continue;
      min = Math.min(min, v); max = Math.max(max, v); sum += v; n++;
    }
    return n ? { min, max, avg: sum / n } : null;
  }, [ys]);

  useEffect(() => {
    const el = box.current!;
    const axis = { stroke: cssVar("--muted"), grid: { stroke: cssVar("--grid"), width: 1 }, ticks: { show: false }, font: `12px ${cssVar("--font")}` };
    const thresholds = info.thresholds;
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      cursor: { sync: { key: "aqa" }, drag: { x: false, y: false }, points: { size: 7, fill: info.color } },
      legend: { show: false },
      hooks: {
        setCursor: [(u) => setHover(u.cursor.idx ?? null)],
        // Dashed threshold lines (warn / bad), drawn under the series.
        drawAxes: thresholds ? [(u) => {
          const { ctx, bbox } = u;
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.5 * devicePixelRatio;
          thresholds.forEach((t, i) => {
            const y = Math.round(u.valToPos(t, "y", true));
            if (y < bbox.top || y > bbox.top + bbox.height) return;
            ctx.strokeStyle = cssVar(i === 0 ? "--warn" : "--bad");
            ctx.beginPath();
            ctx.moveTo(bbox.left, y);
            ctx.lineTo(bbox.left + bbox.width, y);
            ctx.stroke();
          });
          ctx.restore();
        }] : [],
      },
      scales: {
        x: { time: true, range: () => range },
        // Keep the first threshold in view so "good" always has a reference.
        y: thresholds ? {
          range: (_u, min, max) => {
            const lo = Math.min(min ?? thresholds[0], thresholds[0] * 0.5);
            const hi = Math.max(max ?? thresholds[0], thresholds[0] * 1.08);
            return [Math.max(0, lo - (hi - lo) * 0.05), hi + (hi - lo) * 0.05];
          },
        } : {},
      },
      series: [
        {},
        { stroke: info.color, width: 1.5, fill: info.color + "1f", spanGaps: false, points: { show: false } },
      ],
      axes: [
        { ...axis, space: 70, values: timeTicks },
        { ...axis, size: 52, values: (_u, vals) => vals.map((v) => fmt(v, info.decimals)) },
      ],
    };
    plot.current = new uPlot(opts, [xs, ys], el);
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // Re-create only when the metric or the visible window changes; data goes through setData.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, range[0], range[1], height]);

  useEffect(() => {
    plot.current?.setData([xs, ys], false);
    plot.current?.setScale("x", { min: range[0], max: range[1] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xs, ys]);

  const hovering = hover !== null && xs[hover] !== undefined;
  const lastIdx = (() => { for (let i = ys.length - 1; i >= 0; i--) if (ys[i] !== null) return i; return -1; })();
  const idx = hovering ? hover! : lastIdx;
  const value = idx >= 0 ? ys[idx] ?? null : null;
  const lvl = level(metric, value);
  const Icon = info.icon;

  return (
    <section className="chart card" aria-labelledby={`chart-${metric}`}>
      <header hidden={!header}>
        <h3 id={`chart-${metric}`}>
          <Icon size={18} weight="bold" color={info.color} aria-hidden />
          {info.label}
          <span className="muted small" style={{ fontWeight: 400 }}>{info.unit}</span>
        </h3>
        <div className="readout" aria-live="off">
          <strong>
            {fmt(value, info.decimals)} <small className="muted">{info.unit}</small>
            {lvl && <> <Badge tone={lvl.tone}>{lvl.label}</Badge></>}
          </strong>
          <span>{hovering ? full.format(new Date(xs[hover!]! * 1000)) : idx >= 0 ? "dernière mesure" : ""}</span>
        </div>
      </header>
      {stats && (
        <div className="chart-stats">
          <span>min <b>{fmt(stats.min, info.decimals)}</b></span>
          <span>moy <b>{fmt(stats.avg, info.decimals)}</b></span>
          <span>max <b>{fmt(stats.max, info.decimals)}</b></span>
          {info.thresholds && (
            <span className="legend-thresholds" title={info.thresholdSource}>
              <span className="t-warn"><i />{fmt(info.thresholds[0])}</span>
              <span className="t-bad"><i />{fmt(info.thresholds[1])}</span>
            </span>
          )}
        </div>
      )}
      <div ref={box} className="chart-canvas" role="img"
           aria-label={stats ? `${info.label} : min ${fmt(stats.min, info.decimals)}, moyenne ${fmt(stats.avg, info.decimals)}, max ${fmt(stats.max, info.decimals)} ${info.unit}` : `${info.label} : aucune mesure`} />
      {!stats && <p className="chart-empty">Aucune mesure sur cette période</p>}
    </section>
  );
}
