import { useMemo } from "react";
import { api } from "../../api";
import { METRICS, type CommandRow, type CommandType, type Metric } from "../../../../server/src/types";
import { usePoll } from "../../util";

const STEPS = [60, 300, 900, 3600, 10800, 21600, 86400];
const MAX_POINTS = 2000;

// Raw 15 s frames while they fit in MAX_POINTS (~8 h), averaged buckets beyond.
export function stepFor(seconds: number): number {
  if (seconds / 15 <= MAX_POINTS) return 0;
  return STEPS.find((s) => seconds / s <= MAX_POINTS) ?? 86400;
}

export function stepLabel(step: number): string {
  return step >= 86400 ? `${step / 86400} j` : step >= 3600 ? `${step / 3600} h` : `${step / 60} min`;
}

export type Columns = { xs: number[] } & Record<Metric, (number | null)[]>;

// Loads [from, to] and turns rows into chart columns. A missing stretch (board
// offline) becomes a hole: a null is inserted after any jump longer than three
// sampling periods. `live` keeps refreshing (ranges that end now). A null id loads
// nothing (no room to compare); `data.id` says whose rows these are.
export function useSeries(id: string | null, from: number, to: number, live: boolean, refresh = live) {
  const step = stepFor(to - from);
  const res = usePoll(async () => {
    const end = live ? Math.floor(Date.now() / 1000) : to;
    const start = live ? end - (to - from) : from;
    if (id === null) return { id, from: start, to: end, rows: [] };
    const rows = step === 0
      ? (await api.frames(id, start, end)).frames
      : (await api.aggregate(id, start, end, step)).buckets;
    return { id, from: start, to: end, rows };
  }, refresh ? 30000 : 3_600_000, [id, from, to, live]);

  const columns = useMemo<Columns>(() => {
    const rows = res.data?.rows ?? [];
    const period = step || 15;
    const xs: number[] = [];
    const ys = Object.fromEntries(METRICS.map((m) => [m, [] as (number | null)[]])) as Record<Metric, (number | null)[]>;
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
  }, [res.data, step]);

  const window: [number, number] = res.data ? [res.data.from, res.data.to] : [from, to];
  return { data: res.data, columns, step, window, loading: !res.data, error: res.error };
}

// ---------------------------------------------------------------- commands

export const COMMAND_STATE: Record<CommandRow["state"], { label: string; tone?: "good" | "warn" | "bad" }> = {
  pending: { label: "En attente" },
  sent: { label: "Transmise" },
  in_progress: { label: "En cours", tone: "warn" },
  completed: { label: "Terminée", tone: "good" },
  failed: { label: "Échec", tone: "bad" },
};

export const COMMAND_LABEL: Record<CommandType, string> = {
  status: "Rapport d'état", restart: "Redémarrage", rollback: "Retour au firmware précédent",
  geohash: "Changement de position", config: "Paramètres", ota: "Mise à jour du firmware", wifi: "Changement de Wi-Fi",
};

// Polls the command list and exposes a `send` helper with toasts.
export function useCommands(id: string) {
  return usePoll(() => api.commands(id), 4000, [id]);
}
