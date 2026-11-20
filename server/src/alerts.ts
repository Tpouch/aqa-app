import type { AlertKind, AlertRuleValues, Metric } from "./types.js";

export interface Sample { ts: number; v: number } // sorted by ts ascending, no nulls
export interface OpenAlert { threshold: number; peak_value: number | null }
export type Decision =
  | { action: "none" }
  | { action: "open"; started_at: number; start_value: number | null; peak_value: number | null }
  | { action: "update"; peak_value: number }
  | { action: "close"; end_value: number | null };

export const CLOSE_AFTER_S = 120;
export const COVERAGE_S = 60;
export const CHECK_EVERY_S = 30;

export const CATALOG: Record<AlertKind, {
  label: string; unit: string; metric: Metric | null; direction: "high" | "low" | null;
  tone: "warn" | "bad"; defaults: AlertRuleValues; advice: string; min: number; max: number;
}> = {
  co2_high: {
    label: "CO₂ élevé", unit: "ppm", metric: "co2", direction: "high", tone: "bad",
    defaults: { enabled: true, threshold: 1200, duration_s: 300 },
    advice: "Ouvre une fenêtre en grand 5 à 10 minutes. Si plusieurs personnes sont dans la pièce, laisse aussi la porte ouverte.",
    min: 400, max: 5000,
  },
  pm25_high: {
    label: "Particules fines", unit: "µg/m³", metric: "pm25", direction: "high", tone: "bad",
    defaults: { enabled: true, threshold: 35, duration_s: 300 },
    advice: "Cherche la source (cuisson, bougie, fumée) et aère. Si la pollution vient de dehors, garde plutôt les fenêtres fermées.",
    min: 1, max: 500,
  },
  temp_low: {
    label: "Trop froid", unit: "°C", metric: "temp", direction: "low", tone: "warn",
    defaults: { enabled: true, threshold: 19, duration_s: 1800 },
    advice: "Monte le chauffage ou ferme les fenêtres. Si tu viens d'aérer, la pièce se réchauffera d'elle-même en quelques minutes.",
    min: -10, max: 40,
  },
  temp_high: {
    label: "Trop chaud", unit: "°C", metric: "temp", direction: "high", tone: "warn",
    defaults: { enabled: true, threshold: 24, duration_s: 1800 },
    advice: "Baisse le chauffage, ferme les volets côté soleil, et aère quand il fait plus frais dehors.",
    min: -10, max: 40,
  },
  hum_low: {
    label: "Air trop sec", unit: "%", metric: "hum", direction: "low", tone: "warn",
    defaults: { enabled: true, threshold: 40, duration_s: 1800 },
    advice: "Aère moins longtemps, fais sécher du linge dans la pièce ou utilise un humidificateur.",
    min: 0, max: 100,
  },
  hum_high: {
    label: "Air trop humide", unit: "%", metric: "hum", direction: "high", tone: "warn",
    defaults: { enabled: true, threshold: 60, duration_s: 1800 },
    advice: "Aère 10 minutes, surtout après une douche ou la cuisine, pour éviter la moisissure.",
    min: 0, max: 100,
  },
  snd_high: {
    label: "Bruit fort", unit: "dB", metric: "snd", direction: "high", tone: "bad",
    defaults: { enabled: false, threshold: 70, duration_s: 120 },
    advice: "Le bruit est fort depuis un moment. Ferme la fenêtre côté rue ou éloigne la source.",
    min: 30, max: 120,
  },
  offline: {
    label: "Carte hors ligne", unit: "", metric: null, direction: null, tone: "bad",
    defaults: { enabled: true, threshold: null, duration_s: 300 },
    advice: "Vérifie que la carte est branchée et que le Wi-Fi fonctionne. La page Carte montre son dernier contact.",
    min: 0, max: 0,
  },
};

const NONE: Decision = { action: "none" };

export function decideMetric(
  kind: AlertKind, rule: AlertRuleValues, open: OpenAlert | null, samples: Sample[], now: number,
): Decision {
  const high = CATALOG[kind].direction !== "low";
  const beyond = (v: number, t: number) => (high ? v > t : v < t);
  const worse = (a: number, b: number) => (high ? a > b : a < b);
  const worst = (xs: Sample[]) => xs.reduce((w, s) => (worse(s.v, w) ? s.v : w), xs[0]!.v);

  if (open) {
    const recent = samples.filter((s) => s.ts >= now - CLOSE_AFTER_S);
    if (recent.length === 0) return NONE;
    if (recent[0]!.ts < now - CLOSE_AFTER_S + COVERAGE_S && !recent.some((s) => beyond(s.v, open.threshold))) {
      return { action: "close", end_value: recent[recent.length - 1]!.v };
    }
    const beyondRecent = recent.filter((s) => beyond(s.v, open.threshold));
    if (beyondRecent.length === 0) return NONE;
    const peak = worst(beyondRecent);
    if (open.peak_value === null || worse(peak, open.peak_value)) return { action: "update", peak_value: peak };
    return NONE;
  }

  if (rule.threshold === null) return NONE;
  const from = now - rule.duration_s;
  const win = samples.filter((s) => s.ts >= from);
  if (win.length === 0) return NONE;
  if (win[win.length - 1]!.ts < now - COVERAGE_S || win[0]!.ts > from + COVERAGE_S) return NONE;
  if (!win.every((s) => beyond(s.v, rule.threshold!))) return NONE;
  return { action: "open", started_at: win[0]!.ts, start_value: win[0]!.v, peak_value: worst(win) };
}

export function decideOffline(
  rule: AlertRuleValues, open: boolean, lastSeen: number | null, serverStart: number, now: number,
): Decision {
  if (lastSeen === null) return NONE;
  if (open) {
    return now - lastSeen <= CHECK_EVERY_S * 2 ? { action: "close", end_value: null } : NONE;
  }
  const since = Math.max(lastSeen, serverStart);
  if (now - since > rule.duration_s) {
    return { action: "open", started_at: lastSeen, start_value: null, peak_value: null };
  }
  return NONE;
}
