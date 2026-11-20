import { ChartLineIcon, GearSixIcon, SquaresFourIcon, TerminalWindowIcon, WarningIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../../api";
import { OnlineBadge, Skeleton, useToast } from "../../components/ui";
import type { CommandRow, CommandType } from "../../../../server/src/types";
import { ago, useNow, usePoll } from "../../util";
import { CommandsTab } from "./CommandsTab";
import { OptionsTab } from "./OptionsTab";
import { Overview } from "./Overview";
import { SensorTab } from "./SensorTab";
import { COMMAND_LABEL, useCommands } from "./shared";

// The app follows one board; these are its sections, shown in the top bar.
export const TABS = [
  { key: "overview", label: "Tableau de bord", icon: SquaresFourIcon },
  { key: "sensor", label: "Capteur", icon: ChartLineIcon },
  { key: "commands", label: "Commandes", icon: TerminalWindowIcon },
  { key: "options", label: "Options", icon: GearSixIcon },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

export type Send = (type: CommandType, params?: Record<string, unknown>) => Promise<boolean>;

export function DevicePage({ id, tab, onPendingChange, onDeleted }: {
  id: string;
  tab: TabKey;
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
  const label = TABS.find((t) => t.key === tab)!.label;

  return (
    <>
      <div className="page-head">
        <div className="title">
          {d ? (
            <>
              <h1>{tab === "overview" ? d.name : label} <OnlineBadge online={d.online} /></h1>
              <span className="muted small">
                {tab !== "overview" && <>{d.name} · </>}<code>{d.id}</code> · {d.latest ? `dernière mesure ${ago(d.latest.ts, now)}` : "aucune mesure reçue"}
              </span>
            </>
          ) : <Skeleton height={56} width={280} />}
        </div>
      </div>

      <div id={`panel-${tab}`} className="tab-panel">
        {tab === "overview" && <Overview id={id} device={d} now={now} send={send} />}
        {tab === "sensor" && <SensorTab id={id} device={d} now={now} />}
        {tab === "commands" && <CommandsTab id={id} device={d} commands={commands.data?.commands} reload={commands.reload} send={send} now={now} />}
        {tab === "options" && (d ? <OptionsTab device={d} send={send} reloadDevice={device.reload} onDeleted={onDeleted} /> : <Skeleton height={400} />)}
      </div>
    </>
  );
}
