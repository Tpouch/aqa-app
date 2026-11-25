import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { bandOptions, chartData, hoverDot, spreadAt, withSpread } from "../chartBand";
import { labelSides, valueNear, type Cell } from "../compare";
import { dateFmt } from "../i18n/format";
import { bandOf, yRange, type Band, type MetricDef, type Tone } from "../metrics";
import { chartColumns, type Smoothing } from "../smooth";
import { fmt } from "../util";
import { t } from "../i18n/dict";

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
  // Another room on the same chart (single view): dashed curve, its name at the end.
  compare?: Compare;
  // Smoothed curve, or smoothed with its ± 2σ band; absent = raw values.
  smoothing?: Smoothing;
}

export interface Compare {
  here: string;               // name of the room shown, for the tooltip
  name: string;               // name of the other room
  xs: number[];
  ys: (number | null)[];      // display units, like `ys`
  tolerance: number;          // seconds: the tooltip takes the other room's value this close
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const hm = { format: (d: Date) => dateFmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) };
const dm = { format: (d: Date) => dateFmt({ day: "2-digit", month: "2-digit" }).format(d) };
const wd = { format: (d: Date) => dateFmt({ weekday: "short" }).format(d) };

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
function bandBounds(bands: readonly Band[]) {
  return bands.map((b, i) => ({ band: b, lo: i === 0 ? null : bands[i - 1]!.to, hi: b.to }));
}

