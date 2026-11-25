import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { Button, Field, Skeleton, useToast } from "../../components/ui";
import { usePoll } from "../../util";
import type { NotifySettings } from "../../../../server/src/types";
import { lastSendText, randomTopic } from "./notify";
import { t } from "../../i18n/dict";
import { getLang } from "../../i18n/lang";

const TOPIC_RE = /^[-_A-Za-z0-9]{1,64}$/;

interface Form { enabled: boolean; server: string; topic: string; token: string; notify_close: boolean }
type Errors = Partial<Record<"server" | "topic", string>>;

const formFrom = (s: NotifySettings): Form =>
  ({ enabled: s.enabled, server: s.server, topic: s.topic, token: "", notify_close: s.notify_close });

// Global setting (all boards): alerts go to a ntfy topic, with the board's name in each one.
export function NotifySection({ now }: { now: number }) {
  const toast = useToast();
  const [saved, setSaved] = useState<NotifySettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"save" | "test" | "token" | null>(null);

  // Polled so "dernier envoi" follows the alerts sent in the background.
  // Only the first answer fills the form: later ones never overwrite what is being typed.
  const poll = usePoll(() => api.notify(), 15000, []);
  useEffect(() => {
    const s = poll.data;
    if (!s) return;
    setSaved((cur) => (cur ? { ...cur, last: s.last } : s));
    setForm((f) => f ?? formFrom(s));
  }, [poll.data]);
  const loadError = poll.error;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => f && { ...f, [k]: v });
    if (k === "server" || k === "topic" || k === "enabled") setErrors({});
  };

  // Only what changed goes to the server; an empty token field keeps the saved one.
  function patch(f: Form, s: NotifySettings) {
    const p: Parameters<typeof api.updateNotify>[0] = {};
    if (f.enabled !== s.enabled) p.enabled = f.enabled;
    if (f.server.trim() !== s.server) p.server = f.server.trim();
    if (f.topic.trim() !== s.topic) p.topic = f.topic.trim();
    if (f.token.trim()) p.token = f.token.trim();
    if (f.notify_close !== s.notify_close) p.notify_close = f.notify_close;
    return p;
  }

  function validate(f: Form): boolean {
    const next: Errors = {};
    if (!/^https?:\/\/\S+$/.test(f.server.trim())) next.server = t().alerts.ntfyServerFull;
    const topic = f.topic.trim();
    if (topic && !TOPIC_RE.test(topic)) next.topic = t().alerts.topicChars;
    else if (!topic && f.enabled) next.topic = t().alerts.topicToEnable;
    setErrors(next);
    return !next.server && !next.topic;
  }

  // Returns the saved settings, or null if nothing could be saved.
  async function save(): Promise<NotifySettings | null> {
    if (!form || !saved || !validate(form)) return null;
    const p = patch(form, saved);
    if (Object.keys(p).length === 0) return saved;
    const s = await api.updateNotify(p);
    setSaved(s);
    setForm(formFrom(s));
    return s;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    try {
      if (await save()) toast("good", t().alerts.notifySaved);
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // The test uses what is on screen: pending changes are saved first.
  async function onTest() {
    if (form && !form.topic.trim()) {
      setErrors({ topic: t().alerts.topicToTest });
      return;
    }
    setBusy("test");
    try {
      if (!await save()) return;
      const s = await api.testNotify();
      setSaved(s);
      if (s.last?.ok) toast("good", t().alerts.testSent);
      else toast("bad", t().alerts.sendFailed(s.last?.error ?? null));
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeToken() {
    setBusy("token");
    try {
      const s = await api.updateNotify({ token: null });
      setSaved(s);
      setForm((f) => f && { ...f, token: "" });
      toast("good", t().alerts.tokenRemoved);
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const dirty = !!form && !!saved && Object.keys(patch(form, saved)).length > 0;
  const status = saved ? lastSendText(saved.last, now) : null;

  return (
    <section className="al-notify" aria-labelledby="al-notify-title">
      <h3 id="al-notify-title" className="label-caps">{t().alerts.notifications}</h3>
      {!saved && loadError ? (
        <p className="small tone-warn" role="alert"><span aria-hidden>▲</span> {t().alerts.loadFailed(loadError)}</p>
      ) : !saved || !form ? <Skeleton height={260} /> : (
        <form className="al-notify-form" onSubmit={onSubmit} noValidate>
          {getLang() === "en" ? (
            <p className="muted small">
              Get the alerts of every board on your phone with the <a href="https://ntfy.sh" target="_blank" rel="noreferrer">ntfy</a> app:
              subscribe to the same topic. On ntfy.sh, anyone who knows the topic can read it: pick a name that's hard to guess.
              {" "}{t().alerts.frenchNote}
            </p>
          ) : (
            <p className="muted small">
              Reçois les alertes de toutes les cartes sur ton téléphone avec l'app <a href="https://ntfy.sh" target="_blank" rel="noreferrer">ntfy</a> :
              abonne-toi au même sujet. Sur ntfy.sh, quiconque connaît le sujet peut le lire : choisis un nom difficile à deviner.
            </p>
          )}
          <label className="al-check">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            {t().alerts.sendToNtfy}
          </label>
          <Field label={t().alerts.server} error={errors.server}>
            <input className="input mono" type="url" value={form.server} autoComplete="off" spellCheck={false}
                   aria-invalid={errors.server ? true : undefined} onChange={(e) => set("server", e.target.value)} />
          </Field>
          <div className="al-notify-inline">
            <Field label={t().alerts.topic} error={errors.topic}>
              <input className="input mono" value={form.topic} autoComplete="off" spellCheck={false} maxLength={64}
                     placeholder="aqa-…" aria-invalid={errors.topic ? true : undefined}
                     onChange={(e) => set("topic", e.target.value)} />
            </Field>
            <Button type="button" variant="ghost" size="sm" onClick={() => set("topic", randomTopic())}>{t().alerts.random}</Button>
          </div>
          <div className="al-notify-inline">
            <Field label={t().alerts.accessToken}
                   hint={saved.token_set ? t().alerts.tokenSetHint : t().alerts.tokenHint}>
              <input className="input mono" type="password" value={form.token} autoComplete="new-password"
                     placeholder={saved.token_set ? t().alerts.tokenSaved : "tk_…"} onChange={(e) => set("token", e.target.value)} />
            </Field>
            {saved.token_set && (
              <Button type="button" variant="ghost" size="sm" onClick={removeToken} loading={busy === "token"}>{t().alerts.remove}</Button>
            )}
          </div>
          <label className="al-check">
            <input type="checkbox" checked={form.notify_close} onChange={(e) => set("notify_close", e.target.checked)} />
            {t().alerts.alsoOnClose}
          </label>
          <div className="al-notify-actions">
            <Button type="submit" variant="primary" size="sm" loading={busy === "save"} disabled={!dirty || busy !== null}>{t().alerts.save}</Button>
            <Button type="button" size="sm" onClick={onTest} loading={busy === "test"} disabled={busy !== null}>{t().alerts.sendTest}</Button>
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
