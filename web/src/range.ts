import { useCallback, useState } from "react";
import { dateFmt } from "./i18n/format";
import { t } from "./i18n/dict";

// The period shown on the Mesures page: a sliding preset, one calendar day, or a free range.
export type Range =
  | { kind: "preset"; seconds: number }
  | { kind: "day"; date: string } // YYYY-MM-DD, local time
  | { kind: "custom"; from: number; to: number };

// "24 h", "7 j" / "7 d"; short: "24h", "7j" / "7d". Read at render time.
const presetLabel = (s: number) => (s > 86400 ? `${s / 86400} ${t().time.d}` : `${s / 3600} h`);
export const PRESETS = [3600, 6 * 3600, 86400, 7 * 86400, 30 * 86400].map((seconds) => ({
  seconds,
  get label() { return presetLabel(seconds); },
  get short() { return presetLabel(seconds).replace(" ", ""); },
}));

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isoLocal = (s: number) => {
  const d = new Date(s * 1000);
  return `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayStart = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!).getTime() / 1000;
};
export const shiftDay = (date: string, delta: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return isoDay(new Date(y!, m! - 1, d! + delta));
};
const longDay = () => dateFmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDT = () => dateFmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export interface Resolved { from: number; to: number; live: boolean; refresh: boolean; title: string }

// A preset is live: only its length matters (useSeries slides it to now).
// A day refreshes only while it is today.
export function resolveRange(r: Range, today: string): Resolved {
  if (r.kind === "preset") {
    const label = PRESETS.find((p) => p.seconds === r.seconds)?.label ?? "";
    return { from: 0, to: r.seconds, live: true, refresh: true, title: t().measures.rolling(label, r.seconds > 3600) };
  }
  if (r.kind === "day") {
    const start = dayStart(r.date);
    return { from: start, to: start + 86400 - 1, live: false, refresh: r.date === today, title: longDay().format(new Date(start * 1000)) };
  }
  return { from: r.from, to: r.to, live: false, refresh: false, title: `${shortDT().format(r.from * 1000)} → ${shortDT().format(r.to * 1000)}` };
}

// "Sur 24 h", "sur la journée": the period in a sentence.
export function periodLabel(r: Range): string {
  const m = t().measures;
  if (r.kind === "preset") return PRESETS.find((p) => p.seconds === r.seconds)?.label ?? m.thePeriod;
  return r.kind === "day" ? m.theDay : m.theRange;
}

const KEY = "aqa-sensor-range";

function isRange(v: unknown): v is Range {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (r.kind === "preset" && typeof r.seconds === "number")
    || (r.kind === "day" && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    || (r.kind === "custom" && typeof r.from === "number" && typeof r.to === "number");
}

function loadRange(): Range {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (isRange(v)) return v;
  } catch {
    // Blocked storage or bad JSON: default below.
  }
  return { kind: "preset", seconds: 86400 };
}

// Kept for the browser tab's lifetime, under the key the old Capteur tab used.
export function useRange(): [Range, (r: Range) => void] {
  const [range, setRange] = useState(loadRange);
  const update = useCallback((r: Range) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(r));
    } catch {
      // Blocked storage: the range still holds for this page view.
    }
    setRange(r);
  }, []);
  return [range, update];
}