function lastIndex(ys: Cell[]) {
  for (let i = ys.length - 1; i >= 0; i--) if (ys[i] != null) return i;
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

/** Y ticks: every zone limit in view, plus the regular ticks not crowding one. */
export function axisSplits(limits: (number | null)[], min: number, max: number, incr: number): number[] {
  const regular: number[] = [];
  for (let v = Math.ceil(min / incr) * incr; v <= max; v += incr) regular.push(+v.toFixed(6));
  const shown = limits.filter((v): v is number => v !== null && v >= min && v <= max);
  if (!shown.length) return regular;
  const gap = incr * 0.6;
  const clear = (v: number) => shown.every((l) => Math.abs(v - l) > gap);
  return [...shown, ...regular.filter(clear)].sort((a, b) => a - b);
}

/** What the screen reader hears: the last value (null = none in the window), and the
 *  compared room's. `past`: the window ended a while ago, so it's not "current". */
export function currentLabel(def: MetricDef, past: boolean, last: number | null, other: { name: string; value: number | null } | null): string {
  const reading = (v: number) => `${fmt(v, def.decimals)} ${def.unit}`;
  const w = t().chart;
  let own = w.noReadingPeriod;
  if (last !== null) own = `${past ? w.lastValue : w.currentValue} ${reading(last)}`;
  if (!other) return own;
  const theirs = other.value === null ? w.noReading : reading(other.value);
  return `${own}, ${other.name} ${theirs}`;
}

export const toneClass = (tone: Tone | undefined) => (tone ? `tone-${tone}` : "");

interface TipRow { room?: string; text: string; tone: Tone | undefined }

/** Hover tooltip: time, then the value (one row per room when comparing). */
export function ZoneTip({ left, flip, time, own, other }: Readonly<{ left: number; flip: boolean; time: string; own: TipRow; other: TipRow | undefined }>) {
  const value = (r: TipRow) => <span className={`zc-tip-value ${toneClass(r.tone)}`.trim()}>{r.text}</span>;
  return (
    <span className={flip ? "zc-tip flip" : "zc-tip"} style={{ left }}>
      <span className="zc-tip-time">{time}</span>
      {other ? (
        <>
          <span className="zc-tip-row"><span className="zc-tip-room"><span aria-hidden>━ </span>{own.room}</span>{value(own)}</span>
          <span className="zc-tip-row"><span className="zc-tip-room"><span aria-hidden>╍ </span>{other.room}</span>{value(other)}</span>
        </>
      ) : value(own)}
    </span>
  );
}

export function ZoneChart({ def, xs: ownXs, ys: ownYs, range, height, compact = false, onOpen, compare, smoothing }: Readonly<Props>) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const theme = useThemeKey();
  // Window and height reach the live chart through refs: a 30 s poll moves the
  // window and a grid resize changes the height, neither should rebuild it.
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const heightRef = useRef(height);
  heightRef.current = height;
  // left: px from the chart's left edge; flip: tooltip goes left of the line.
  const [hover, setHover] = useState<{ idx: number; left: number; flip: boolean } | null>(null);

  // Smoothed (or raw) curves; with another room, both share one time axis (see
  // mergeSeries) and the band is laid on that axis too. The other room gets no band.
  // `smoothing` is memoised by the page: a new object means a new mode or window.
  const merged = useMemo(
    () => chartColumns(ownXs, ownYs, compare, smoothing),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownXs, ownYs, compare?.xs, compare?.ys, smoothing],
  );
  const { xs, a: ys, b: others, sd } = merged;
  const { data, bandFrom, banded } = chartData(merged);
  const last = useMemo(() => lastIndex(ys), [ys]);
  const lastOther = useMemo(() => (others ? lastIndex(others) : -1), [others]);
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
    const band = bandOptions(banded, bandFrom, cssVar("--margin"), cssVar("--margin-band"));

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

    // End of a curve, or null when it has no point or ends outside the window.
    const endOf = (u: uPlot, si: number) => {
      const d = u.data[si] as Cell[] | undefined;
      const i = d ? lastIndex(d) : -1;
      if (i < 0) return null;
      const cx = u.valToPos(u.data[0][i]!, "x", true);
      const { bbox } = u;
      if (cx < bbox.left - 1 || cx > bbox.left + bbox.width + 1) return null;
      return { cx, cy: u.valToPos(d![i]!, "y", true), v: d![i]! };
    };
    // Text right-aligned left of the dot, above or below it, with a halo for the bands.
    const label = (ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, side: "above" | "below", color: string) => {
      ctx.textAlign = "right";
      ctx.textBaseline = side === "above" ? "bottom" : "top";
      const ty = side === "above" ? cy - 7 * px : cy + 7 * px;
      ctx.lineWidth = 3 * px;
      ctx.lineJoin = "round";
      ctx.strokeStyle = c.bg;
      ctx.strokeText(text, cx - 6 * px, ty);
      ctx.fillStyle = color;
      ctx.fillText(text, cx - 6 * px, ty);
    };

    // Current value: dot in its zone colour, number written next to it. The other
    // room's curve ends with a ring and its name, on the side away from this one.
    const drawCurrent = (u: uPlot) => {
      const own = endOf(u, 1);
      const other = compare ? endOf(u, 2) : null;
      if (!own && !other) return;
      const sides = labelSides(own?.cy ?? Infinity, other?.cy ?? null, u.bbox.top, u.bbox.top + u.bbox.height, 22 * px);
      const { ctx } = u;
      ctx.save();
      if (other) {
        ctx.beginPath();
        ctx.arc(other.cx, other.cy, 3.5 * px, 0, 2 * Math.PI);
        ctx.fillStyle = c.bg;
        ctx.fill();
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = c.muted;
        ctx.stroke();
        ctx.font = font(12);
        label(ctx, compare!.name, other.cx, other.cy, sides.other, c.muted);
      }
      if (own) {
        const color = toneOf(own.v);
        ctx.beginPath();
        ctx.arc(own.cx, own.cy, 4 * px, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.font = font(compact ? 11 : 13, 500);
        label(ctx, fmt(own.v, def.decimals), own.cx, own.cy, sides.main, color);
      }
      ctx.restore();
    };

    const axis: uPlot.Axis = {
      stroke: c.muted,
      grid: { stroke: c.rule, width: 1 },
      ticks: { show: false },
      // uPlot scales axis fonts by pxRatio itself: give it CSS pixels.
      font: `400 ${compact ? 10 : 11}px ${c.mono}`,
    };
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: heightRef.current,
      padding: [8, compact ? 12 : 64, 0, 0],
      cursor: {
        sync: { key: "aqa" },
        drag: { x: false, y: false },
        y: false,
        points: {
          ...hoverDot(bandFrom),
          stroke: c.bg,
          fill: (u, si) => toneOf((u.data[si] as Cell[])[u.cursor.idxs?.[si] ?? u.cursor.idx ?? -1]),
        },
        // Two rooms: a hover point only on a measure close to the cursor, not across a hole.
        ...(compare ? { hover: { prox: (u: uPlot) => {
          const x0 = u.scales.x?.min ?? 0;
          return u.valToPos(x0 + compare.tolerance, "x") - u.valToPos(x0, "x");
        } } } : {}),
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
        x: { time: true, range: () => rangeRef.current },
        y: { range: (_u, min, max) => yRange(def, min ?? null, max ?? null) },
      },
      series: [
        {},
        { stroke: c.text, width: 2, spanGaps: false, points: { show: false } },
        ...(compare ? [{ stroke: c.muted, width: 1.5, dash: [6 * px, 4 * px], spanGaps: false, points: { show: false } }] : []),
        ...band.series,
      ],
      bands: band.bands,
      axes: [
        { ...axis, space: compact ? 60 : 70, values: timeTicks },
        {
          ...axis,
          side: 3,
          size: 48,
          // Zone limits are always labelled; regular ticks too when not crowding them.
          splits: (_u, _ax, min, max, incr) => axisSplits(bounds.map((b) => b.hi), min, max, incr),
          values: (_u, vals) => vals.map((v) => fmt(v, Number.isInteger(v) ? 0 : def.decimals)),
        },
      ],
    };
    plot.current = new uPlot(opts, data, el);
    setHover(null);
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height: heightRef.current }));
    ro.observe(el);
    // The canvas draws with whatever font is ready: once IBM Plex Mono has loaded, draw again.
    let alive = true;
    const fonts = [axis.font as string, font(11), font(13, 500)];
    if (document.fonts && !fonts.every((f) => document.fonts.check(f))) {
      Promise.all(fonts.map((f) => document.fonts.load(f)))
        .then(() => { if (alive) plot.current?.redraw(false, true); }, () => {});
    }
    return () => {
      alive = false;
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // Re-create only when the metric, its bands, mode, theme, compared room or smoothing
    // mode (it adds or removes the band's series) changes;
    // data, window and height are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.metric, def.unit, bandsKey, compact, theme, compare?.name, compare?.tolerance, !!compare, banded]);

  useEffect(() => {
    plot.current?.setData(data, false);
    plot.current?.setScale("x", { min: range[0], max: range[1] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, range[0], range[1]]);

  useEffect(() => {
    const u = plot.current;
    if (u && box.current && u.height !== height) u.setSize({ width: box.current.clientWidth, height });
  }, [height]);

  const hovering = hover !== null && xs[hover.idx] !== undefined;
  const idx = hovering ? hover!.idx : last;
  const tolerance = compare?.tolerance ?? 0;
  const value = idx >= 0 ? valueNear(xs, ys, idx, tolerance) : null;
  const tone = bandOf(def, value)?.tone;
  const spread = spreadAt(xs, sd, hover, tolerance);
  const valueText = withSpread(def, value, spread);
  const otherValue = others && hovering ? valueNear(xs, others, hover!.idx, tolerance) : null;
  const otherTone = bandOf(def, otherValue)?.tone;

  // The hover tooltip is visual only (no live region): it would chatter on every mouse move.
  // A window that ended more than ~2 min ago (past day, closed range) has no "current" value.
  const past = range[1] < Date.now() / 1000 - 120;
  const currentText = currentLabel(def, past, ys[last] ?? null, compare ? { name: compare.name, value: others?.[lastOther] ?? null } : null);
  const canvas = (
    <span className="zc-plot">
      <span ref={box} className="zc-canvas" role="img"
            aria-label={`${def.label}, ${currentText}`} />
      {empty && <span className="zc-empty">{t().chart.empty(compare ? compare.here : null)}</span>}
      {!compact && hovering && (
        <ZoneTip left={hover.left} flip={hover.flip} time={stamp(xs[hover.idx]!, range[1] - range[0])}
                 own={{ room: compare?.here, text: valueText, tone }}
                 other={compare && { room: compare.name, text: `${fmt(otherValue, def.decimals)} ${def.unit}`, tone: otherTone }} />
      )}
    </span>
  );

  if (!compact) return <div className="zc">{canvas}</div>;

  return (
    <button type="button" className="zc compact" onClick={onOpen} aria-label={t().chart.open(def.label, currentText)}>
      <span className="zc-head">
        <span className="zc-label">{def.label} <span className="muted">{def.unit}</span></span>
        <span className="zc-read" aria-hidden>
          {idx >= 0 && <span className="muted">{hm.format(new Date(xs[idx]! * 1000))} → </span>}
          <b className={toneClass(tone) || undefined}>{fmt(value, def.decimals)}</b>
        </span>
      </span>
      {canvas}
    </button>
  );
}
