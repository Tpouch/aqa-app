import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { Button, Field, Skeleton, useToast } from "../../components/ui";
import { usePoll } from "../../util";
import type { WebhookSettings } from "../../../../server/src/types";
import { lastSendText, randomSecret } from "./notify";
import { t } from "../../i18n/dict";
import { getLang } from "../../i18n/lang";

interface Form { enabled: boolean; url: string; secret: string; notify_close: boolean }
type Errors = Partial<Record<"url" | "secret", string>>;

const formFrom = (s: WebhookSettings): Form =>
  ({ enabled: s.enabled, url: s.url, secret: "", notify_close: s.notify_close });

function hostListed(url: string, hosts: string[]): boolean {
  try {
    return hosts.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Global setting (all boards): each alert is POSTed, signed, to an agent such as Hermes.
export function WebhookSection({ now }: { now: number }) {
  const toast = useToast();
  const [saved, setSaved] = useState<WebhookSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  // Polled so "dernier envoi" follows the alerts sent in the background.
  // Each answer replaces the saved settings (an agent may have changed them) and
  // refills the form, unless something was typed or generated since the last fill or save.
  const touched = useRef(false);
  const poll = usePoll(() => api.webhook(), 15000, []);
  useEffect(() => {
    const s = poll.data;
    if (!s) return;
    setSaved(s);
    if (!touched.current) setForm(formFrom(s));
  }, [poll.data]);
  const loadError = poll.error;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    touched.current = true;
    setForm((f) => f && { ...f, [k]: v });
    if (k === "url" || k === "secret" || k === "enabled") setErrors({});
    if (k === "secret") setGenerated(false);
  };

  // Only what changed goes to the server; an empty secret field keeps the saved one.
  function patch(f: Form, s: WebhookSettings) {
    const p: Parameters<typeof api.updateWebhook>[0] = {};
    if (f.enabled !== s.enabled) p.enabled = f.enabled;
    if (f.url.trim() !== s.url) p.url = f.url.trim();
    if (f.secret.trim()) p.secret = f.secret.trim();
    if (f.notify_close !== s.notify_close) p.notify_close = f.notify_close;
    return p;
  }

  function validate(f: Form, s: WebhookSettings, needSecret: boolean): boolean {
    const next: Errors = {};
    const url = f.url.trim();
    if (!/^https?:\/\/\S+$/.test(url)) next.url = t().alerts.webhookUrlFull;
    else if ((url !== s.url || f.enabled) && !hostListed(url, s.allowed_hosts)) next.url = t().alerts.hostNotListed;
    const secret = f.secret.trim();
    if (secret && secret.length < 16) next.secret = t().alerts.secretMin;
    else if (!secret && !s.secret_set && (f.enabled || needSecret)) next.secret = t().alerts.secretRequired;
    setErrors(next);
    return !next.url && !next.secret;
  }

  // Returns the saved settings, or null if nothing could be saved.
  async function save(needSecret = false): Promise<WebhookSettings | null> {
    if (!form || !saved || !validate(form, saved, needSecret)) return null;
    const p = patch(form, saved);
    if (Object.keys(p).length === 0) return saved;
    const s = await api.updateWebhook(p);
    setSaved(s);
    setForm(formFrom(s));
    touched.current = false;
    setGenerated(false);
    return s;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    try {
      if (await save()) toast("good", t().alerts.webhookSaved);
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // With an empty host list the form is hidden: switching off is still possible.
  async function onDisable() {
    setBusy("save");
    try {
      const s = await api.updateWebhook({ enabled: false });
      setSaved(s);
      setForm(formFrom(s));
      toast("good", t().alerts.webhookDisabled);
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // The test uses what is on screen: pending changes are saved first.
  async function onTest() {
    setBusy("test");
    try {
      if (!await save(true)) return;
      const s = await api.testWebhook();
      setSaved(s);
      if (s.last?.ok) toast("good", t().alerts.webhookTestSent);
      else toast("bad", t().alerts.sendFailed(s.last?.error ?? null));
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function generate() {
    set("secret", randomSecret());
    setGenerated(true);
  }

  const dirty = !!form && !!saved && Object.keys(patch(form, saved)).length > 0;
  const status = saved ? lastSendText(saved.last, now) : null;

  return (
    <section className="al-notify" aria-labelledby="al-webhook-title">
      <h3 id="al-webhook-title" className="label-caps">Webhook</h3>
      {!saved && loadError ? (
        <p className="small tone-warn" role="alert"><span aria-hidden>▲</span> {t().alerts.loadFailed(loadError)}</p>
      ) : !saved || !form ? <Skeleton height={260} /> : saved.allowed_hosts.length === 0 ? (
        <>
          <p className="muted small">{t().alerts.webhookIntro}</p>
          <p className="muted small">{t().alerts.webhookAddHosts}</p>
          {saved.enabled && (
            <Button type="button" size="sm" loading={busy === "save"} disabled={busy !== null} onClick={onDisable}>{t().alerts.disable}</Button>
          )}
        </>
      ) : (
        <form className="al-notify-form" onSubmit={onSubmit} noValidate>
          <p className="muted small">{t().alerts.webhookIntro}</p>
          <label className="al-check">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            {t().alerts.enabled}
          </label>
          <Field label="URL" error={errors.url} hint={t().alerts.allowedHosts(saved.allowed_hosts.join(", "))}>
            <input className="input mono" type="url" value={form.url} autoComplete="off" spellCheck={false}
                   placeholder={getLang() === "en" ? "https://hermes.example.com/webhooks/aqa" : "https://hermes.exemple.fr/webhooks/aqa"} aria-invalid={errors.url ? true : undefined}
                   onChange={(e) => set("url", e.target.value)} />
          </Field>
          <div className="al-notify-inline">
            <Field label="Secret" error={errors.secret}
                   hint={generated ? t().alerts.copySecret : undefined}>
              <input className="input mono" type={generated ? "text" : "password"} value={form.secret}
                     autoComplete="new-password" spellCheck={false} placeholder={saved.secret_set ? t().alerts.secretSet : ""}
                     aria-invalid={errors.secret ? true : undefined} onChange={(e) => set("secret", e.target.value)} />
            </Field>
            <Button type="button" variant="ghost" size="sm" onClick={generate}>{t().alerts.generate}</Button>
          </div>
          <label className="al-check">
            <input type="checkbox" checked={form.notify_close} onChange={(e) => set("notify_close", e.target.checked)} />
            {t().alerts.alsoAtEnd}
          </label>
          <div className="al-notify-actions">
            <Button type="submit" variant="primary" size="sm" loading={busy === "save"} disabled={!dirty || busy !== null}>{t().alerts.saveCap}</Button>
            <Button type="button" size="sm" onClick={onTest} loading={busy === "test"} disabled={busy !== null}>{t().alerts.sendTestCap}</Button>
          </div>
          <p className="al-notify-status small" aria-live="polite">
            <span className="muted">{t().alerts.lastSend}</span>
            {status?.tone && <span className={`tone-${status.tone}`} aria-hidden>{status.tone === "good" ? "● " : "▲ "}</span>}
            <span className={status?.tone === "bad" ? "tone-bad" : status?.tone ? undefined : "muted"}>{status?.text}</span>
          </p>
        </form>
      )}
    </section>
  );
}
