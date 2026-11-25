import { useState } from "react";
import { api } from "../../api";
import { Button, Skeleton, useConfirm, useToast } from "../../components/ui";
import type { CommandRow, DeviceSummary, EventRow } from "../../../../server/src/types";
import { firmwareFor } from "../../firmware";
import { ago, dateTime, duration, usePoll } from "../../util";
import type { Send } from "../device/DevicePage";
import { t } from "../../i18n/dict";
import { commandLabel, commandState } from "../../i18n/vocab";
import { neverSeen, waiting } from "../../rooms";
import { getLang } from "../../i18n/lang";

interface Props {
  id: string;
  device: DeviceSummary | null;
  commands: CommandRow[] | undefined;
  commandsError: string | null;
  reload: () => void;
  send: Send;
  now: number;
}

export function CardPage({ id, device, commands, commandsError, reload, send, now }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const journal = usePoll(() => api.events(id, 300), 5000, [id]);
  const firmware = usePoll(api.firmware, 60000, []);
  const [otaVersion, setOtaVersion] = useState("");
  const name = device?.name ?? id;
  const allImages = firmware.data?.firmware ?? [];
  const images = firmwareFor(allImages, id);
  const others = allImages.length - images.length;

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
              ? <span className="tone-good"><span aria-hidden>●</span> {t().card.online}</span>
              : <span><span aria-hidden>○</span> {neverSeen(device) ? waiting() : t().rooms.offline}</span>}
              {device.last_seen !== null && t().card.contact(ago(device.last_seen, now))}</>}
          </p>
        </div>
        <Button onClick={() => run("status", () => send("status"))} disabled={busy !== null} loading={busy === "status"}
                title={t().card.refreshTitle}>
          <span aria-hidden>↻</span> {t().card.refresh}
        </Button>
      </header>

      {!device ? <Skeleton height={120} /> : <StatusBlocks device={device} />}

      <div className="cp-cols">
        <div className="cp-left">
          <h3 className="label-caps">{t().card.actions}</h3>
          <ul className="cp-actions">
            <li>
              <button type="button" className="cp-row" disabled={busy !== null} aria-busy={busy === "restart"}
                      onClick={() => run("restart", async () => {
                        if (await confirm({ title: t().card.restartTitle, body: t().card.restartBody(name), confirmLabel: t().card.restart })) await send("restart");
                      })}>
                <span>{t().card.restart}</span><span aria-hidden className="muted">→</span>
              </button>
              <p className="muted small">{t().card.restartNote}</p>
            </li>
            <li>
              <form className="cp-ota" onSubmit={async (e) => {
                e.preventDefault();
                await run("ota", async () => {
                  if (await confirm({
                    title: t().card.installTitle(otaVersion),
                    body: t().card.installBody(name),
                    confirmLabel: t().card.install,
                  }) && await send("ota", { version: otaVersion })) setOtaVersion("");
                });
              }}>
                <label htmlFor="cp-ota-select">{t().card.update}</label>
                <select id="cp-ota-select" className="input" value={otaVersion} onChange={(e) => setOtaVersion(e.target.value)} disabled={!images.length}>
                  <option value="">{images.length ? t().card.pickVersion
                    : firmware.error && !firmware.data ? t().card.firmwareListDown : t().card.noFirmware}</option>
                  {images.map((f) => <option key={f.version} value={f.version}>{f.version}</option>)}
                </select>
                <Button type="submit" variant="primary" disabled={!otaVersion || busy !== null} loading={busy === "ota"}>{t().card.install}</Button>
                {others > 0 && (
                  <p className="muted small cp-ota-others">
                    {t().card.otherImages(others)}
                    {t().card.see}<a href="#/reglages">{t().card.settings}</a>).
                  </p>
                )}
              </form>
            </li>
            <li>
              <button type="button" className="cp-row bad" disabled={busy !== null} aria-busy={busy === "rollback"}
                      onClick={() => run("rollback", async () => {
                        if (await confirm({ title: t().card.rollbackTitle, body: t().card.rollbackBody, confirmLabel: t().card.rollbackConfirm, danger: true })) await send("rollback");
                      })}>
                <span>{t().card.rollback}</span><span aria-hidden>→</span>
              </button>
              <p className="muted small">{t().card.rollbackNote}</p>
            </li>
          </ul>
          <p className="muted small cp-note">
            {t().card.commandsNote}<a href="#/reglages">{t().card.settings}</a>.
          </p>

          <h3 className="label-caps cp-sub">{t().card.inProgress}{active.length > 0 && ` (${active.length})`}</h3>
          {!commands && commandsError ? <LoadError message={commandsError} /> : !commands ? <Skeleton height={60} /> : active.length === 0 ? <p className="muted small">{t().card.noPending}</p> : (
            <ul className="cp-active">
              {active.map((c) => {
                const st = commandState(c.state);
                const pct = c.state === "in_progress" ? c.progress : 0;
                return (
                  <li key={c.id}>
                    <div className="cp-active-top">
                      <span>{commandLabel(c.type)}{c.type === "ota" && ` ${String(c.params.version)}`}</span>
                      {c.state === "in_progress" && c.progress > 0 && <span className="tone-warn">{c.progress} %</span>}
                    </div>
                    {c.state === "in_progress" && c.progress > 0 && (
                      <div className="cp-bar" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t().card.progress}>
                        <div style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="cp-active-sub muted">
                      <span className={st.tone ? `tone-${st.tone}` : undefined}>{st.label}</span>
                      <span>{t().card.created(ago(c.created_at, now))}{c.detail && ` · ${c.detail}`}</span>
                      {c.state === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => api.cancelCommand(id, c.id).then(
                          () => { toast("good", t().card.cancelled); reload(); },
                          (e: Error) => toast("bad", e.message))}>{t().card.cancel}</Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Journal events={journal.data?.events} error={journal.error} now={now} />
      </div>
    </div>
  );
}

// A list that never loaded: say so rather than leave a skeleton forever.
function LoadError({ message }: { message: string }) {
  return <p className="small tone-warn" role="alert"><span aria-hidden>▲</span> {t().card.loadFailed(message)}</p>;
}

function StatusBlocks({ device: d }: { device: DeviceSummary }) {
  const s = d.status;
  if (!s && neverSeen(d)) {
    return (
      <div className="cp-empty small">
        <p>{t().card.neverContacted}</p>
        <ol className="steps muted">
          {getLang() === "en" ? <>
            <li>Put its token into <code>DEVICE_TOKEN</code> in the firmware's <code>.env</code>.</li>
            <li>Rebuild and flash the board (<code>pio run -t upload</code>, or the TUI).</li>
            <li>The first readings arrive in less than a minute.</li>
          </> : <>
            <li>Mets son jeton dans <code>DEVICE_TOKEN</code> du <code>.env</code> du firmware.</li>
            <li>Recompile et flashe la carte (<code>pio run -t upload</code>, ou le TUI).</li>
            <li>Les premières mesures arrivent en moins d'une minute.</li>
          </>}
        </ol>
        <p className="muted">{t().card.lostToken}<a href="#/reglages">{t().card.settings}</a>{t().card.newToken}</p>
      </div>
    );
  }
  const w = t().card;
  if (!s) return <p className="muted small cp-empty">{w.noStatus}</p>;
  const signal = s.rssi < -80 ? [w.signal.weak, "tone-warn"] : s.rssi < -70 ? [w.signal.medium, "muted"] : [w.signal.good, "tone-good"];
  const sensors: [boolean, string][] = [
    [s.sensors.temperature, w.tempHum], [s.sensors.co2 !== null, s.sensors.co2 ?? "CO₂"],
    [s.sensors.pm, "PM2.5"], [s.sensors.sound, w.sound],
  ];
  return (
    <>
      <dl className="ms-stats cp-stats">
        <div><dt className="label-caps">Firmware</dt><dd className="ms-stat-value">v{s.firmware_version}</dd><dd className="ms-stat-sub">{w.hardware(s.hardware_version)}</dd></div>
        <div><dt className="label-caps">{w.upSince}</dt><dd className="ms-stat-value">{duration(s.uptime_s)}</dd><dd className="ms-stat-sub">{w.bootN(s.boot_count)}</dd></div>
        <div><dt className="label-caps">Wi-Fi</dt><dd className="ms-stat-value">{s.rssi} dBm <span className={`ms-stat-sub ${signal[1]}`}>{signal[0]}</span></dd><dd className="ms-stat-sub">{s.ssid} · {s.ip}</dd></div>
        <div><dt className="label-caps">{w.queue}</dt>
          <dd className="ms-stat-value">{w.nReadings(s.queue.pending)}</dd>
          <dd className="ms-stat-sub"><span className={s.queue.dropped > 0 ? "tone-warn" : undefined}>{w.nLost(s.queue.dropped)}</span> · {w.kbFree(Math.round(s.free_heap / 1024))}</dd></div>
      </dl>
      <div className="cp-sensors">
        <span className="label-caps">{w.sensors}</span>
        {sensors.map(([ok, label]) => (
          <span key={label} title={ok ? w.detectedAtBoot : w.notDetected}>
            <span className={ok ? "tone-good" : "tone-bad"} aria-hidden>{ok ? "✓" : "✗"}</span>
            <span className="sr-only">{ok ? w.detectedSr : w.notDetectedSr}</span> {label}
          </span>
        ))}
        <span className="muted cp-pos">{w.position(s.geohash)}</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- journal

const FILTERS = [
  { key: "all", get label() { return t().card.filterAll; } },
  { key: "commands", get label() { return t().card.filterCommands; } },
  { key: "problems", get label() { return t().card.filterProblems; } },
] as const;

const LEVEL: Record<EventRow["level"], { tone: string; label: string; glyph: string }> = {
  info: { tone: "muted", get label() { return t().card.levelInfo; }, glyph: "●" },
  warn: { tone: "tone-warn", get label() { return t().card.levelWarn; }, glyph: "▲" },
  error: { tone: "tone-bad", get label() { return t().card.levelError; }, glyph: "✗" },
};

function Journal({ events, error, now }: { events: EventRow[] | undefined; error: string | null; now: number }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const shown = (events ?? []).filter((e) =>
    filter === "all" ? true : filter === "commands" ? e.kind === "command" : e.level !== "info");

  return (
    <section className="cp-journal" aria-labelledby="journal-title">
      <div className="cp-journal-head">
        <h3 id="journal-title" className="label-caps">{t().card.journal}</h3>
        <div className="seg" role="group" aria-label={t().card.filterJournal}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>
      <p className="muted small">{t().card.journalNote}</p>
      {!events && error ? <LoadError message={error} /> : !events ? <Skeleton height={200} /> : shown.length === 0 ? (
        <p className="muted small">{filter === "problems" ? t().card.noProblems : t().card.nothingYet}</p>
      ) : (
        <table className="cp-log">
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="muted"><time dateTime={new Date(e.ts * 1000).toISOString()} title={dateTime(e.ts)}>{dateTime(e.ts)}</time><br /><span className="cp-ago">{ago(e.ts, now)}</span></td>
                <td className={LEVEL[e.level].tone}><span aria-hidden>{LEVEL[e.level].glyph}</span><span className="sr-only">{LEVEL[e.level].label}</span></td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
