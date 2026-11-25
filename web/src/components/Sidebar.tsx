import { useState } from "react";
import { METRICS, type DeviceSummary, type Metric } from "../../../server/src/types";
import { bandOf, metricDef, toDisplay } from "../metrics";
import { tabLabel } from "../i18n/vocab";
import { TAB_ORDER, type Tab } from "../routes";
import type { Selection } from "../selection";
import { t } from "../i18n/dict";
import { applyTheme, readTheme, type Theme } from "../theme";
import { LangToggle } from "./LangToggle";
import { ago, fmt } from "../util";
import { neverSeen, waiting } from "../rooms";
import { RoomList } from "./RoomList";

// The fixed left column: board, its five current readings (which double as the
// Mesures page's metric picker), navigation, theme and logout.
export function Sidebar({ devices, device, onDevice, tab, selection, onSelection, pending, alerts, unknown, onLogout, now }: {
  devices: DeviceSummary[];
  device: DeviceSummary | undefined;
  onDevice: (id: string) => void;
  tab: Tab;
  selection: Selection;
  onSelection: (s: Selection) => void;
  pending: number;
  alerts: number;
  unknown: number; // unregistered boards that keep calling the API
  onLogout: () => void;
  now: number;
}) {
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
    <aside className="sidebar" aria-label={t().shell.sidebar}>
      <div className="sb-head">
        <a href="#/mesures" className="sb-brand">AQA</a>
        {device && (
          <>
            {devices.length > 1 ? (
              // Several rooms: all of them, with their worst zone and alerts, so
              // trouble in the room not shown is never missed.
              <RoomList devices={devices} current={device.id} onPick={(id) => {
                onDevice(id);
                if (tab === "ajouter") window.location.hash = "/mesures";
              }} />
            ) : (
              <div className="sb-device">
                {/* Shape and word, not only colour: ● online, ○ + "hors ligne" offline. */}
                <span className={device.online ? "tone-good" : "muted"} aria-hidden>{device.online ? "●" : "○"}</span>
                {device.online && <span className="sr-only">{t().shell.online}</span>}
                <span className="sb-name" title={device.name}>{device.name}</span>
                {!device.online && <span className="sb-offline">{neverSeen(device) ? waiting() : t().rooms.offline}</span>}
              </div>
            )}
            <div className="sb-ago">{device.latest ? t().shell.measuredAgo(ago(device.latest.ts, now)) : t().shell.noReadingYet}</div>
            {unknown > 0 && (
              <a className="sb-unknown tone-warn" href="#/ajouter">
                <span aria-hidden>▲ </span>
                {t().shell.unknownBoards(unknown)}
              </a>
            )}
            <a className="sb-link sb-add" href="#/ajouter" aria-current={tab === "ajouter" ? "page" : undefined}>{t().shell.addBoard}</a>
          </>
        )}
      </div>

      {device && (
        <ul className="sb-readings" aria-label={checkboxes ? t().shell.gridReadings : t().shell.currentReadings}>
          {METRICS.map((m) => {
            const def = metricDef(m, device.sound_calibration);
            const v = toDisplay(m, device.latest?.[m] ?? null, device.sound_calibration);
            const band = bandOf(def, v);
            const on = checkboxes ? selection.grid.includes(m) : selection.metric === m;
            const selected = on && (checkboxes || tab === "mesures");
            const toneClass = band && band.tone !== "good" ? `tone-${band.tone}` : "";
            return (
              <li key={m} className={`sb-item${m === "snd" && !device.sound_calibration ? " has-cal" : ""}`}>
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
                {/* Raw sound has no zones until the board is calibrated (Réglages). */}
                {m === "snd" && !device.sound_calibration && <a className="sb-cal" href="#/reglages">{t().shell.calibrate}</a>}
              </li>
            );
          })}
        </ul>
      )}

      <nav className="sb-nav" aria-label={t().shell.mainNav}>
        {device && TAB_ORDER.map((tb) => (
          <a key={tb} href={`#/${tb}`} aria-current={tb === tab ? "page" : undefined}>
            {tb === tab && <span aria-hidden>▸ </span>}{tabLabel(tb)}
            {tb === "alertes" && alerts > 0 && (
              <span className="tone-bad sb-count"> {alerts}<span className="sr-only">{t().shell.openAlerts}</span></span>
            )}
            {tb === "carte" && pending > 0 && (
              <span className="tone-warn sb-count"> {pending}<span className="sr-only">{t().shell.pending}</span></span>
            )}
          </a>
        ))}
        <SessionTools onLogout={onLogout} />
      </nav>
    </aside>
  );
}

// Language and theme toggles and logout; shared by the column and the first-run screen.
export function SessionTools({ onLogout }: { onLogout: () => void }) {
  // The attribute set before first paint is the truth, even when storage is blocked.
  const [theme, setTheme] = useState<Theme>(() => {
    const t = document.documentElement.dataset.theme;
    return t === "light" || t === "dark" ? t : readTheme();
  });
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <div className="sb-tools">
      <LangToggle />
      <span aria-hidden className="muted">·</span>
      <button type="button" className="sb-link" aria-label={t().session.toTheme(nextTheme === "light")}
              onClick={() => { applyTheme(nextTheme); setTheme(nextTheme); }}>
        ◐ {t().session.theme(nextTheme === "light")}
      </button>
      <span aria-hidden className="muted">·</span>
      <button type="button" className="sb-link" onClick={onLogout}>{t().session.logout}</button>
    </div>
  );
}
