import { WarningIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Skeleton, useToast } from "../../components/ui";
import { ZoneChart } from "../../components/ZoneChart";
import { metricDef, toDisplay } from "../../metrics";
import { METRICS, type CommandRow, type CommandType, type DeviceSummary, type Metric } from "../../../../server/src/types";
import { TAB_LABEL, type Tab } from "../../routes";
import { useNow, usePoll } from "../../util";
import { CommandsTab } from "./CommandsTab";
import { OptionsTab } from "./OptionsTab";
import { Overview } from "./Overview";
import { COMMAND_LABEL, useCommands, useSeries } from "./shared";

export type Send = (type: CommandType, params?: Record<string, unknown>) => Promise<boolean>;

export function DevicePage({ id, tab, onPendingChange, onDeleted }: {
  id: string;
  tab: Tab;
  onPendingChange: (n: number) => void;
  onDeleted: () => void;
}) {
  const device = usePoll(() => api.device(id), 15000, [id]);
  const commands = useCommands(id);
  const toast = useToast();
  const now = useNow();

  const send: Send = useCallback(async (type, params) => {
    try {
      await api.sendCommand(id, type, params);
      toast("good", `${COMMAND_LABEL[type]} : envoyé. La carte le recevra à sa prochaine connexion.`);
      commands.reload();
      return true;
    } catch (err) {
      toast("bad", (err as Error).message);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, toast]);

  // Announce outcomes when a command reaches a final state, whatever the tab.
  const seen = useRef<Map<string, CommandRow["state"]> | null>(null);
  useEffect(() => {
    const list = commands.data?.commands;
    if (!list) return;
    onPendingChange(list.filter((c) => c.state !== "completed" && c.state !== "failed").length);
    const first = seen.current === null;
    seen.current ??= new Map();
    for (const c of list) {
      const before = seen.current.get(c.id);
      if (!first && before !== c.state) {
        if (c.state === "completed") toast("good", `${COMMAND_LABEL[c.type]} : terminé${c.detail ? ` (${c.detail})` : ""}.`);
        if (c.state === "failed") toast("bad", `${COMMAND_LABEL[c.type]} : échec${c.detail ? `. ${c.detail}` : ""}.`);
      }
      seen.current.set(c.id, c.state);
    }
  }, [commands.data, toast, onPendingChange]);

  if (device.error && !device.data) {
    return <p className="callout warn" role="alert"><WarningIcon size={18} aria-hidden />{device.error}</p>;
  }
  const d = device.data;

  // Temporary pages: they show the former content until the redesigned
  // Mesures, Carte and Réglages pages replace them.
  return (
    <div id={`panel-${tab}`} className="tab-panel">
      <h1 className="sr-only">{TAB_LABEL[tab]}</h1>
      {tab === "mesures" && <MesuresPage id={id} device={d} now={now} send={send} />}
      {tab === "carte" && <CartePage id={id} device={d} commands={commands} send={send} now={now} />}
      {tab === "reglages" && <ReglagesPage device={d} send={send} reloadDevice={device.reload} onDeleted={onDeleted} />}
    </div>
  );
}

function MesuresPage(props: Parameters<typeof Overview>[0]) {
  return (
    <>
      <ZonePreview id={props.id} device={props.device} />
      <Overview {...props} />
    </>
  );
}

// Temporary: shows the zone charts until the redesigned Mesures page lands.
const PREVIEW_PERIODS = [
  { label: "nuit", from: 1, to: 5 }, // 01:00–05:00 today, a calm window
  { label: "6 h", seconds: 6 * 3600 },
  { label: "24 h", seconds: 86400 },
  { label: "7 j", seconds: 7 * 86400 },
] as const;

function ZonePreview({ id, device }: { id: string; device: DeviceSummary | null }) {
  const [period, setPeriod] = useState(2);
  const [dayBack, setDayBack] = useState(0);
  const [metric, setMetric] = useState<Metric>("co2");
  const p = PREVIEW_PERIODS[period]!;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const day0 = midnight.getTime() / 1000 - dayBack * 86400;
  // Sliding windows step back by whole days, plus 1 h so "6 h" at J-2 lands inside the
  // demo's day without PM2.5 (seeded as the rolling day 3 to 2 days before seeding).
  const nowMin = Math.floor(Date.now() / 60000) * 60 - dayBack * 86400 - (dayBack ? 3600 : 0);
  const fixed = "from" in p ? [day0 + p.from * 3600, day0 + p.to * 3600] as const
    : dayBack > 0 ? [nowMin - p.seconds, nowMin] as const : null;
  const series = useSeries(id, fixed ? fixed[0] : 0, fixed ? fixed[1] : "seconds" in p ? p.seconds : 86400, !fixed);
  const cal = device?.sound_calibration ?? null;
  const col = (m: Metric) => series.columns[m].map((v) => toDisplay(m, v, cal));
  return (
    <section style={{ display: "grid", gap: 12, marginBottom: 32 }} aria-label="Aperçu des graphiques à zones">
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg" role="group" aria-label="Période">
          {PREVIEW_PERIODS.map((q, i) => <button key={q.label} type="button" aria-pressed={i === period} onClick={() => setPeriod(i)}>{q.label}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Jour">
          <button type="button" onClick={() => setDayBack(dayBack + 1)}>‹ jour</button>
          <button type="button" disabled={dayBack === 0} onClick={() => setDayBack(dayBack - 1)}>jour ›</button>
        </div>
        <span className="muted small">J-{dayBack}</span>
        <div className="seg" role="group" aria-label="Mesure">
          {METRICS.map((m) => <button key={m} type="button" aria-pressed={m === metric} onClick={() => setMetric(m)}>{m}</button>)}
        </div>
      </div>
      {series.loading ? <Skeleton height={310} /> : (
        <>
          <ZoneChart def={metricDef(metric, cal)} xs={series.columns.xs} ys={col(metric)} range={series.window} height={310} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {METRICS.map((m) => (
              <ZoneChart key={m} compact def={metricDef(m, cal)} xs={series.columns.xs} ys={col(m)} range={series.window}
                         height={150} onOpen={() => setMetric(m)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CartePage({ id, device, commands, send, now }: {
  id: string; device: DeviceSummary | null; commands: ReturnType<typeof useCommands>; send: Send; now: number;
}) {
  return <CommandsTab id={id} device={device} commands={commands.data?.commands} reload={commands.reload} send={send} now={now} />;
}

function ReglagesPage({ device, ...rest }: Omit<Parameters<typeof OptionsTab>[0], "device"> & { device: DeviceSummary | null }) {
  return device ? <OptionsTab device={device} {...rest} /> : <Skeleton height={400} />;
}
