import { all, get, run, tx, type Db } from "./db.js";
import { soundDb } from "./sound.js";
import { ALERT_KINDS, type AlertKind, type AlertRow, type AlertRule, type AlertRuleValues, type Metric } from "./types.js";

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

export function readRules(db: Db): AlertRule[] {
  const rows = all<{ kind: AlertKind; enabled: number; threshold: number | null; duration_s: number }>(
    db, "SELECT kind, enabled, threshold, duration_s FROM alert_rules");
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return ALERT_KINDS.flatMap((kind) => {
    const r = byKind.get(kind);
    if (!r) return [];
    const c = CATALOG[kind];
    return [{
      kind, label: c.label, unit: c.unit, metric: c.metric, defaults: c.defaults,
      enabled: r.enabled === 1, threshold: r.threshold, duration_s: r.duration_s,
    }];
  });
}

export type AlertDbRow = Omit<AlertRow, "label" | "unit" | "metric" | "tone" | "advice">;

export function toAlertRow(r: AlertDbRow): AlertRow {
  const c = CATALOG[r.kind];
  return { ...r, label: c.label, unit: c.unit, metric: c.metric, tone: c.tone, advice: c.advice };
}

// Only write points for alerts: a future webhook hooks in here.
export function openAlert(
  db: Db, deviceId: string, kind: AlertKind, threshold: number | null,
  d: Extract<Decision, { action: "open" }>,
): void {
  run(db,
    "INSERT INTO alerts (device_id, kind, threshold, started_at, start_value, peak_value) VALUES (?, ?, ?, ?, ?, ?)",
    deviceId, kind, threshold, d.started_at, d.start_value, d.peak_value);
}

export function closeAlert(
  db: Db, alertId: number, now: number, endValue: number | null, reason: "normal" | "disabled",
): void {
  run(db, "UPDATE alerts SET ended_at = ?, end_value = ?, end_reason = ? WHERE id = ?", now, endValue, reason, alertId);
}

interface OpenRow { id: number; kind: AlertKind; threshold: number | null; peak_value: number | null }

export function checkAlerts(db: Db, now: number, serverStart: number): void {
  tx(db, () => {
    const rules = readRules(db);
    const maxDur = rules.reduce((m, r) => (r.enabled && r.metric ? Math.max(m, r.duration_s) : m), 0);
    const from = now - Math.max(maxDur, CLOSE_AFTER_S) - 60;
    const devices = all<{ id: string; last_seen: number | null; snd_ref: number | null; db_ref: number | null }>(
      db, "SELECT id, last_seen, snd_ref, db_ref FROM devices");

    for (const dev of devices) {
      const openRows = all<OpenRow>(
        db, "SELECT id, kind, threshold, peak_value FROM alerts WHERE device_id = ? AND ended_at IS NULL", dev.id);
      const openByKind = new Map(openRows.map((o) => [o.kind, o]));
      const frames = all<Record<string, number | null> & { ts: number }>(
        db, "SELECT ts, snd, co2, pm25, hum, temp FROM frames WHERE device_id = ? AND ts >= ? ORDER BY ts",
        dev.id, from);

      for (const rule of rules) {
        const open = openByKind.get(rule.kind);
        if (!rule.enabled) {
          if (open) closeAlert(db, open.id, now, null, "disabled");
          continue;
        }
        let decision: Decision;
        if (rule.metric === null) {
          decision = decideOffline(rule, !!open, dev.last_seen, serverStart, now);
        } else {
          const cal = dev.snd_ref !== null && dev.db_ref !== null ? { snd_ref: dev.snd_ref, db_ref: dev.db_ref } : null;
          if (rule.metric === "snd" && !cal) continue;
          const samples: Sample[] = [];
          for (const f of frames) {
            const raw = f[rule.metric];
            if (raw === null || raw === undefined) continue;
            const v = rule.metric === "snd" ? soundDb(raw, cal!) : raw;
            if (v !== null) samples.push({ ts: f.ts, v });
          }
          decision = decideMetric(rule.kind, rule,
            open && open.threshold !== null ? { threshold: open.threshold, peak_value: open.peak_value } : null,
            samples, now);
        }
        if (decision.action === "open") openAlert(db, dev.id, rule.kind, rule.threshold, decision);
        else if (decision.action === "close" && open) closeAlert(db, open.id, now, decision.end_value, "normal");
        else if (decision.action === "update" && open) {
          run(db, "UPDATE alerts SET peak_value = ? WHERE id = ?", decision.peak_value, open.id);
        }
      }
    }
  });
}
