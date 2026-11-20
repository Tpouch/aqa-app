import { useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { Chart } from "../components/Chart";
import { METRICS, type CommandRow, type CommandType, type DeviceSummary } from "../../../server/src/types";
import { ago, dateTime, duration, METRIC_INFO, nowS, usePoll } from "../util";

// Raw frames up to 24 h (5 760 points); averaged buckets beyond.
const RANGES = [
  { key: "6h", label: "6 h", seconds: 6 * 3600, step: 0 },
  { key: "24h", label: "24 h", seconds: 86400, step: 0 },
  { key: "7d", label: "7 jours", seconds: 7 * 86400, step: 900 },
  { key: "30d", label: "30 jours", seconds: 30 * 86400, step: 3600 },
] as const;

export function DevicePage({ id }: { id: string }) {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("24h");
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const device = usePoll(() => api.device(id), 15000, [id]);

  const series = usePoll(async () => {
    const to = nowS();
    const from = to - range.seconds;
    if (range.step === 0) {
      const { frames } = await api.frames(id, from, to);
      return { from, to, rows: frames };
    }
    const { buckets } = await api.aggregate(id, from, to, range.step);
    return { from, to, rows: buckets };
  }, 30000, [id, rangeKey]);

  const columns = useMemo(() => {
    const rows = series.data?.rows ?? [];
    // A missing stretch (board offline, sensor unplugged) must show as a hole,
    // not as a straight line: insert a null point after any jump longer than
    // three sampling periods.
    const period = range.step || 15;
    const xs: number[] = [];
    const ys = Object.fromEntries(METRICS.map((m) => [m, [] as (number | null)[]])) as
      Record<(typeof METRICS)[number], (number | null)[]>;
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      if (prev && r.ts - prev.ts > 3 * period) {
        xs.push(prev.ts + period);
        for (const m of METRICS) ys[m].push(null);
      }
      xs.push(r.ts);
      for (const m of METRICS) ys[m].push(r[m]);
    });
    return { xs, ...ys };
  }, [series.data, range.step]);

  if (device.error && !device.data) return <p className="error">{device.error}</p>;
  const d = device.data;
  if (!d) return <p className="muted">Chargement…</p>;
  const visible: [number, number] = series.data ? [series.data.from, series.data.to] : [nowS() - range.seconds, nowS()];

  return (
    <>
      <div className="page-head">
        <div>
          <a href="#/" className="muted back">← Capteurs</a>
          <h1>{d.name} <span className={`pill ${d.online ? "online" : "offline"}`}>{d.online ? "en ligne" : "hors ligne"}</span></h1>
          <code className="muted">{d.id}</code>
        </div>
        <div className="segmented" role="group" aria-label="Période">
          {RANGES.map((r) => (
            <button key={r.key} className={r.key === rangeKey ? "active" : ""} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="device-layout">
        <div className="charts">
          {range.step > 0 && <p className="muted small">Moyennes par tranche de {range.step / 60} min.</p>}
          {METRICS.map((m) => (
            <Chart key={m} title={METRIC_INFO[m].label} unit={METRIC_INFO[m].unit}
                   color={METRIC_INFO[m].color} decimals={METRIC_INFO[m].decimals}
                   xs={columns.xs} ys={columns[m]} range={visible} />
          ))}
        </div>
        <aside>
          <StatusCard device={d} />
          <Commands id={d.id} />
        </aside>
      </div>
    </>
  );
}

function StatusCard({ device: d }: { device: DeviceSummary }) {
  const s = d.status;
  return (
    <section className="card">
      <h2>État</h2>
      {!s ? <p className="muted">Pas encore de statut reçu.</p> : (
        <dl className="kv">
          <dt>Vu</dt><dd>{ago(d.last_seen)}</dd>
          <dt>Firmware</dt><dd>{s.firmware_version} (hw {s.hardware_version})</dd>
          <dt>Uptime</dt><dd>{duration(s.uptime_s)} · boot n°{s.boot_count}</dd>
          <dt>Wi-Fi</dt><dd>{s.ssid} · {s.rssi} dBm{s.rssi < -80 && <span className="warn-text"> (faible)</span>}</dd>
          <dt>IP</dt><dd>{s.ip}</dd>
          <dt>Geohash</dt><dd>{s.geohash}</dd>
          <dt>Capteurs</dt>
          <dd className="sensors">
            <Sensor ok={s.sensors.temperature} label="Temp/Hum" />
            <Sensor ok={s.sensors.co2 !== null} label={s.sensors.co2 ?? "CO₂"} />
            <Sensor ok={s.sensors.pm} label="PM" />
            <Sensor ok={s.sensors.sound} label="Son" />
          </dd>
          <dt>File</dt>
          <dd>{s.queue.pending} en attente{s.queue.dropped > 0 && <span className="warn-text"> · {s.queue.dropped} perdues</span>}</dd>
          <dt>RAM libre</dt><dd>{Math.round(s.free_heap / 1024)} Ko</dd>
          {Object.keys(s.parameters).length > 0 && <>
            <dt>Paramètres</dt><dd><code>{JSON.stringify(s.parameters)}</code></dd>
          </>}
        </dl>
      )}
    </section>
  );
}

const Sensor = ({ ok, label }: { ok: boolean; label: string }) =>
  <span className={`pill ${ok ? "online" : "offline"}`}>{label}</span>;

const STATE_LABEL: Record<CommandRow["state"], string> = {
  pending: "en attente", sent: "envoyée", in_progress: "en cours", completed: "terminée", failed: "échec",
};

function Commands({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geohash, setGeohash] = useState("");
  const [config, setConfig] = useState("");
  const [otaVersion, setOtaVersion] = useState("");
  const list = usePoll(() => api.commands(id), 4000, [id]);
  const firmware = usePoll(api.firmware, 60000, []);

  async function send(type: CommandType, params?: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendCommand(id, type, params);
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submitConfig(e: FormEvent) {
    e.preventDefault();
    try {
      const params = JSON.parse(config) as Record<string, unknown>;
      void send("config", params);
    } catch {
      setError("config : JSON invalide, ex. {\"seuil\": 1.5}");
    }
  }

  return (
    <section className="card">
      <h2>Commandes</h2>
      <p className="muted small">Livrées dans la prochaine réponse du serveur à la carte (≤ 15 s si elle envoie des mesures).</p>
      <div className="button-row">
        <button disabled={busy} onClick={() => send("status")}>Demander l'état</button>
        <button disabled={busy} onClick={() => send("restart", undefined, "Redémarrer la carte ?")}>Redémarrer</button>
        <button disabled={busy} onClick={() => send("rollback", undefined, "Revenir au firmware précédent ?")}>Rollback</button>
      </div>

      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void send("geohash", { geohash: geohash.trim().toLowerCase() }); }}>
        <input placeholder="geohash, ex. u09tv" value={geohash} onChange={(e) => setGeohash(e.target.value)} />
        <button disabled={busy || !geohash.trim()}>Déplacer</button>
      </form>

      <form className="inline-form" onSubmit={submitConfig}>
        <input placeholder='config JSON, ex. {"seuil": 1.5}' value={config} onChange={(e) => setConfig(e.target.value)} />
        <button disabled={busy || !config.trim()}>Envoyer</button>
      </form>

      <form className="inline-form" onSubmit={(e) => {
        e.preventDefault();
        void send("ota", { version: otaVersion }, `Installer le firmware ${otaVersion} ? L'image doit avoir été compilée avec le .env de CETTE carte.`);
      }}>
        <select value={otaVersion} onChange={(e) => setOtaVersion(e.target.value)}>
          <option value="">Mise à jour OTA…</option>
          {firmware.data?.firmware.map((f) => <option key={f.version} value={f.version}>{f.version}</option>)}
        </select>
        <button disabled={busy || !otaVersion}>Installer</button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="command-list">
        {list.data?.commands.map((c) => (
          <li key={c.id}>
            <div>
              <strong>{c.type}</strong>
              {c.type !== "ota" && Object.keys(c.params).length > 0 && <code> {JSON.stringify(c.params)}</code>}
              {c.type === "ota" && <code> {String(c.params.version)}</code>}
              <div className="muted small">{dateTime(c.created_at)}{c.detail && ` · ${c.detail}`}</div>
              {c.state === "in_progress" && c.progress > 0 && <progress max={100} value={c.progress} />}
            </div>
            <div className="command-state">
              <span className={`pill state-${c.state}`}>{STATE_LABEL[c.state]}</span>
              {c.state === "pending" && (
                <button className="link" onClick={() => api.cancelCommand(id, c.id).then(list.reload, (e: Error) => setError(e.message))}>annuler</button>
              )}
            </div>
          </li>
        ))}
        {list.data && list.data.commands.length === 0 && <li className="muted">Aucune commande.</li>}
      </ul>
    </section>
  );
}

