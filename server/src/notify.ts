// ntfy notifications. Notifier.publish() is the single way out: alerts use it
// today, a generic webhook or a weekly summary can reuse it later.
// Sending never throws and never runs inside a database transaction: the
// alert tick hands its events over after the commit and does not wait.
import { CATALOG, type AlertEvent } from "./alerts.js";
import { get, now, run, type Db } from "./db.js";
import { span } from "./events.js";
import type { AlertKind, Metric, NotifyLast, NotifySettings } from "./types.js";

export interface NotifyMessage {
  title: string;
  message: string;
  priority: "low" | "default" | "high";
  tags: string[];
  click?: string;
}

const PRIORITY = { low: 2, default: 3, high: 4 } as const;

// ntfy tags that map to emojis: one per alert kind.
const TAGS: Record<AlertKind, string> = {
  co2_high: "window", pm25_high: "fog", temp_low: "cold_face", temp_high: "hot_face",
  hum_low: "desert", hum_high: "droplet", snd_high: "loud_sound", offline: "electric_plug",
};

const decimals = (m: Metric | null) => (m === "temp" || m === "hum" ? 1 : 0);

function value(kind: AlertKind, v: number): string {
  const c = CATALOG[kind];
  const d = decimals(c.metric);
  const n = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(v);
  return c.unit ? `${n} ${c.unit}` : n;
}

const alertsUrl = (publicUrl: string) => `${publicUrl}/#/alertes`;

export function openedMessage(e: Extract<AlertEvent, { type: "opened" }>, publicUrl: string): NotifyMessage {
  const c = CATALOG[e.kind];
  const since = span(e.at - e.started_at);
  let what: string;
  if (c.metric === null) what = `Aucun contact depuis ${since}.`;
  else {
    const limit = e.threshold === null ? "" : ` (seuil ${value(e.kind, e.threshold)})`;
    what = e.value === null ? `Depuis ${since}${limit}.` : `${value(e.kind, e.value)} depuis ${since}${limit}.`;
  }
  return {
    title: `${c.label} · ${e.device_name}`,
    message: `${what}\n${c.advice}`,
    priority: c.tone === "bad" ? "high" : "default",
    tags: [TAGS[e.kind]],
    click: alertsUrl(publicUrl),
  };
}

export function closedMessage(e: Extract<AlertEvent, { type: "closed" }>, publicUrl: string): NotifyMessage {
  const c = CATALOG[e.kind];
  const after = span(e.at - e.started_at);
  const message = c.metric === null
    ? `${c.label} : reconnectée après ${after}.`
    : `${c.label} : terminé après ${after}` + (e.end_value === null ? "." : `, retour à ${value(e.kind, e.end_value)}.`);
  return {
    title: `Retour à la normale · ${e.device_name}`,
    message,
    priority: "low",
    tags: ["white_check_mark"],
    click: alertsUrl(publicUrl),
  };
}

export const TEST_MESSAGE: NotifyMessage = {
  title: "Test · AQA",
  message: "Les notifications fonctionnent. Tes alertes arriveront ici.",
  priority: "default",
  tags: ["white_check_mark"],
};

interface NotifyRow {
  enabled: number; server: string; topic: string; token: string | null; notify_close: number;
  last_at: number | null; last_ok: number | null; last_error: string | null;
}

const readRow = (db: Db) => get<NotifyRow>(db, "SELECT * FROM notify WHERE id = 1")!;

export function readNotify(db: Db): NotifySettings {
  const r = readRow(db);
  return {
    enabled: r.enabled === 1,
    server: r.server,
    topic: r.topic,
    token_set: r.token !== null,
    notify_close: r.notify_close === 1,
    last: r.last_at === null ? null : { at: r.last_at, ok: r.last_ok === 1, error: r.last_error },
  };
}

/** Short, body-free reason for a failed fetch (timeout, refused connection...). */
export function networkError(err: unknown, timeoutMs: number): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e.name === "TimeoutError" || e.name === "AbortError") return `délai dépassé (${Math.round(timeoutMs / 1000) || 1} s)`;
  return `injoignable : ${e.cause?.code ?? e.cause?.message ?? e.message}`;
}

interface Log { info(o: object, m: string): void; warn(o: object, m: string): void }

export class Notifier {
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly db: Db, private readonly opts: {
    publicUrl: string; log?: Log; fetch?: typeof fetch; timeoutMs?: number;
  }) {
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  /** Sends one message with the saved settings, even when notifications are off (used by the test button). */
  async publish(msg: NotifyMessage): Promise<NotifyLast> {
    let error: string | null;
    try {
      const s = readRow(this.db);
      error = s.topic ? await this.post(s, msg) : "aucun sujet configuré";
    } catch (err) {
      error = `erreur interne : ${(err as Error).message}`;
    }
    const last: NotifyLast = { at: now(), ok: error === null, error };
    if (error) this.opts.log?.warn({ title: msg.title, error }, "ntfy: send failed");
    else this.opts.log?.info({ title: msg.title }, "ntfy: sent");
    try {
      run(this.db, "UPDATE notify SET last_at = ?, last_ok = ?, last_error = ? WHERE id = 1",
        last.at, last.ok ? 1 : 0, last.error);
    } catch {
      // Database closed while the request was in flight (shutdown): nothing to record.
    }
    return last;
  }

  /** Applies the settings to the events of one alert tick. */
  async alerts(events: AlertEvent[]): Promise<void> {
    if (events.length === 0) return;
    let s: NotifySettings;
    try {
      s = readNotify(this.db);
    } catch {
      return;
    }
    if (!s.enabled || !s.topic) return;
    const msgs = events.flatMap((e) => {
      if (e.type === "opened") return [openedMessage(e, this.opts.publicUrl)];
      // A rule switched off by hand is not a return to normal.
      if (e.reason !== "normal" || !s.notify_close) return [];
      return [closedMessage(e, this.opts.publicUrl)];
    });
    await Promise.all(msgs.map((m) => this.publish(m)));
  }

  // Returns null on success, a short reason otherwise.
  private async post(s: NotifyRow, msg: NotifyMessage): Promise<string | null> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (s.token) headers.authorization = `Bearer ${s.token}`;
    // JSON publishing goes to the server root, the topic is in the body.
    const body = JSON.stringify({ topic: s.topic, ...msg, priority: PRIORITY[msg.priority] });
    try {
      const res = await this.fetch(`${s.server}/`, {
        method: "POST", headers, body, signal: AbortSignal.timeout(this.timeoutMs),
      });
      const text = await res.text();
      if (res.ok) return null;
      // Only ntfy's own error field is kept: the raw body of whatever answered
      // (the server URL is free) is never echoed back to the browser.
      let reason = "";
      try {
        const j = JSON.parse(text) as { error?: unknown };
        if (typeof j.error === "string") reason = j.error.slice(0, 120);
      } catch { /* not ntfy's JSON: status code only */ }
      return `HTTP ${res.status}${reason ? ` : ${reason}` : ""}`;
    } catch (err) {
      return networkError(err, this.timeoutMs);
    }
  }
}
