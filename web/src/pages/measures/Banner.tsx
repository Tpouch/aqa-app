import { useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button, Field } from "../../components/ui";
import { isoLocal, PRESETS, shiftDay, type Range } from "../../range";
import type { Selection } from "../../selection";

// Top of the Mesures page: what is shown, over which period, and the controls.
// Same controls in both views; "plage…" opens the free-range fields underneath.
export function Banner({ headRef, title, subtitle, range, onRange, today, view, onView, onCsv, csvDisabled }: {
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
}) {
  const [panel, setPanel] = useState(false);
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
            <button type="button" aria-expanded={panel} aria-controls="ms-range"
                    className={range.kind === "custom" ? "active" : undefined} onClick={() => setPanel(!panel)}>plage…</button>
          </div>
          <div className="seg">
            <button type="button" disabled={csvDisabled} onClick={onCsv}>csv <span aria-hidden>↓</span></button>
          </div>
          <div className="seg" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={view === "single"} onClick={() => onView("single")}>1 graphe</button>
            <button type="button" aria-pressed={view === "grid"} onClick={() => onView("grid")}>grille</button>
          </div>
        </div>
      </div>
      {panel && <RangePanel range={range} onRange={(r) => { onRange(r); setPanel(false); }} onClose={() => setPanel(false)} />}
    </header>
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
