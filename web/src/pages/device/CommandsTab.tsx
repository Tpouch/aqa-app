import {
  ArrowClockwiseIcon, ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, CloudArrowDownIcon, HourglassIcon,
  InfoIcon, LightningIcon, ListBulletsIcon, PowerIcon, PulseIcon, TerminalWindowIcon, WarningCircleIcon,
  WarningIcon, WifiHighIcon, XCircleIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { api } from "../../api";
import { Badge, Button, Skeleton, useConfirm, useToast } from "../../components/ui";
import type { CommandRow, DeviceSummary, EventKind, EventRow } from "../../../../server/src/types";
import { ago, dateTime, usePoll } from "../../util";
import type { Send } from "./DevicePage";
import { COMMAND_ICON, COMMAND_LABEL, COMMAND_STATE } from "./shared";

interface Props {
  id: string;
  device: DeviceSummary | null;
  commands: CommandRow[] | undefined;
  reload: () => void;
  send: Send;
  now: number;
}

export function CommandsTab({ id, device, commands, reload, send, now }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const journal = usePoll(() => api.events(id, 300), 5000, [id]);
  const firmware = usePoll(api.firmware, 60000, []);
  const [otaVersion, setOtaVersion] = useState("");
  const name = device?.name ?? id;

  const run = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };
  const active = (commands ?? []).filter((c) => c.state !== "completed" && c.state !== "failed");

  const actions: { key: string; label: string; help: string; icon: ReactNode; onClick: () => Promise<unknown> }[] = [
    {
      key: "status", label: "Actualiser l'état", help: "La carte renvoie son état (Wi-Fi, capteurs, mémoire).",
      icon: <ArrowsClockwiseIcon size={22} aria-hidden />, onClick: () => send("status"),
    },
    {
      key: "restart", label: "Redémarrer", help: "Indisponible ~10 s, les mesures en attente sont gardées.",
      icon: <ArrowClockwiseIcon size={22} aria-hidden />,
      onClick: async () => {
        if (await confirm({ title: "Redémarrer la carte ?", body: `${name} sera indisponible une dizaine de secondes. Les mesures en attente sont conservées.`, confirmLabel: "Redémarrer" })) await send("restart");
      },
    },
    {
      key: "rollback", label: "Firmware précédent", help: "Revient à l'image d'avant la dernière mise à jour.",
      icon: <ArrowCounterClockwiseIcon size={22} aria-hidden />,
      onClick: async () => {
        if (await confirm({ title: "Revenir au firmware précédent ?", body: "La carte redémarre sur l'image installée avant la dernière mise à jour, si elle est encore valide.", confirmLabel: "Revenir en arrière", danger: true })) await send("rollback");
      },
    },
  ];

  return (
    <div className="device-layout">
      <div className="stack-lg">
        <section className="card" aria-labelledby="actions-title">
          <div className="card-head"><h2 id="actions-title"><LightningIcon size={18} aria-hidden />Actions</h2></div>
          <div className="card-body">
            <div className="action-list">
              {actions.map((a) => (
                <button key={a.key} type="button" className="action-row" onClick={() => run(a.key, a.onClick)} disabled={busy !== null} aria-busy={busy === a.key}>
                  <span className="ar-icon">{a.icon}</span>
                  <span className="ar-text"><strong>{a.label}</strong><span>{a.help}</span></span>
                </button>
              ))}
            </div>
            <form className="row" style={{ marginTop: "1rem" }} onSubmit={async (e) => {
              e.preventDefault();
              await run("ota", async () => {
                if (await confirm({
                  title: `Installer la version ${otaVersion} ?`,
                  body: "L'image doit avoir été compilée avec le .env de cette carte (Wi-Fi et jeton). La carte vérifie la signature avant de l'activer, puis redémarre.",
                  confirmLabel: "Installer",
                }) && await send("ota", { version: otaVersion })) setOtaVersion("");
              });
            }}>
              <label className="field">
                <span><CloudArrowDownIcon size={14} aria-hidden /> Mise à jour du firmware</span>
                <select className="input" value={otaVersion} onChange={(e) => setOtaVersion(e.target.value)} disabled={!firmware.data?.firmware.length}>
                  <option value="">{firmware.data?.firmware.length ? "Choisir une version…" : "Aucun firmware envoyé"}</option>
                  {firmware.data?.firmware.map((f) => <option key={f.version} value={f.version}>{f.version}</option>)}
                </select>
              </label>
              <Button type="submit" disabled={!otaVersion} loading={busy === "ota"}>Installer</Button>
            </form>
            <p className="muted small" style={{ marginTop: "0.75rem" }}>
              Les commandes partent avec la prochaine réponse du serveur (≤ 15 s si la carte est en ligne).
              Wi-Fi, position et paramètres sont dans <a href="#/options">Options</a>.
            </p>
          </div>
        </section>

        <section className="card" aria-labelledby="active-title">
          <div className="card-head"><h2 id="active-title"><HourglassIcon size={18} aria-hidden />En cours {active.length > 0 && <Badge tone="warn">{active.length}</Badge>}</h2></div>
          <div className="card-body">
            {!commands ? <Skeleton height={60} /> : active.length === 0 ? <p className="muted small">Aucune commande en attente.</p> : (
              <ul className="timeline">
                {active.map((c) => {
                  const st = COMMAND_STATE[c.state];
                  return (
                    <li key={c.id}>
                      <span className={`t-icon ${st.tone ?? ""}`}>{COMMAND_ICON[c.type]}</span>
                      <div className="t-main">
                        <strong>{COMMAND_LABEL[c.type]}{c.type === "ota" && ` ${String(c.params.version)}`}</strong>
                        <span className="muted small">créée {ago(c.created_at, now)}{c.detail && ` · ${c.detail}`}</span>
                        {c.state === "in_progress" && c.progress > 0 && (
                          <div className="progress" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progression">
                            <div style={{ width: `${c.progress}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="t-side">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {c.state === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => api.cancelCommand(id, c.id).then(
                            () => { toast("good", "Commande annulée."); reload(); },
                            (e: Error) => toast("bad", e.message))}>Annuler</Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Journal events={journal.data?.events} now={now} />
    </div>
  );
}

// ---------------------------------------------------------------- journal

const FILTERS = [
  { key: "all", label: "Tout" },
  { key: "problems", label: "Problèmes" },
  { key: "commands", label: "Commandes" },
] as const;

const KIND_ICON: Record<EventKind, ReactNode> = {
  first_contact: <PulseIcon size={14} aria-hidden />,
  boot: <PowerIcon size={14} aria-hidden />,
  reconnect: <WifiHighIcon size={14} aria-hidden />,
  firmware: <CloudArrowDownIcon size={14} aria-hidden />,
  sensor_lost: <XCircleIcon size={14} aria-hidden />,
  sensor_found: <InfoIcon size={14} aria-hidden />,
  frames_dropped: <WarningIcon size={14} aria-hidden />,
  weak_signal: <WifiHighIcon size={14} aria-hidden />,
  command: <TerminalWindowIcon size={14} aria-hidden />,
};

const LEVEL_TONE: Record<EventRow["level"], "" | "warn" | "bad"> = { info: "", warn: "warn", error: "bad" };

function Journal({ events, now }: { events: EventRow[] | undefined; now: number }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const shown = (events ?? []).filter((e) =>
    filter === "all" ? true : filter === "commands" ? e.kind === "command" : e.level !== "info");

  return (
    <section className="card journal" aria-labelledby="journal-title">
      <div className="card-head">
        <h2 id="journal-title"><ListBulletsIcon size={18} aria-hidden />Journal</h2>
        <div className="segmented" role="group" aria-label="Filtrer le journal">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="card-body">
        <p className="muted small" style={{ marginBottom: "0.5rem" }}>
          <InfoIcon size={13} aria-hidden /> Déduit par le serveur de ce que la carte envoie : démarrages, coupures, capteurs, commandes.
        </p>
        {!events ? <Skeleton height={200} /> : shown.length === 0 ? (
          <p className="muted small">{filter === "problems" ? "Aucun problème enregistré." : "Rien pour l'instant."}</p>
        ) : (
          <ol className="timeline" aria-live="polite">
            {shown.map((e) => (
              <li key={e.id}>
                <span className={`t-icon ${LEVEL_TONE[e.level]}`}>{e.level === "error" ? <WarningCircleIcon size={14} aria-hidden /> : KIND_ICON[e.kind]}</span>
                <div className="t-main">
                  <span>{e.message}</span>
                  <time className="muted small" dateTime={new Date(e.ts * 1000).toISOString()} title={dateTime(e.ts)}>{ago(e.ts, now)} · {dateTime(e.ts)}</time>
                </div>
                <span />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
