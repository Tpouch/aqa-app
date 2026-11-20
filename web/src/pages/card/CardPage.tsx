import { useState } from "react";
import { api } from "../../api";
import { Button, Skeleton, useConfirm, useToast } from "../../components/ui";
import type { CommandRow, DeviceSummary, EventRow } from "../../../../server/src/types";
import { ago, dateTime, duration, usePoll } from "../../util";
import type { Send } from "../device/DevicePage";
import { COMMAND_LABEL, COMMAND_STATE } from "../device/shared";

interface Props {
  id: string;
  device: DeviceSummary | null;
  commands: CommandRow[] | undefined;
  reload: () => void;
  send: Send;
  now: number;
}

export function CardPage({ id, device, commands, reload, send, now }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const journal = usePoll(() => api.events(id, 300), 5000, [id]);
  const firmware = usePoll(api.firmware, 60000, []);
  const [otaVersion, setOtaVersion] = useState("");
  const name = device?.name ?? id;

  const run = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  const active = (commands ?? []).filter((c) => c.state !== "completed" && c.state !== "failed");

  return (
    <div className="cp">
      <header className="cp-head">
        <div className="cp-title">
          <h2>{name}</h2>
          <p className="muted">
            {id}
            {device && <> · {device.online
              ? <span className="tone-good"><span aria-hidden>●</span> en ligne</span>
              : <span><span aria-hidden>●</span> hors ligne</span>}
              {device.last_seen !== null && <>, contact {ago(device.last_seen, now)}</>}</>}
          </p>
        </div>
        <Button onClick={() => run("status", () => send("status"))} disabled={busy !== null} loading={busy === "status"}
                title="La carte renvoie son état (Wi-Fi, capteurs, mémoire).">
          <span aria-hidden>↻</span> actualiser l'état
        </Button>
      </header>

      {!device ? <Skeleton height={120} /> : <StatusBlocks device={device} />}

      <div className="cp-cols">
        <div className="cp-left">
          <h3 className="label-caps">Actions</h3>
          <ul className="cp-actions">
            <li>
              <button type="button" className="cp-row" disabled={busy !== null} aria-busy={busy === "restart"}
                      onClick={() => run("restart", async () => {
                        if (await confirm({ title: "Redémarrer la carte ?", body: `${name} sera indisponible une dizaine de secondes. Les mesures en attente sont conservées.`, confirmLabel: "Redémarrer" })) await send("restart");
                      })}>
                <span>Redémarrer</span><span aria-hidden className="muted">→</span>
              </button>
              <p className="muted small">Indisponible ~10 s, les mesures en attente sont gardées.</p>
            </li>
            <li>
              <form className="cp-ota" onSubmit={async (e) => {
                e.preventDefault();
                await run("ota", async () => {
                  if (await confirm({
                    title: `Installer la version ${otaVersion} ?`,
                    body: "L'image doit avoir été compilée avec le .env de cette carte (Wi-Fi et jeton). La carte vérifie la signature avant de l'activer, puis redémarre.",
                    confirmLabel: "Installer",
                  }) && await send("ota", { version: otaVersion })) setOtaVersion("");
                });
              }}>
                <label htmlFor="cp-ota-select">Mettre à jour</label>
                <select id="cp-ota-select" className="input" value={otaVersion} onChange={(e) => setOtaVersion(e.target.value)} disabled={!firmware.data?.firmware.length}>
                  <option value="">{firmware.data?.firmware.length ? "Choisir une version…" : "Aucun firmware envoyé"}</option>
                  {firmware.data?.firmware.map((f) => <option key={f.version} value={f.version}>{f.version}</option>)}
                </select>
                <Button type="submit" variant="primary" disabled={!otaVersion || busy !== null} loading={busy === "ota"}>Installer</Button>
              </form>
            </li>
            <li>
              <button type="button" className="cp-row bad" disabled={busy !== null} aria-busy={busy === "rollback"}
                      onClick={() => run("rollback", async () => {
                        if (await confirm({ title: "Revenir au firmware précédent ?", body: "La carte redémarre sur l'image installée avant la dernière mise à jour, si elle est encore valide.", confirmLabel: "Revenir en arrière", danger: true })) await send("rollback");
                      })}>
                <span>Revenir au firmware précédent</span><span aria-hidden>→</span>
              </button>
              <p className="muted small">Revient à l'image d'avant la dernière mise à jour.</p>
            </li>
          </ul>
          <p className="muted small cp-note">
            Les commandes partent avec la prochaine réponse du serveur (≤ 15 s si la carte est en ligne).
            Wi-Fi, position et paramètres sont dans <a href="#/reglages">Réglages</a>.
          </p>

          <h3 className="label-caps cp-sub">En cours{active.length > 0 && ` (${active.length})`}</h3>
          {!commands ? <Skeleton height={60} /> : active.length === 0 ? <p className="muted small">Aucune commande en attente.</p> : (
            <ul className="cp-active">
              {active.map((c) => {
                const st = COMMAND_STATE[c.state];
                const pct = c.state === "in_progress" ? c.progress : 0;
                return (
                  <li key={c.id}>
                    <div className="cp-active-top">
                      <span>{COMMAND_LABEL[c.type]}{c.type === "ota" && ` ${String(c.params.version)}`}</span>
                      {c.state === "in_progress" && c.progress > 0 && <span className="tone-warn">{c.progress} %</span>}
                    </div>
                    {c.state === "in_progress" && c.progress > 0 && (
                      <div className="cp-bar" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progression">
                        <div style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="cp-active-sub muted">
                      <span className={st.tone ? `tone-${st.tone}` : undefined}>{st.label}</span>
                      <span>créée {ago(c.created_at, now)}{c.detail && ` · ${c.detail}`}</span>
                      {c.state === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => api.cancelCommand(id, c.id).then(
                          () => { toast("good", "Commande annulée."); reload(); },
                          (e: Error) => toast("bad", e.message))}>annuler</Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Journal events={journal.data?.events} now={now} />
      </div>
    </div>
  );
}

function StatusBlocks({ device: d }: { device: DeviceSummary }) {
  const s = d.status;
  if (!s) return <p className="muted small cp-empty">Aucun rapport d'état reçu. La carte en envoie un au démarrage puis chaque minute.</p>;
  const signal = s.rssi < -80 ? ["faible", "tone-warn"] : s.rssi < -70 ? ["moyen", "muted"] : ["bon", "tone-good"];
  const sensors: [boolean, string][] = [
    [s.sensors.temperature, "Temp./hum."], [s.sensors.co2 !== null, s.sensors.co2 ?? "CO₂"],
    [s.sensors.pm, "PM2.5"], [s.sensors.sound, "Son"],
  ];
  return (
    <>
      <dl className="ms-stats cp-stats">
        <div><dt className="label-caps">Firmware</dt><dd className="ms-stat-value">v{s.firmware_version}</dd><dd className="ms-stat-sub">matériel {s.hardware_version}</dd></div>
        <div><dt className="label-caps">Allumée depuis</dt><dd className="ms-stat-value">{duration(s.uptime_s)}</dd><dd className="ms-stat-sub">démarrage n°{s.boot_count}</dd></div>
        <div><dt className="label-caps">Wi-Fi</dt><dd className="ms-stat-value">{s.rssi} dBm <span className={`ms-stat-sub ${signal[1]}`}>{signal[0]}</span></dd><dd className="ms-stat-sub">{s.ssid} · {s.ip}</dd></div>
        <div><dt className="label-caps">File d'attente</dt>
          <dd className="ms-stat-value">{s.queue.pending} mesure{s.queue.pending > 1 ? "s" : ""}</dd>
          <dd className="ms-stat-sub"><span className={s.queue.dropped > 0 ? "tone-warn" : undefined}>{s.queue.dropped} perdue{s.queue.dropped > 1 ? "s" : ""}</span> · {Math.round(s.free_heap / 1024)} Ko libres</dd></div>
      </dl>
      <div className="cp-sensors">
        <span className="label-caps">Capteurs</span>
        {sensors.map(([ok, label]) => (
          <span key={label} title={ok ? "détecté au démarrage" : "non détecté"}>
            <span className={ok ? "tone-good" : "tone-bad"} aria-hidden>{ok ? "✓" : "✗"}</span>
            <span className="sr-only">{ok ? "détecté : " : "non détecté : "}</span> {label}
          </span>
        ))}
        <span className="muted cp-pos">position {s.geohash}</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- journal

const FILTERS = [
  { key: "all", label: "tout" },
  { key: "commands", label: "commandes" },
  { key: "problems", label: "problèmes" },
] as const;

const LEVEL: Record<EventRow["level"], { tone: string; label: string }> = {
  info: { tone: "muted", label: "info" }, warn: { tone: "tone-warn", label: "avertissement" }, error: { tone: "tone-bad", label: "erreur" },
};

function Journal({ events, now }: { events: EventRow[] | undefined; now: number }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const shown = (events ?? []).filter((e) =>
    filter === "all" ? true : filter === "commands" ? e.kind === "command" : e.level !== "info");

  return (
    <section className="cp-journal" aria-labelledby="journal-title">
      <div className="cp-journal-head">
        <h3 id="journal-title" className="label-caps">Journal</h3>
        <div className="seg" role="group" aria-label="Filtrer le journal">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>
      <p className="muted small">Déduit par le serveur de ce que la carte envoie : démarrages, coupures, capteurs, commandes.</p>
      {!events ? <Skeleton height={200} /> : shown.length === 0 ? (
        <p className="muted small">{filter === "problems" ? "Aucun problème enregistré." : "Rien pour l'instant."}</p>
      ) : (
        <table className="cp-log" aria-live="polite">
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="muted"><time dateTime={new Date(e.ts * 1000).toISOString()} title={dateTime(e.ts)}>{ago(e.ts, now)}</time></td>
                <td className={LEVEL[e.level].tone}><span aria-hidden>●</span><span className="sr-only">{LEVEL[e.level].label}</span></td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
