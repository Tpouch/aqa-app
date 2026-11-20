import { useState } from "react";
import { METRICS, type DeviceSummary, type Metric } from "../../../server/src/types";
import { bandOf, metricDef, toDisplay } from "../metrics";
import { TAB_LABEL, TAB_ORDER, type Tab } from "../routes";
import type { Selection } from "../selection";
import { applyTheme, readTheme } from "../theme";
import { ago, fmt } from "../util";

// The fixed left column: board, its five current readings (which double as the
// Mesures page's metric picker), navigation, theme and logout.
export function Sidebar({ devices, device, onDevice, tab, selection, onSelection, pending, onLogout, now }: {
  devices: DeviceSummary[];
  device: DeviceSummary | undefined;
  onDevice: (id: string) => void;
  tab: Tab;
  selection: Selection;
  onSelection: (s: Selection) => void;
  pending: number;
  onLogout: () => void;
  now: number;
}) {
  const [theme, setTheme] = useState(readTheme);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const checkboxes = tab === "mesures" && selection.view === "grid";

  const pick = (m: Metric) => {
    if (checkboxes) {
      const on = selection.grid.includes(m);
      if (on && selection.grid.length === 1) return; // at least one chart stays
      onSelection({ ...selection, grid: on ? selection.grid.filter((g) => g !== m) : [...selection.grid, m] });
      return;
    }
    if (tab === "mesures") {
      onSelection({ ...selection, metric: m });
    } else {
      onSelection({ ...selection, view: "single", metric: m });
      window.location.hash = "/mesures";
    }
  };

  return (
    <aside className="sidebar" aria-label="Carte et relevés">
      <div className="sb-head">
        <a href="#/mesures" className="sb-brand">AQA</a>
        {device && (
          <>
            <div className="sb-device">
              <span className={device.online ? "tone-good" : "muted"} aria-hidden>●</span>
              <span className="sr-only">{device.online ? "En ligne" : "Hors ligne"}</span>
              {devices.length > 1 ? (
                <select className="sb-switch" value={device.id} aria-label="Carte affichée"
                        onChange={(e) => onDevice(e.target.value)}>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ) : (
                <span className="sb-name" title={device.name}>{device.name}</span>
              )}
            </div>
            <div className="sb-ago">{device.latest ? `mesuré ${ago(device.latest.ts, now)}` : "aucune mesure reçue"}</div>
          </>
        )}
      </div>

      {device && (
        <ul className="sb-readings" aria-label={checkboxes ? "Mesures affichées en grille" : "Relevés actuels"}>
          {METRICS.map((m) => {
            const def = metricDef(m, device.sound_calibration);
            const v = toDisplay(m, device.latest?.[m] ?? null, device.sound_calibration);
            const band = bandOf(def, v);
            const on = checkboxes ? selection.grid.includes(m) : selection.metric === m;
            const selected = on && (checkboxes || tab === "mesures");
            const toneClass = band && band.tone !== "good" ? `tone-${band.tone}` : "";
            return (
              <li key={m}>
                <button type="button"
                        className={`sb-reading${selected ? " selected" : ""}`}
                        data-tone={selected ? band?.tone ?? "none" : undefined}
                        {...(checkboxes ? { role: "checkbox", "aria-checked": on } : { "aria-pressed": selected })}
                        onClick={() => pick(m)}>
                  <span className="sb-label">
                    <span className="sb-name-unit">
                      {checkboxes && <span aria-hidden>{on ? "☑ " : "☐ "}</span>}
                      {def.label} · {def.unit}
                    </span>
                    {band && <span className={`tone-${band.tone}`}>{band.word}</span>}
                  </span>
                  <span className={`sb-value ${toneClass}`}>{fmt(v, def.decimals)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <nav className="sb-nav" aria-label="Navigation principale">
        {device && TAB_ORDER.map((t) => (
          <a key={t} href={`#/${t}`} aria-current={t === tab ? "page" : undefined}>
            {t === tab && <span aria-hidden>▸ </span>}{TAB_LABEL[t]}
            {t === "carte" && pending > 0 && (
              <span className="tone-warn sb-count"> {pending}<span className="sr-only"> en cours</span></span>
            )}
          </a>
        ))}
        <div className="sb-tools">
          <button type="button" className="sb-link" aria-label={`Passer au thème ${nextTheme === "light" ? "clair" : "sombre"}`}
                  onClick={() => { applyTheme(nextTheme); setTheme(nextTheme); }}>
            ◐ {nextTheme === "light" ? "clair" : "sombre"}
          </button>
          <span aria-hidden className="muted">·</span>
          <button type="button" className="sb-link" onClick={onLogout}>déconnexion</button>
        </div>
      </nav>
    </aside>
  );
}
