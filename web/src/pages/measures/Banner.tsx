import { useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button, Field } from "../../components/ui";
import { isoLocal, PRESETS, shiftDay, type Range } from "../../range";
import type { Selection } from "../../selection";
import { SMOOTH_MODES, type SmoothMode } from "../../smooth";
import { t } from "../../i18n/dict";

// Room put next to the shown one (single chart, several boards).
export interface CompareControl {
  choices: { id: string; name: string }[];
  current: { id: string; name: string } | null;
  // Why some rooms are missing (sound needs two calibrated boards).
  note: string | null;
  onPick: (id: string | null) => void;
}


// Top of the Mesures page: what is shown, over which period, and the controls.
// Same controls in both views; "plage…" and "comparer avec…" open their panel underneath.
export function Banner({ headRef, title, subtitle, range, onRange, today, view, onView, onCsv, csvDisabled, smoothing, onSmoothing, compare }: Readonly<{
  headRef: RefObject<HTMLElement | null>;
  title: ReactNode;
  subtitle: string;
  range: Range;
  onRange: (r: Range) => void;
  today: string;
  view: Selection["view"];
  onView: (v: Selection["view"]) => void;
  onCsv: () => void;
  csvDisabled: boolean;
  smoothing: SmoothMode;
  onSmoothing: (m: SmoothMode) => void;
  compare?: CompareControl;
}>) {
  const [panel, setPanel] = useState<null | "range" | "compare">(null);
  const toggle = (p: "range" | "compare") => setPanel(panel === p ? null : p);
  const day = range.kind === "day" ? range.date : today;
  const w = t().measures;

  return (
    <header ref={headRef} className="ms-head">
      <div className="ms-bar">
        <div className="ms-title">
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="ms-tools">
          <div className="seg" role="group" aria-label={w.rollingPeriod}>
            {PRESETS.map((p) => (
              <button key={p.seconds} type="button" aria-label={w.rollingAria(p.label)}
                      aria-pressed={range.kind === "preset" && range.seconds === p.seconds}
                      onClick={() => onRange({ kind: "preset", seconds: p.seconds })}>{p.short}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label={w.exactDay}>
            <button type="button" aria-label={w.prevDay} onClick={() => onRange({ kind: "day", date: shiftDay(day, -1) })}>‹</button>
            <button type="button" aria-pressed={range.kind === "day"} title={w.todayTitle}
                    onClick={() => onRange({ kind: "day", date: today })}>{w.day}</button>
            <button type="button" aria-label={w.nextDay} disabled={day >= today}
                    onClick={() => onRange({ kind: "day", date: shiftDay(day, 1) })}>›</button>
          </div>
          <div className="seg">
            <button type="button" aria-expanded={panel === "range"} aria-controls="ms-range"
                    className={range.kind === "custom" ? "active" : undefined} onClick={() => toggle("range")}>{w.range}</button>
          </div>
          {compare && (
            <div className="seg">
              <button type="button" aria-expanded={panel === "compare"} aria-controls="ms-compare"
                      className={compare.current ? "active" : undefined} onClick={() => toggle("compare")}>
                {compare.current ? w.withRoom(compare.current.name) : w.compareWith}
              </button>
            </div>
          )}
          <div className="seg">
            <button type="button" disabled={csvDisabled} onClick={onCsv}>csv <span aria-hidden>↓</span></button>
          </div>
          <fieldset className="seg" aria-label={w.processing}>
            {SMOOTH_MODES.map((m) => (
              <button key={m} type="button" title={w.smoothTitle[m]} aria-pressed={smoothing === m}
                      onClick={() => onSmoothing(m)}>{w.smoothLabel[m]}</button>
            ))}
          </fieldset>
          <div className="seg" role="group" aria-label={w.display}>
            <button type="button" aria-pressed={view === "single"} onClick={() => onView("single")}>{w.oneChart}</button>
            <button type="button" aria-pressed={view === "grid"} onClick={() => onView("grid")}>{w.grid}</button>
          </div>
        </div>
      </div>
      {panel === "range" && <RangePanel range={range} onRange={(r) => { onRange(r); setPanel(null); }} onClose={() => setPanel(null)} />}
      {panel === "compare" && compare && <ComparePanel control={compare} onDone={() => setPanel(null)} />}
    </header>
  );
}

// One button per room; picking one (or stopping) closes the panel.
export function ComparePanel({ control, onDone }: { control: CompareControl; onDone: () => void }) {
  const pick = (id: string | null) => { control.onPick(id); onDone(); };
  const w = t().measures;
  return (
    <div id="ms-compare" className="ms-range ms-compare">
      {control.choices.length > 0 && (
        <div className="seg" role="group" aria-label={w.roomToCompare}>
          {control.choices.map((c) => (
            <button key={c.id} type="button" aria-pressed={control.current?.id === c.id} onClick={() => pick(c.id)}>{c.name}</button>
          ))}
        </div>
      )}
      {control.note && <p className="muted small">{control.note}</p>}
      <div className="ms-range-actions">
        {control.current && <Button type="button" variant="ghost" onClick={() => pick(null)}>{w.stopComparing}</Button>}
        <Button type="button" variant="ghost" onClick={onDone}>{w.close}</Button>
      </div>
    </div>
  );
}

function RangePanel({ range, onRange, onClose }: { range: Range; onRange: (r: Range) => void; onClose: () => void }) {
  const [from, setFrom] = useState(() => isoLocal(range.kind === "custom" ? range.from : Date.now() / 1000 - 3 * 3600));
  const [to, setTo] = useState(() => isoLocal(range.kind === "custom" ? range.to : Date.now() / 1000));
  const [error, setError] = useState<string | null>(null);
  const w = t().measures;

  function apply(e: FormEvent) {
    e.preventDefault();
    const a = new Date(from).getTime() / 1000;
    const b = new Date(to).getTime() / 1000;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return setError(w.bothDates);
    if (b <= a) return setError(w.endAfterStart);
    if (b - a > 366 * 86400) return setError(w.oneYearMax);
    setError(null);
    onRange({ kind: "custom", from: a, to: b });
  }

  return (
    <form id="ms-range" className="ms-range" onSubmit={apply} aria-label={w.freeRange}>
      <Field label={w.start}><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label={w.end}><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <div className="ms-range-actions">
        <Button type="submit" variant="primary">{w.show}</Button>
        <Button type="button" variant="ghost" onClick={onClose}>{w.close}</Button>
      </div>
      {error && <p className="field-error small ms-range-error" role="alert">{error}</p>}
    </form>
  );
}
