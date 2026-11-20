import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

interface Props {
  title: string;
  unit: string;
  color: string;
  decimals: number;
  xs: number[];
  ys: (number | null)[];
  range: [number, number];
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const hm = new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit" });
const dm = new Intl.DateTimeFormat("fr", { day: "2-digit", month: "2-digit" });
const full = new Intl.DateTimeFormat("fr", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// 24 h French tick labels; the date is added under midnight ticks and on day steps.
function timeTicks(_u: uPlot, splits: number[], _axis: number, _space: number, incr: number) {
  return splits.map((s) => {
    const d = new Date(s * 1000);
    if (incr >= 86400) return dm.format(d);
    const midnight = d.getHours() === 0 && d.getMinutes() === 0;
    return midnight ? `${hm.format(d)}\n${dm.format(d)}` : hm.format(d);
  });
}

// One time series. All charts share the "aqa" cursor sync key, so hovering one
// shows the same instant on the others.
export function Chart({ title, unit, color, decimals, xs, ys, range }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [hover, setHover] = useState<number | null>(null);  // data index under the cursor

  useEffect(() => {
    const el = box.current!;
    const axis = { stroke: cssVar("--muted"), grid: { stroke: cssVar("--grid"), width: 1 }, ticks: { show: false } };
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: 180,
      cursor: { sync: { key: "aqa" }, drag: { x: false, y: false } },
      legend: { show: false },
      hooks: {
        setCursor: [(u) => setHover(u.cursor.idx ?? null)],
      },
      scales: { x: { time: true, range: () => range } },
      series: [
        {},
        {
          label: title,
          stroke: color,
          width: 1.5,
          fill: color + "1a",
          spanGaps: false,
          points: { show: false },
          value: (_u, v) => (v === null ? "—" : `${v.toFixed(decimals)} ${unit}`),
        },
      ],
      axes: [
        { ...axis, space: 70, values: timeTicks },
        { ...axis, size: 48, values: (_u, vals) => vals.map((v) => v.toFixed(decimals)) },
      ],
    };
    plot.current = new uPlot(opts, [xs, ys], el);
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height: 180 }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // Re-create only when the look or the visible window changes; data goes through setData.
  }, [title, unit, color, decimals, range[0], range[1]]);

  useEffect(() => {
    plot.current?.setData([xs, ys], false);
    plot.current?.setScale("x", { min: range[0], max: range[1] });
  }, [xs, ys]);

  const empty = ys.every((v) => v === null);
  let headline: string;
  if (hover !== null && xs[hover] !== undefined) {
    const v = ys[hover];
    headline = `${v === null || v === undefined ? "—" : `${v.toFixed(decimals)} ${unit}`} · ${full.format(new Date(xs[hover]! * 1000))}`;
  } else {
    const last = [...ys].reverse().find((v) => v !== null);
    headline = last === undefined || last === null ? "—" : `${last.toFixed(decimals)} ${unit}`;
  }

  return (
    <section className="chart card">
      <header>
        <h3><span className="swatch" style={{ background: color }} />{title}</h3>
        <span className={`chart-last${hover !== null ? " hovering" : ""}`}>{headline}</span>
      </header>
      <div ref={box} className="chart-canvas" />
      {empty && <p className="chart-empty">Aucune mesure sur cette période</p>}
    </section>
  );
}
