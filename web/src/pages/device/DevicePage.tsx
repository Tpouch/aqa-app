import { WarningIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../../api";
import { Skeleton, useToast } from "../../components/ui";
import type { CommandRow, CommandType, DeviceSummary } from "../../../../server/src/types";
import { TAB_LABEL, type Tab } from "../../routes";
import type { Selection } from "../../selection";
import { useNow, usePoll } from "../../util";
import { CommandsTab } from "./CommandsTab";
import { OptionsTab } from "./OptionsTab";
import { MeasuresPage } from "../measures/MeasuresPage";
import { COMMAND_LABEL, useCommands } from "./shared";

export type Send = (type: CommandType, params?: Record<string, unknown>) => Promise<boolean>;

export function DevicePage({ id, tab, selection, onSelection, onPendingChange, onDeleted }: {
  id: string;
  tab: Tab;
  selection: Selection;
  onSelection: (s: Selection) => void;
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

  // Carte and Réglages still show the former content until their redesign.
  return (
    <div id={`panel-${tab}`} className="tab-panel">
      <h1 className="sr-only">{TAB_LABEL[tab]}</h1>
      {tab === "mesures" && <MeasuresPage id={id} device={d} selection={selection} onSelection={onSelection} />}
      {tab === "carte" && <CartePage id={id} device={d} commands={commands} send={send} now={now} />}
      {tab === "reglages" && <ReglagesPage device={d} send={send} reloadDevice={device.reload} onDeleted={onDeleted} />}
    </div>
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
