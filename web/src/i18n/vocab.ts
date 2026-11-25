// Words the server sends in French (zone words, alert names and advice) and the
// shared labels of tabs and commands, in the active language.
import type { AlertKind, CommandRow, CommandType, DeviceReport } from "../../../server/src/types";
import type { Tab } from "../routes";
import { t } from "./dict";
import { getLang } from "./lang";

// Zone words of server/src/zones.ts.
const ZONE_EN: Record<string, string> = {
  bon: "good", "aérer": "ventilate", mauvais: "bad", froid: "cold", confort: "comfort", chaud: "hot",
  sec: "dry", humide: "humid", calme: "quiet", bruyant: "noisy", fort: "loud",
};

// Alert catalog of server/src/alerts.ts.
const ALERT_EN: Record<AlertKind, { label: string; advice: string }> = {
  co2_high: { label: "High CO₂", advice: "Open a window wide for 5 to 10 minutes. If several people are in the room, leave the door open too." },
  pm25_high: { label: "Fine particles", advice: "Look for the source (cooking, candle, smoke) and ventilate. If the pollution comes from outside, keep the windows closed instead." },
  temp_low: { label: "Too cold", advice: "Turn the heating up or close the windows. If you just aired the room, it will warm up again on its own in a few minutes." },
  temp_high: { label: "Too hot", advice: "Turn the heating down, close the shutters on the sunny side, and ventilate when it's cooler outside." },
  hum_low: { label: "Air too dry", advice: "Ventilate for shorter periods, dry laundry in the room or use a humidifier." },
  hum_high: { label: "Air too humid", advice: "Ventilate for 10 minutes, especially after a shower or cooking, to prevent mould." },
  snd_high: { label: "Loud noise", advice: "It has been loud for a while. Close the street-side window or move away from the source." },
  offline: { label: "Board offline", advice: "Check that the board is plugged in and the Wi-Fi works. The Board page shows its last contact." },
};

const en = () => getLang() === "en";

export const zoneWord = (word: string): string => (en() ? ZONE_EN[word] ?? word : word);
export const alertLabel = (kind: AlertKind, fallback: string): string => (en() ? ALERT_EN[kind]?.label ?? fallback : fallback);
export const alertAdvice = (kind: AlertKind, fallback: string): string => (en() ? ALERT_EN[kind]?.advice ?? fallback : fallback);

/** An alert row or rule with its label (and advice) in the active language. */
export function localizeAlert<T extends { kind: AlertKind; label: string; advice?: string }>(row: T): T {
  if (!en()) return row;
  const out = { ...row, label: alertLabel(row.kind, row.label) };
  if (row.advice !== undefined) out.advice = alertAdvice(row.kind, row.advice);
  return out;
}

export const tabLabel = (tab: Tab): string => t().tabs[tab];
export const commandLabel = (type: CommandType): string => t().commands.label[type];
export function commandState(state: CommandRow["state"]): { label: string; tone?: "good" | "warn" | "bad" } {
  const TONE: Partial<Record<CommandRow["state"], "good" | "warn" | "bad">> = { in_progress: "warn", completed: "good", failed: "bad" };
  return { label: t().commands.state[state], tone: TONE[state] };
}

/** A report with its zone words and alert names in the active language (its sentences come translated). */
export function localizeReport(r: DeviceReport): DeviceReport {
  if (!en()) return r;
  return {
    ...r,
    metrics: r.metrics.map((m) => ({
      ...m,
      current: { ...m.current, zones: m.current.zones?.map((z) => ({ ...z, word: zoneWord(z.word) })) ?? null },
      previous: { ...m.previous, zones: m.previous.zones?.map((z) => ({ ...z, word: zoneWord(z.word) })) ?? null },
    })),
    alerts: { ...r.alerts, by_kind: r.alerts.by_kind.map(localizeAlert) },
  };
}
