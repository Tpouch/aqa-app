import { ArrowClockwiseIcon, ArrowRightIcon, ArrowsClockwiseIcon, DownloadSimpleIcon, LightningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Chart } from "../../components/Chart";
import { Button, Skeleton, useConfirm } from "../../components/ui";
import { METRICS, type DeviceSummary } from "../../../../server/src/types";
import { downloadCsv } from "../../util";
import type { Send } from "./DevicePage";
import { StatusCard, stepLabel, useSeries } from "./shared";

const PRESETS = [
  { key: "6h", label: "6 h", seconds: 6 * 3600 },
  { key: "24h", label: "24 h", seconds: 86400 },
  { key: "7d", label: "7 j", seconds: 7 * 86400 },
  { key: "30d", label: "30 j", seconds: 30 * 86400 },
] as const;
type PresetKey = (typeof PRESETS)[number]["key"];

export function Overview({ id, device, now, send }: { id: string; device: DeviceSummary | null; now: number; send: Send }) {
  const [key, setKey] = useState<PresetKey>(() => (sessionStorage.getItem("aqa-overview-range") as PresetKey) || "24h");
  const preset = PRESETS.find((p) => p.key === key) ?? PRESETS[1];
  useEffect(() => { sessionStorage.setItem("aqa-overview-range", key); }, [key]);

  // `live`: the window slides with time, so only its length matters here.
  const series = useSeries(id, 0, preset.seconds, true);

  return (
    <div className="device-layout">
      <div className="charts">
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <div className="segmented" role="group" aria-label="Période affichée">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" aria-pressed={p.key === key} onClick={() => setKey(p.key)}>{p.label}</button>
            ))}
          </div>
          <div className="toolbar">
            {series.step > 0 && <span className="muted small">Moyennes sur {stepLabel(series.step)}</span>}
            <Button size="sm" icon={<DownloadSimpleIcon size={16} aria-hidden />} disabled={!series.data?.rows.length}
                    onClick={() => downloadCsv(`${id}-${key}.csv`, ["time", ...METRICS],
                      (series.data?.rows ?? []).map((r) => [new Date(r.ts * 1000).toISOString(), ...METRICS.map((m) => r[m])]))}>
              CSV
            </Button>
          </div>
        </div>
        {series.loading
          ? METRICS.map((m) => <Skeleton key={m} height={262} />)
          : METRICS.map((m) => <Chart key={m} metric={m} xs={series.columns.xs} ys={series.columns[m]} range={series.window} />)}
      </div>
      <aside>
        {device ? <StatusCard device={device} now={now} /> : <Skeleton height={300} />}
        <QuickActions id={id} name={device?.name ?? id} send={send} />
      </aside>
    </div>
  );
}

function QuickActions({ id, name, send }: { id: string; name: string; send: Send }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); await fn(); setBusy(null); };

  return (
    <section className="card" aria-labelledby="qa-title">
      <div className="card-head"><h2 id="qa-title"><LightningIcon size={18} aria-hidden />Actions rapides</h2></div>
      <div className="card-body">
        <div className="action-grid two">
          <Button loading={busy === "status"} icon={<ArrowsClockwiseIcon size={20} aria-hidden />}
                  onClick={() => run("status", () => send("status"))}>Actualiser l'état</Button>
          <Button loading={busy === "restart"} icon={<ArrowClockwiseIcon size={20} aria-hidden />}
                  onClick={() => run("restart", async () => {
                    if (await confirm({ title: "Redémarrer la carte ?", body: `${name} sera indisponible une dizaine de secondes. Les mesures en attente sont conservées.`, confirmLabel: "Redémarrer" })) {
                      await send("restart");
                    }
                  })}>Redémarrer</Button>
        </div>
        <a className="btn ghost" href="#/commands" style={{ marginTop: "0.6rem", width: "100%" }}>
          Toutes les commandes et le journal<ArrowRightIcon size={16} aria-hidden />
        </a>
      </div>
    </section>
  );
}
