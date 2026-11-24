import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { Button, Field, Skeleton, useToast } from "../../components/ui";
import { usePoll } from "../../util";
import type { WebhookSettings } from "../../../../server/src/types";
import { lastSendText, randomSecret } from "./notify";

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
    if (!/^https?:\/\/\S+$/.test(url)) next.url = "Adresse complète attendue, par exemple https://hermes.exemple.fr/webhooks/aqa.";
    else if (!hostListed(url, s.allowed_hosts)) next.url = "Cet hôte n'est pas dans WEBHOOK_ALLOWED_HOSTS.";
    const secret = f.secret.trim();
    if (secret && secret.length < 16) next.secret = "16 caractères au moins.";
    else if (!secret && !s.secret_set && (f.enabled || needSecret)) next.secret = "Un secret est obligatoire : la même valeur que dans la route Hermes.";
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
      if (await save()) toast("good", "Webhook enregistré.");
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
      if (s.last?.ok) toast("good", "Test envoyé.");
      else toast("bad", `Échec de l'envoi${s.last?.error ? ` : ${s.last.error}` : "."}`);
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
        <p className="small tone-warn" role="alert"><span aria-hidden>▲</span> Chargement impossible : {loadError}</p>
      ) : !saved || !form ? <Skeleton height={260} /> : saved.allowed_hosts.length === 0 ? (
        <>
          <p className="muted small">Prévient un agent (Hermes…) à chaque alerte, avec un message signé.</p>
          <p className="muted small">Ajoute WEBHOOK_ALLOWED_HOSTS dans le .env du serveur pour activer le webhook.</p>
        </>
      ) : (
        <form className="al-notify-form" onSubmit={onSubmit} noValidate>
          <p className="muted small">Prévient un agent (Hermes…) à chaque alerte, avec un message signé.</p>
          <label className="al-check">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            Activé
          </label>
          <Field label="URL" error={errors.url} hint={`Hôtes autorisés : ${saved.allowed_hosts.join(", ")}`}>
            <input className="input mono" type="url" value={form.url} autoComplete="off" spellCheck={false}
                   placeholder="https://hermes.exemple.fr/webhooks/aqa" aria-invalid={errors.url ? true : undefined}
                   onChange={(e) => set("url", e.target.value)} />
          </Field>
          <div className="al-notify-inline">
            <Field label="Secret" error={errors.secret}
                   hint={generated ? "Copie-le dans la route Hermes avant d'enregistrer." : undefined}>
              <input className="input mono" type={generated ? "text" : "password"} value={form.secret}
                     autoComplete="new-password" spellCheck={false} placeholder={saved.secret_set ? "défini" : ""}
                     aria-invalid={errors.secret ? true : undefined} onChange={(e) => set("secret", e.target.value)} />
            </Field>
            <Button type="button" variant="ghost" size="sm" onClick={generate}>Générer</Button>
          </div>
          <label className="al-check">
            <input type="checkbox" checked={form.notify_close} onChange={(e) => set("notify_close", e.target.checked)} />
            Prévenir aussi à la fin
          </label>
          <div className="al-notify-actions">
            <Button type="submit" variant="primary" size="sm" loading={busy === "save"} disabled={!dirty || busy !== null}>Enregistrer</Button>
            <Button type="button" size="sm" onClick={onTest} loading={busy === "test"} disabled={busy !== null}>Envoyer un test</Button>
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
