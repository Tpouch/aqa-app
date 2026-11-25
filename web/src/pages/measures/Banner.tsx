import { useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button, Field } from "../../components/ui";
import { isoLocal, PRESETS, shiftDay, type Range } from "../../range";
import type { Selection } from "../../selection";
import { SMOOTH_MODES, type SmoothMode } from "../../smooth";

// Room put next to the shown one (single chart, several boards).
export interface CompareControl {
  choices: { id: string; name: string }[];
  current: { id: string; name: string } | null;
  // Why some rooms are missing (sound needs two calibrated boards).
  note: string | null;
  onPick: (id: string | null) => void;
}

const SMOOTH_LABEL: Record<SmoothMode, string> = { smooth: "lissé", band: "marge", raw: "brut" };
const SMOOTH_TITLE: Record<SmoothMode, string> = {
  smooth: "Moyenne glissante",
  band: "Moyenne glissante ± 2 écarts-types",
  raw: "Mesures telles que reçues",
};

// Top of the Mesures page: what is shown, over which period, and the controls.
// Same controls in both views; "plage…" and "comparer avec…" open their panel underneath.
export function Banner({ headRef, title, subtitle, range, onRange, today, view, onView, onCsv, csvDisabled, smoothing, onSmoothing, compare }: {
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
}) {
  const [panel, setPanel] = useState<null | "range" | "compare">(null);
  const toggle = (p: "range" | "compare") => setPanel(panel === p ? null : p);
  const day = range.kind === "day" ? range.date : today;

  return (
    <header ref={headRef} className="ms-head">
      <div className="ms-bar">
        <div className="ms-title">
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="ms-tools">
          <div className="seg" role="group" aria-label="Période glissante">
            {PRESETS.map((p) => (
              <button key={p.seconds} type="button" aria-label={`${p.label} glissantes`}
                      aria-pressed={range.kind === "preset" && range.seconds === p.seconds}
                      onClick={() => onRange({ kind: "preset", seconds: p.seconds })}>{p.short}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Jour précis">
            <button type="button" aria-label="Jour précédent" onClick={() => onRange({ kind: "day", date: shiftDay(day, -1) })}>‹</button>
            <button type="button" aria-pressed={range.kind === "day"} title="Aujourd'hui, de minuit à minuit"
                    onClick={() => onRange({ kind: "day", date: today })}>jour</button>
            <button type="button" aria-label="Jour suivant" disabled={day >= today}
                    onClick={() => onRange({ kind: "day", date: shiftDay(day, 1) })}>›</button>
          </div>
          <div className="seg">
            <button type="button" aria-expanded={panel === "range"} aria-controls="ms-range"
                    className={range.kind === "custom" ? "active" : undefined} onClick={() => toggle("range")}>plage…</button>
          </div>
          {compare && (
            <div className="seg">
              <button type="button" aria-expanded={panel === "compare"} aria-controls="ms-compare"
                      className={compare.current ? "active" : undefined} onClick={() => toggle("compare")}>
                {compare.current ? `avec ${compare.current.name}…` : "comparer avec…"}
              </button>
            </div>
          )}
          <div className="seg">
            <button type="button" disabled={csvDisabled} onClick={onCsv}>csv <span aria-hidden>↓</span></button>
          </div>
          <div className="seg" role="group" aria-label="Traitement des données">
            {SMOOTH_MODES.map((m) => (
              <button key={m} type="button" title={SMOOTH_TITLE[m]} aria-pressed={smoothing === m}
                      onClick={() => onSmoothing(m)}>{SMOOTH_LABEL[m]}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={view === "single"} onClick={() => onView("single")}>1 graphe</button>
            <button type="button" aria-pressed={view === "grid"} onClick={() => onView("grid")}>grille</button>
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
  return (
    <div id="ms-compare" className="ms-range ms-compare">
      {control.choices.length > 0 && (
        <div className="seg" role="group" aria-label="Pièce à comparer">
          {control.choices.map((c) => (
            <button key={c.id} type="button" aria-pressed={control.current?.id === c.id} onClick={() => pick(c.id)}>{c.name}</button>
          ))}
        </div>
      )}
      {control.note && <p className="muted small">{control.note}</p>}
      <div className="ms-range-actions">
        {control.current && <Button type="button" variant="ghost" onClick={() => pick(null)}>ne plus comparer</Button>}
        <Button type="button" variant="ghost" onClick={onDone}>fermer</Button>
      </div>
    </div>
  );
}

function RangePanel({ range, onRange, onClose }: { range: Range; onRange: (r: Range) => void; onClose: () => void }) {
  const [from, setFrom] = useState(() => isoLocal(range.kind === "custom" ? range.from : Date.now() / 1000 - 3 * 3600));
  const [to, setTo] = useState(() => isoLocal(range.kind === "custom" ? range.to : Date.now() / 1000));
  const [error, setError] = useState<string | null>(null);

  function apply(e: FormEvent) {
    e.preventDefault();
    const a = new Date(from).getTime() / 1000;
    const b = new Date(to).getTime() / 1000;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return setError("Renseigne les deux dates.");
    if (b <= a) return setError("La fin doit être après le début.");
    if (b - a > 366 * 86400) return setError("Un an maximum.");
    setError(null);
    onRange({ kind: "custom", from: a, to: b });
  }

  return (
    <form id="ms-range" className="ms-range" onSubmit={apply} aria-label="Plage libre">
      <Field label="Début"><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Fin"><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <div className="ms-range-actions">
        <Button type="submit" variant="primary">afficher</Button>
        <Button type="button" variant="ghost" onClick={onClose}>fermer</Button>
      </div>
      {error && <p className="field-error small ms-range-error" role="alert">{error}</p>}
    </form>
  );
}
