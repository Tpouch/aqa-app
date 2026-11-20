import { SessionTools } from "../components/Sidebar";
import type { DeviceSummary } from "../../../server/src/types";
import { ago, duration } from "../util";

// Board state, read only: commands, updates and settings stay on the desktop.
export function InfoPage({ device, now, onLogout }: { device: DeviceSummary; now: number; onLogout: () => void }) {
  const st = device.status;
  const rows: [string, React.ReactNode][] = [
    ["état", device.online
      ? <span className="tone-good"><span aria-hidden>● </span>en ligne</span>
      : <span><span aria-hidden>○ </span>hors ligne</span>],
    ["dernier contact", device.last_seen !== null ? ago(device.last_seen, now) : "jamais"],
    ["dernière mesure", device.latest ? ago(device.latest.ts, now) : "aucune"],
  ];
  if (st) {
    const sensors: [string, boolean][] = [
      ["température", st.sensors.temperature],
      [st.sensors.co2 ? `CO₂ (${st.sensors.co2})` : "CO₂", st.sensors.co2 !== null],
      ["particules", st.sensors.pm],
      ["son", st.sensors.sound],
    ];
    const missing = sensors.filter(([, ok]) => !ok).map(([n]) => n);
    rows.push(
      ["Wi-Fi", `${st.ssid} · ${st.rssi} dBm`],
      ["allumée depuis", duration(st.uptime_s)],
      ["firmware", st.firmware_version],
      ["capteurs", missing.length === 0
        ? `${sensors.length} / ${sensors.length} ok`
        : <span className="tone-warn">absents : {missing.join(", ")}</span>],
    );
  }
  rows.push(
    ["son", device.sound_calibration ? "calibré" : "non calibré"],
    ["identifiant", <span className="mb-id">{device.id}</span>],
  );

  return (
    <div className="mb-info">
      <dl className="mb-rows">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="muted">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {!st && <p className="muted small mb-note">État détaillé pas encore reçu de la carte.</p>}
      <p className="muted small mb-note">Lecture seule. Commandes, mises à jour et réglages : sur la version ordinateur.</p>
      <div className="mb-session"><SessionTools onLogout={onLogout} /></div>
    </div>
  );
}
