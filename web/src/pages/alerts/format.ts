import type { AlertRow, AlertRule, Metric } from "../../../../server/src/types";
import { metricDef } from "../../metrics";
import { duration, fmt } from "../../util";

// Sound is already in dB on alerts: the uncalibrated def still gives 0 decimals.
const decimals = (metric: Metric | null) => (metric ? metricDef(metric, null).decimals : 0);

export function alertValue(a: Pick<AlertRow, "metric" | "unit">, v: number | null): string {
  if (v === null) return "—";
  const n = fmt(v, decimals(a.metric));
  return a.unit ? `${n} ${a.unit}` : n;
}

export function alertEnding(a: AlertRow): string | null {
  if (a.ended_at === null) return null;
  if (a.end_reason === "disabled") return "règle désactivée";
  if (a.kind === "offline") return "reconnectée";
  return a.end_value === null ? "retour à la normale" : `retour à ${alertValue(a, a.end_value)}`;
}

// Thresholds are round numbers: no forced trailing zeros ("19 °C", not "19,0 °C").
const threshold = (r: AlertRule) => r.threshold === null ? "—"
  : r.threshold.toLocaleString("fr-FR", { maximumFractionDigits: decimals(r.metric) });

export function ruleSummary(r: AlertRule): string {
  if (r.metric === null) return `plus de ${duration(r.duration_s)} sans contact`;
  const sign = r.kind.endsWith("_low") ? "<" : ">";
  return `${sign} ${threshold(r)} ${r.unit} · ${duration(r.duration_s)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "auj. 14:02", "hier 22:40", sinon "12/11 08:15" (heure locale). */
export function alertDate(epoch: number, nowSec: number): string {
  const d = new Date(epoch * 1000);
  const today = new Date(nowSec * 1000);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d >= today) return `auj. ${time}`;
  if (d >= yesterday) return `hier ${time}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}
