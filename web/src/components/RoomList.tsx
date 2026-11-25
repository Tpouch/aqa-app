import type { DeviceSummary } from "../../../server/src/types";
import { roomState } from "../rooms";
import { t } from "../i18n/dict";

// Every board, one line each: name, worst zone now, open alerts. Picking one shows it.
export function RoomList({ devices, current, onPick }: {
  devices: DeviceSummary[];
  current: string;
  onPick: (id: string) => void;
}) {
  return (
    <ul className="rooms" aria-label={t().shell.rooms}>
      {devices.map((d) => {
        const st = roomState(d);
        const shown = d.id === current;
        return (
          <li key={d.id}>
            <button type="button" className="room" aria-current={shown ? "true" : undefined} onClick={() => onPick(d.id)}>
              <span className="room-name">
                <span aria-hidden className="room-mark">{shown ? "▸" : ""}</span>
                {d.name}
              </span>
              <span className="room-state">
                <span className={st.tone === "off" ? "muted" : `tone-${st.tone}`}>{st.word}</span>
                {d.open_alerts > 0 && (
                  <span className="tone-bad room-alerts">
                    <span aria-hidden> ▲ {d.open_alerts}</span>
                    <span className="sr-only">{t().shell.roomAlerts(d.open_alerts)}</span>
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
