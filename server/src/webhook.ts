// Outgoing webhook (Hermes generic route, signature V2). Same contract as
// Notifier: send() never throws, waits 5 s at most, records a short result and
// never keeps the remote answer (the URL is free).
import crypto from "node:crypto";
import { CATALOG, type AlertEvent } from "./alerts.js";
import { get, now, run, type Db } from "./db.js";
import { TEST_MESSAGE, closedMessage, networkError, openedMessage, type NotifyMessage } from "./notify.js";
import type { NotifyLast, WebhookPayload, WebhookSettings } from "./types.js";

export const COARSE_ERROR = "échec : vérifie l'URL et le secret";

interface WebhookRow {
  enabled: number; url: string; secret: string | null; notify_close: number;
  last_at: number | null; last_ok: number | null; last_error: string | null;
}

const readRow = (db: Db) => get<WebhookRow>(db, "SELECT * FROM webhook WHERE id = 1")!;

/** `coarse` hides the failure detail (callers authenticated by API key). */
export function readWebhook(db: Db, opts: { coarse?: boolean } = {}): WebhookSettings {
  const r = readRow(db);
  let last: NotifyLast | null = null;
  if (r.last_at !== null) {
    const ok = r.last_ok === 1;
    last = { at: r.last_at, ok, error: opts.coarse ? (ok ? null : COARSE_ERROR) : r.last_error };
  }
  return { enabled: r.enabled === 1, url: r.url, secret_set: r.secret !== null, notify_close: r.notify_close === 1, last };
}

/** Hermes generic scheme: HMAC-SHA256 (hex) of "<timestamp>.<raw body>". */
export function sign(secret: string, ts: number, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

const link = (publicUrl: string) => `${publicUrl}/#/alertes`;
const text = (m: NotifyMessage) => `${m.title}\n${m.message}`;

export function payloadFor(e: AlertEvent, publicUrl: string, at: number): WebhookPayload {
  const c = CATALOG[e.kind];
  const opened = e.type === "opened";
  return {
    event: opened ? "alert.opened" : "alert.closed",
    sent_at: at,
    text: text(opened ? openedMessage(e, publicUrl) : closedMessage(e, publicUrl)),
    device: { id: e.device_id, name: e.device_name },
    alert: {
      kind: e.kind, label: c.label, tone: c.tone,
      value: opened ? e.value : null,
      threshold: e.threshold,
      unit: c.unit && c.metric !== null ? c.unit : null,
      started_at: e.started_at,
      ended_at: opened ? null : e.at,
      duration_s: e.at - e.started_at,
      end_value: opened ? null : e.end_value,
      advice: c.advice,
    },
    url: link(publicUrl),
  };
}

export function testPayload(publicUrl: string, at: number): WebhookPayload {
  return { event: "test", sent_at: at, text: text(TEST_MESSAGE), url: link(publicUrl) };
}

interface Log { info(o: object, m: string): void; warn(o: object, m: string): void }

export class Webhook {
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly db: Db, private readonly opts: {
    publicUrl: string; log?: Log; fetch?: typeof fetch; timeoutMs?: number;
  }) {
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  /** Sends one payload with the saved settings, even when the webhook is off (used by the test button). */
  async send(p: WebhookPayload): Promise<NotifyLast> {
    let error: string | null;
    try {
      const s = readRow(this.db);
      if (!s.url) error = "aucune URL configurée";
      else if (!s.secret) error = "aucun secret configuré";
      else error = await this.post(s.url, s.secret, p);
    } catch (err) {
      error = `erreur interne : ${(err as Error).message}`;
    }
    const last: NotifyLast = { at: now(), ok: error === null, error };
    if (error) this.opts.log?.warn({ event: p.event, error }, "webhook: send failed");
    else this.opts.log?.info({ event: p.event }, "webhook: sent");
    try {
      run(this.db, "UPDATE webhook SET last_at = ?, last_ok = ?, last_error = ? WHERE id = 1",
        last.at, last.ok ? 1 : 0, last.error);
    } catch {
      // Database closed while the request was in flight (shutdown): nothing to record.
    }
    return last;
  }

  /** Applies the settings to the events of one alert tick. */
  async alerts(events: AlertEvent[]): Promise<void> {
    if (events.length === 0) return;
    let s: WebhookSettings;
    try {
      s = readWebhook(this.db);
    } catch {
      return;
    }
    if (!s.enabled || !s.url) return;
    const at = now();
    const payloads = events.flatMap((e) => {
      // A rule switched off by hand is not a return to normal.
      if (e.type === "closed" && (e.reason !== "normal" || !s.notify_close)) return [];
      return [payloadFor(e, this.opts.publicUrl, at)];
    });
    await Promise.all(payloads.map((p) => this.send(p)));
  }

  // Returns null on success, a short reason otherwise. The answer body is never read.
  private async post(url: string, secret: string, p: WebhookPayload): Promise<string | null> {
    const body = JSON.stringify(p); // serialized once: this exact string is signed and sent
    try {
      const res = await this.fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-timestamp": String(p.sent_at),
          "x-webhook-signature-v2": sign(secret, p.sent_at, body),
        },
        body,
        // A redirect would forward the signed body to another origin: record it as a failure instead.
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      await res.body?.cancel();
      if (res.ok) return null;
      // redirect: "manual" yields the 3xx itself (undici), or an opaque redirect with status 0 elsewhere.
      return res.type === "opaqueredirect" || res.status === 0 ? "HTTP 3xx (redirection)" : `HTTP ${res.status}`;
    } catch (err) {
      return networkError(err, this.timeoutMs);
    }
  }
}
