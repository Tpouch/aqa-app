import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ZoneChart } from "../../components/ZoneChart";
import { alertPhrase, formatDuration, gridColumns } from "../../measures";
import type { MetricDef } from "../../metrics";
import type { Smoothing } from "../../smooth";
import type { Metric } from "../../../../server/src/types";

const GAP = 10;          // .ms-grid gap
const BOTTOM = 16;       // .shell-main bottom padding
const CELL_CHROME = 28;  // compact cell: border + padding + header line
const NARROW = "(max-width: 720px)";

export interface GridItem { metric: Metric; def: MetricDef; ys: (number | null)[]; alertSeconds: number | null }

// Checked metrics, sized so that every row fits in the visible height (within 140–260 px a chart).
export function Grid({ items, xs, xRange, period, smoothing, onOpen, headRef }: {
  items: GridItem[];
  xs: number[];
  xRange: [number, number];
  period: string;
  smoothing: Smoothing;
  onOpen: (m: Metric) => void;
  headRef: RefObject<HTMLElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(() => matches(NARROW));
  const [height, setHeight] = useState(180);
  const n = items.length;
  const cols = narrow ? 1 : gridColumns(n);
  const rows = Math.ceil(n / cols);

  useLayoutEffect(() => {
    const calc = () => {
      const el = box.current;
      if (!el) return;
      setNarrow(matches(NARROW));
      const top = el.getBoundingClientRect().top + window.scrollY;
      const h = (window.innerHeight - top - (rows - 1) * GAP - BOTTOM) / rows - CELL_CHROME;
      setHeight(Math.round(Math.min(260, Math.max(140, h))));
    };
    calc();
    window.addEventListener("resize", calc);
    // The banner grows when "plage…" opens or its controls wrap.
    const ro = new ResizeObserver(calc);
    if (headRef.current) ro.observe(headRef.current);
    return () => {
      window.removeEventListener("resize", calc);
      ro.disconnect();
    };
  }, [rows, headRef]);

  if (!n) return <p className="muted ms-empty">Coche au moins une mesure dans la colonne</p>;

  const zoned = items.filter((i) => i.def.alertLabel && i.alertSeconds !== null);
  const summary = cols === 2 && n % 2 === 1;

  return (
    <div ref={box} className="ms-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((i) => (
        <ZoneChart key={i.metric} compact def={i.def} xs={xs} ys={i.ys} range={xRange} height={height} smoothing={smoothing}
                   onOpen={() => onOpen(i.metric)} />
      ))}
      {summary && (
        <div className="ms-summary">
          {zoned.length === 0 ? <p className="ms-summary-title">Aucune mesure sur {period}</p> : (
            <>
              <p className="ms-summary-title">Sur {period}</p>
              <ul>
                {zoned.map((i) => (
                  <li key={i.metric}>{alertPhrase(i.def)} <b>{formatDuration(i.alertSeconds!)}</b></li>
                ))}
              </ul>
              {zoned.every((i) => i.alertSeconds === 0) && <p>Tout le reste dans le confort</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function matches(q: string) {
  return window.matchMedia(q).matches;
}
