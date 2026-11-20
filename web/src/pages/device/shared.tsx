import {
  ArrowClockwiseIcon, ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, CheckIcon, CloudArrowDownIcon,
  CpuIcon, MapPinIcon, SlidersHorizontalIcon, WifiHighIcon, XIcon,
} from "@phosphor-icons/react";
import { useMemo, type ReactNode } from "react";
import { api } from "../../api";
import { Badge } from "../../components/ui";
import { METRICS, type CommandRow, type CommandType, type DeviceSummary, type Metric } from "../../../../server/src/types";
import { ago, duration, usePoll } from "../../util";

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
// sampling periods. `live` keeps refreshing (ranges that end now).
export function useSeries(id: string, from: number, to: number, live: boolean, refresh = live) {
  const step = stepFor(to - from);
  const res = usePoll(async () => {
    const end = live ? Math.floor(Date.now() / 1000) : to;
    const start = live ? end - (to - from) : from;
    const rows = step === 0
      ? (await api.frames(id, start, end)).frames
      : (await api.aggregate(id, start, end, step)).buckets;
    return { from: start, to: end, rows };
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

// ---------------------------------------------------------------- status card

export function StatusCard({ device: d, now }: { device: DeviceSummary; now: number }) {
  const s = d.status;
  return (
    <section className="card" aria-labelledby="status-title">
      <div className="card-head"><h2 id="status-title"><CpuIcon size={18} aria-hidden />État de la carte</h2></div>
      <div className="card-body">
        {!s ? <p className="muted small">Aucun rapport d'état reçu. La carte en envoie un au démarrage puis chaque minute.</p> : (
          <dl className="kv">
            <dt>Contact</dt><dd>{ago(d.last_seen, now)}</dd>
            <dt>Firmware</dt><dd>v{s.firmware_version} <span className="muted">· matériel {s.hardware_version}</span></dd>
            <dt>Allumée depuis</dt><dd>{duration(s.uptime_s)} <span className="muted">· démarrage n°{s.boot_count}</span></dd>
            <dt><WifiHighIcon size={14} aria-hidden />Wi-Fi</dt>
            <dd>{s.ssid} · {s.rssi} dBm <SignalBadge rssi={s.rssi} /></dd>
            <dt>Adresse IP</dt><dd><code>{s.ip}</code></dd>
            <dt><MapPinIcon size={14} aria-hidden />Position</dt><dd><code>{s.geohash}</code></dd>
            <dt>Capteurs</dt>
            <dd className="sensor-list">
              <SensorBadge ok={s.sensors.temperature} label="Temp./hum." />
              <SensorBadge ok={s.sensors.co2 !== null} label={s.sensors.co2 ?? "CO₂"} />
              <SensorBadge ok={s.sensors.pm} label="PM2.5" />
              <SensorBadge ok={s.sensors.sound} label="Son" />
            </dd>
            <dt>En attente</dt>
            <dd>{s.queue.pending} mesure{s.queue.pending > 1 ? "s" : ""}{s.queue.dropped > 0 && <> · <Badge tone="warn">{s.queue.dropped} perdues</Badge></>}</dd>
            <dt>Mémoire libre</dt><dd>{Math.round(s.free_heap / 1024)} Ko</dd>
          </dl>
        )}
      </div>
    </section>
  );
}

export const SignalBadge = ({ rssi }: { rssi: number }) =>
  rssi < -80 ? <Badge tone="warn">faible</Badge> : rssi < -70 ? <Badge>moyen</Badge> : <Badge tone="good">bon</Badge>;

const SensorBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <Badge tone={ok ? "good" : "bad"} title={ok ? "détecté au démarrage" : "non détecté"}>
    {ok ? <CheckIcon size={12} weight="bold" aria-hidden /> : <XIcon size={12} weight="bold" aria-hidden />}{label}
  </Badge>
);

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

export const COMMAND_ICON: Record<CommandType, ReactNode> = {
  status: <ArrowsClockwiseIcon size={14} aria-hidden />,
  restart: <ArrowClockwiseIcon size={14} aria-hidden />,
  rollback: <ArrowCounterClockwiseIcon size={14} aria-hidden />,
  geohash: <MapPinIcon size={14} aria-hidden />,
  config: <SlidersHorizontalIcon size={14} aria-hidden />,
  ota: <CloudArrowDownIcon size={14} aria-hidden />,
  wifi: <WifiHighIcon size={14} aria-hidden />,
};

// Polls the command list and exposes a `send` helper with toasts.
export function useCommands(id: string) {
  return usePoll(() => api.commands(id), 4000, [id]);
}
