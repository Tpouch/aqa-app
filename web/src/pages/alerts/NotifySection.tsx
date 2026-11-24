import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { Button, Field, Skeleton, useToast } from "../../components/ui";
import { usePoll } from "../../util";
import type { NotifySettings } from "../../../../server/src/types";
import { lastSendText, randomTopic } from "./notify";

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
    if (!/^https?:\/\/\S+$/.test(f.server.trim())) next.server = "Adresse complète attendue, par exemple https://ntfy.sh.";
    const topic = f.topic.trim();
    if (topic && !TOPIC_RE.test(topic)) next.topic = "Lettres, chiffres, - et _ seulement (64 au plus).";
    else if (!topic && f.enabled) next.topic = "Choisis un sujet pour activer les notifications.";
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
      if (await save()) toast("good", "Notifications enregistrées.");
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // The test uses what is on screen: pending changes are saved first.
  async function onTest() {
    if (form && !form.topic.trim()) {
      setErrors({ topic: "Choisis un sujet pour envoyer un test." });
      return;
    }
    setBusy("test");
    try {
      if (!await save()) return;
      const s = await api.testNotify();
      setSaved(s);
      if (s.last?.ok) toast("good", "Notification de test envoyée.");
      else toast("bad", `Échec de l'envoi${s.last?.error ? ` : ${s.last.error}` : "."}`);
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
      toast("good", "Jeton retiré.");
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
      <h3 id="al-notify-title" className="label-caps">Notifications</h3>
      {!saved && loadError ? (
        <p className="small tone-warn" role="alert"><span aria-hidden>▲</span> Chargement impossible : {loadError}</p>
      ) : !saved || !form ? <Skeleton height={260} /> : (
        <form className="al-notify-form" onSubmit={onSubmit} noValidate>
          <p className="muted small">
            Reçois les alertes de toutes les cartes sur ton téléphone avec l'app <a href="https://ntfy.sh" target="_blank" rel="noreferrer">ntfy</a> :
            abonne-toi au même sujet. Sur ntfy.sh, quiconque connaît le sujet peut le lire : choisis un nom difficile à deviner.
          </p>
          <label className="al-check">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            Envoyer les alertes sur ntfy
          </label>
          <Field label="Serveur" error={errors.server}>
            <input className="input mono" type="url" value={form.server} autoComplete="off" spellCheck={false}
                   aria-invalid={errors.server ? true : undefined} onChange={(e) => set("server", e.target.value)} />
          </Field>
          <div className="al-notify-inline">
            <Field label="Sujet" error={errors.topic}>
              <input className="input mono" value={form.topic} autoComplete="off" spellCheck={false} maxLength={64}
                     placeholder="aqa-…" aria-invalid={errors.topic ? true : undefined}
                     onChange={(e) => set("topic", e.target.value)} />
            </Field>
            <Button type="button" variant="ghost" size="sm" onClick={() => set("topic", randomTopic())}>au hasard</Button>
          </div>
          <div className="al-notify-inline">
            <Field label="Jeton d'accès (facultatif)"
                   hint={saved.token_set ? "Un jeton est enregistré. Saisis-en un autre pour le remplacer." : "Pour un sujet protégé ou ton propre serveur ntfy."}>
              <input className="input mono" type="password" value={form.token} autoComplete="new-password"
                     placeholder={saved.token_set ? "jeton enregistré" : "tk_…"} onChange={(e) => set("token", e.target.value)} />
            </Field>
            {saved.token_set && (
              <Button type="button" variant="ghost" size="sm" onClick={removeToken} loading={busy === "token"}>retirer</Button>
            )}
          </div>
          <label className="al-check">
            <input type="checkbox" checked={form.notify_close} onChange={(e) => set("notify_close", e.target.checked)} />
            Prévenir aussi quand l'alerte se termine
          </label>
          <div className="al-notify-actions">
            <Button type="submit" variant="primary" size="sm" loading={busy === "save"} disabled={!dirty || busy !== null}>enregistrer</Button>
            <Button type="button" size="sm" onClick={onTest} loading={busy === "test"} disabled={busy !== null}>envoyer un test</Button>
          </div>
          <p className="al-notify-status small" aria-live="polite">
            <span className="muted">dernier envoi : </span>
            {status?.tone && <span className={`tone-${status.tone}`} aria-hidden>{status.tone === "good" ? "● " : "▲ "}</span>}
            <span className={status?.tone === "bad" ? "tone-bad" : status?.tone ? undefined : "muted"}>{status?.text}</span>
          </p>
        </form>
      )}
    </section>
  );
}
