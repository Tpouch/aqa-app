import { api } from "../api";
import { METRICS } from "../../../server/src/types";
import { ago, fmt, go, level, METRIC_INFO, usePoll } from "../util";

export function Dashboard() {
  const { data, error } = usePoll(api.devices, 15000, []);

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Chargement…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Capteurs</h1>
        <span className="muted">{data.devices.filter((d) => d.online).length} / {data.devices.length} en ligne</span>
      </div>

      {data.unknown.length > 0 && (
        <div className="notice">
          <strong>{data.unknown.length} carte(s) non enregistrée(s)</strong> essaie(nt) d'envoyer des données :{" "}
          {data.unknown.map((u) => <code key={u.id}>{u.id}</code>)}.{" "}
          <a href="#/manage">Les ajouter</a>
        </div>
      )}

      {data.devices.length === 0 ? (
        <div className="card empty">
          <h2>Aucun capteur</h2>
          <p className="muted">Ajoute ta carte dans <a href="#/manage">Gestion</a> avec son identifiant
            (<code>aqa-…</code>, affiché au démarrage dans le log série), puis copie le jeton dans son <code>.env</code>.</p>
        </div>
      ) : (
        <div className="grid">
          {data.devices.map((d) => (
            <button key={d.id} className="card device-card" onClick={() => go(`/device/${d.id}`)}>
              <header>
                <div>
                  <h2>{d.name}</h2>
                  <code className="muted">{d.id}</code>
                </div>
                <span className={`pill ${d.online ? "online" : "offline"}`}>{d.online ? "en ligne" : "hors ligne"}</span>
              </header>
              <dl className="values">
                {METRICS.map((m) => {
                  const v = d.latest?.[m] ?? null;
                  return (
                    <div key={m} className={`value ${level(m, v) ?? ""}`}>
                      <dt>{METRIC_INFO[m].label}</dt>
                      <dd>{fmt(v, METRIC_INFO[m].decimals)} <small>{METRIC_INFO[m].unit}</small></dd>
                    </div>
                  );
                })}
              </dl>
              <footer className="muted">
                Vu {ago(d.last_seen)}
                {d.status && <> · fw {d.status.firmware_version} · {d.status.rssi} dBm</>}
                {d.latest?.stale && <> · <span className="warn-text">valeurs figées</span></>}
              </footer>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
