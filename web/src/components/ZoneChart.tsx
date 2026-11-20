import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { bandOf, yRange, type Band, type MetricDef, type Tone } from "../metrics";
import { fmt } from "../util";

interface Props {
  def: MetricDef;
  xs: number[];
  // Already in display units (dB for calibrated sound).
  ys: (number | null)[];
  range: [number, number];
  height: number;
  // Grid cell: header with label + value under the cursor, the whole chart opens it.
  compact?: boolean;
  onOpen?: () => void;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const hm = new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit" });
const dm = new Intl.DateTimeFormat("fr", { day: "2-digit", month: "2-digit" });
const wd = new Intl.DateTimeFormat("fr", { weekday: "short" });

// 24 h French tick labels; the date goes under midnight ticks and on day steps.
function timeTicks(_u: uPlot, splits: number[], _axis: number, _space: number, incr: number) {
  return splits.map((s) => {
    const d = new Date(s * 1000);
    if (incr >= 86400) return dm.format(d);
    return d.getHours() === 0 && d.getMinutes() === 0 ? `${hm.format(d)}\n${dm.format(d)}` : hm.format(d);
  });
}

// "jeu. 13:50"; over a week the weekday alone is ambiguous, so the date is added.
function stamp(ts: number, span: number) {
  const d = new Date(ts * 1000);
  return span > 7 * 86400 ? `${wd.format(d)} ${dm.format(d)} ${hm.format(d)}` : `${wd.format(d)} ${hm.format(d)}`;
}

/** Lower and upper bounds of each band (null = unbounded). */
function bandBounds(bands: Band[]) {
  return bands.map((b, i) => ({ band: b, lo: i === 0 ? null : bands[i - 1]!.to, hi: b.to }));
}

function lastIndex(ys: (number | null)[]) {
  for (let i = ys.length - 1; i >= 0; i--) if (ys[i] !== null) return i;
  return -1;
}

// Re-renders when <html data-theme> changes, so the chart is rebuilt with the new colours.
function useThemeKey() {
  const [key, setKey] = useState(() => document.documentElement.dataset.theme ?? "");
  useEffect(() => {
    const mo = new MutationObserver(() => setKey(document.documentElement.dataset.theme ?? ""));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return key;
}

export function ZoneChart({ def, xs, ys, range, height, compact = false, onOpen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const theme = useThemeKey();
  // left: px from the chart's left edge; flip: tooltip goes left of the line.
  const [hover, setHover] = useState<{ idx: number; left: number; flip: boolean } | null>(null);

  const last = useMemo(() => lastIndex(ys), [ys]);
  const empty = last < 0;
  // Bands change with the sound calibration while metric and unit may not.
  const bandsKey = JSON.stringify(def.bands);

  useEffect(() => {
    const el = box.current!;
    const px = uPlot.pxRatio;
    const c = {
      text: cssVar("--text"), muted: cssVar("--muted"), rule: cssVar("--rule"), bg: cssVar("--bg"),
      tone: { good: cssVar("--good"), warn: cssVar("--warn"), bad: cssVar("--bad") } as Record<Tone, string>,
      band: { good: cssVar("--good-band"), warn: cssVar("--warn-band"), bad: cssVar("--bad-band") } as Record<Tone, string>,
      mono: cssVar("--mono"),
    };
    const font = (size: number, weight = 400) => `${weight} ${Math.round(size * px)}px ${c.mono}`;
    const toneOf = (v: number | null | undefined) => {
      const b = bandOf(def, v ?? null);
      return b ? c.tone[b.tone] : c.text;
    };
    const bounds = def.bands ? bandBounds(def.bands) : [];
    const span = range[1] - range[0];

    // Each band filled between its bounds, clipped to the plot area.
    const drawBands = (u: uPlot) => {
      const { ctx, bbox } = u;
      const top = bbox.top, bottom = bbox.top + bbox.height;
      ctx.save();
      for (const { band, lo, hi } of bounds) {
        const y0 = lo === null ? bottom : Math.min(bottom, u.valToPos(lo, "y", true));
        const y1 = hi === null ? top : Math.max(top, u.valToPos(hi, "y", true));
        if (y0 <= y1) continue;
        ctx.fillStyle = c.band[band.tone];
        ctx.fillRect(bbox.left, y1, bbox.width, y0 - y1);
      }
      ctx.restore();
    };

    // Zone names in the right margin, centred on the visible part of each band.
    const drawNames = (u: uPlot) => {
      const { ctx, bbox } = u;
      const top = bbox.top, bottom = bbox.top + bbox.height;
      ctx.save();
      ctx.font = font(11);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const { band, lo, hi } of bounds) {
        const y0 = lo === null ? bottom : Math.min(bottom, u.valToPos(lo, "y", true));
        const y1 = hi === null ? top : Math.max(top, u.valToPos(hi, "y", true));
        if (y0 - y1 < 12 * px) continue;
        ctx.fillStyle = c.tone[band.tone];
        ctx.fillText(band.word, bbox.left + bbox.width + 8 * px, (y0 + y1) / 2);
      }
      ctx.restore();
    };

    // Current value: dot in its zone colour, number written next to it.
    const drawCurrent = (u: uPlot) => {
      const data = u.data[1] as (number | null)[];
      const i = lastIndex(data);
      if (i < 0) return;
      const v = data[i]!;
      const { ctx, bbox } = u;
      const cx = u.valToPos(u.data[0][i]!, "x", true);
      const cy = u.valToPos(v, "y", true);
      if (cx < bbox.left - 1 || cx > bbox.left + bbox.width + 1) return;
      const color = toneOf(v);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 4 * px, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.font = font(compact ? 11 : 13, 500);
      ctx.textAlign = "right";
      const above = cy - 10 * px > bbox.top + 12 * px;
      ctx.textBaseline = above ? "bottom" : "top";
      const ty = above ? cy - 7 * px : cy + 7 * px;
      const label = fmt(v, def.decimals);
      ctx.lineWidth = 3 * px;
      ctx.lineJoin = "round";
      ctx.strokeStyle = c.bg;
      ctx.strokeText(label, cx - 6 * px, ty);
      ctx.fillStyle = color;
      ctx.fillText(label, cx - 6 * px, ty);
      ctx.restore();
    };

    const axis: uPlot.Axis = {
      stroke: c.muted,
      grid: { stroke: c.rule, width: 1 },
      ticks: { show: false },
      font: font(compact ? 10 : 11),
    };
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      padding: [8, compact ? 12 : 64, 0, 0],
      cursor: {
        sync: { key: "aqa" },
        drag: { x: false, y: false },
        y: false,
        points: {
          size: 8,
          width: 2,
          stroke: c.bg,
          fill: (u, si) => toneOf((u.data[si] as (number | null)[])[u.cursor.idx ?? -1]),
        },
      },
      legend: { show: false },
      hooks: {
        drawClear: [drawBands],
        draw: compact ? [drawCurrent] : [drawNames, drawCurrent],
        setCursor: [(u) => {
          const idx = u.cursor.idx;
          const left = u.cursor.left ?? -1;
          setHover(idx == null || left < 0 ? null : { idx, left: left + u.over.offsetLeft, flip: left > u.over.clientWidth - 170 });
        }],
      },
      scales: {
        x: { time: true, range: () => range },
        y: { range: (_u, min, max) => yRange(def, min ?? null, max ?? null) },
      },
      series: [
        {},
        { stroke: c.text, width: 2, spanGaps: false, points: { show: false } },
      ],
      axes: [
        { ...axis, space: compact ? 60 : 70, values: timeTicks },
        {
          ...axis,
          side: 3,
          size: 48,
          // Zone limits are always labelled; regular ticks too when not crowding them.
          splits: (_u, _ax, min, max, incr) => {
            const regular: number[] = [];
            for (let v = Math.ceil(min / incr) * incr; v <= max; v += incr) regular.push(+v.toFixed(6));
            const limits = bounds.map((b) => b.hi).filter((v): v is number => v !== null && v >= min && v <= max);
            if (!limits.length) return regular;
            const gap = incr * 0.6;
            return [...limits, ...regular.filter((v) => limits.every((l) => Math.abs(v - l) > gap))].sort((a, b) => a - b);
          },
          values: (_u, vals) => vals.map((v) => fmt(v, Number.isInteger(v) ? 0 : def.decimals)),
        },
      ],
    };
    plot.current = new uPlot(opts, [xs, ys], el);
    setHover(null);
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // Re-create only when the metric, its bands, window, size, mode or theme changes; data goes through setData.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.metric, def.unit, bandsKey, range[0], range[1], height, compact, theme]);

  useEffect(() => {
    plot.current?.setData([xs, ys], false);
    plot.current?.setScale("x", { min: range[0], max: range[1] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xs, ys]);

  const hovering = hover !== null && xs[hover.idx] !== undefined;
  const idx = hovering ? hover!.idx : last;
  const value = idx >= 0 ? ys[idx] ?? null : null;
  const tone = bandOf(def, value)?.tone;
  const valueText = `${fmt(value, def.decimals)} ${def.unit}`;

  // The hover tooltip is visual only (no live region): it would chatter on every mouse move.
  const currentText = empty ? "aucune mesure sur cette période" : `valeur actuelle ${fmt(ys[last], def.decimals)} ${def.unit}`;
  const canvas = (
    <span className="zc-plot">
      <span ref={box} className="zc-canvas" role="img"
            aria-label={`${def.label}, ${currentText}`} />
      {empty && <span className="zc-empty">Aucune mesure sur cette période</span>}
      {!compact && hovering && (
        <span className={`zc-tip${hover!.flip ? " flip" : ""}`} style={{ left: hover!.left }}>
          <span className="zc-tip-time">{stamp(xs[hover!.idx]!, range[1] - range[0])}</span>
          <span className={`zc-tip-value${tone ? ` tone-${tone}` : ""}`}>{valueText}</span>
        </span>
      )}
    </span>
  );

  if (!compact) return <div className="zc">{canvas}</div>;

  return (
    <button type="button" className="zc compact" onClick={onOpen} aria-label={`Ouvrir ${def.label} en grand, ${currentText}`}>
      <span className="zc-head">
        <span className="zc-label">{def.label} <span className="muted">{def.unit}</span></span>
        <span className="zc-read" aria-hidden>
          {idx >= 0 && <span className="muted">{hm.format(new Date(xs[idx]! * 1000))} → </span>}
          <b className={tone ? `tone-${tone}` : undefined}>{fmt(value, def.decimals)}</b>
        </span>
      </span>
      {canvas}
    </button>
  );
}
