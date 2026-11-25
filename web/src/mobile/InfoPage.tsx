import { SessionTools } from "../components/Sidebar";
import type { DeviceSummary } from "../../../server/src/types";
import { ago, duration } from "../util";
import { t } from "../i18n/dict";

// Board state, read only: commands, updates and settings stay on the desktop.
export function InfoPage({ device, now, onLogout }: { device: DeviceSummary; now: number; onLogout: () => void }) {
  const st = device.status;
  const w = t().mobile;
  const rows: [string, React.ReactNode][] = [
    [w.state, device.online
      ? <span className="tone-good"><span aria-hidden>● </span>{w.online}</span>
      : <span><span aria-hidden>○ </span>{w.offline}</span>],
    [w.lastContact, device.last_seen !== null ? ago(device.last_seen, now) : w.never],
    [w.lastReading, device.latest ? ago(device.latest.ts, now) : w.none],
  ];
  if (st) {
    const sensors: [string, boolean][] = [
      [w.temperature, st.sensors.temperature],
      [st.sensors.co2 ? `CO₂ (${st.sensors.co2})` : "CO₂", st.sensors.co2 !== null],
      [w.particles, st.sensors.pm],
      [w.sound, st.sensors.sound],
    ];
    const missing = sensors.filter(([, ok]) => !ok).map(([n]) => n);
    rows.push(
      ["Wi-Fi", `${st.ssid} · ${st.rssi} dBm`],
      [w.upSince, duration(st.uptime_s)],
      [w.firmware, st.firmware_version],
      [w.sensors, missing.length === 0
        ? `${sensors.length} / ${sensors.length} ok`
        : <span className="tone-warn">{w.missing(missing.join(", "))}</span>],
    );
  }
  rows.push(
    [w.sound, device.sound_calibration ? w.calibrated : w.notCalibrated],
    [w.id, <span className="mb-id">{device.id}</span>],
  );

  return (
    <div className="mb-info">
      <dl className="mb-rows">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="muted">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {!st && <p className="muted small mb-note">{w.noStatus}</p>}
      <p className="muted small mb-note">{w.readOnly}</p>
      <div className="mb-session"><SessionTools onLogout={onLogout} /></div>
    </div>
  );
}
