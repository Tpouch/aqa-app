import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { Setting } from "../../components/Setting";
import { SecretReveal } from "../../components/TokenReveal";
import { Button, Field, useConfirm, useToast } from "../../components/ui";
import { dateTime, useNow, usePoll } from "../../util";
import { lastUsedText, maskedKey } from "./apiKeys";
import { t } from "../../i18n/dict";

export function ApiKeysSection() {
  const list = usePoll(api.apiKeys, 60000, []);
  const now = useNow(30000);
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const k = await api.createApiKey(name.trim());
      setCreated({ name: k.name, key: k.key });
      setName("");
      setAdding(false);
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Setting title={t().settings.apiKeys}
             help={t().settings.apiKeysHelp}>
      <ul className="st-stack">
        {list.data?.keys.map((k) => (
          <li key={k.id} className="st-actions">
            <span>
              <strong>{k.name}</strong> · <code>{maskedKey(k.prefix)}</code> · {t().settings.createdOn(dateTime(k.created_at))} · {lastUsedText(k.last_used_at, now)}
            </span>
            <Button size="sm" variant="danger"
                    onClick={async () => {
                      if (await confirm({ title: t().settings.revokeTitle(k.name), body: t().settings.revokeBody, confirmLabel: t().settings.revoke, danger: true })) {
                        api.deleteApiKey(k.id).then(() => { toast("good", t().settings.revoked); list.reload(); }, (err: Error) => toast("bad", err.message));
                      }
                    }}>{t().settings.revoke}<span className="sr-only"> {k.name}</span></Button>
          </li>
        ))}
        {list.data?.keys.length === 0 && <li className="muted small">{t().settings.noKeys}</li>}
      </ul>
      {adding ? (
        <form className="st-stack" onSubmit={create}>
          <Field label={t().settings.name} error={error}>
            <input className="input" value={name} maxLength={60} autoFocus placeholder="Hermes"
                   onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="st-actions">
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>{t().settings.create}</Button>
            <Button type="button" onClick={() => { setAdding(false); setError(null); }}>{t().settings.cancel}</Button>
          </div>
        </form>
      ) : (
        <div className="st-actions"><Button onClick={() => setAdding(true)}>{t().settings.newKey}</Button></div>
      )}
      <SecretReveal title={t().settings.keyTitle(created?.name ?? "")} intro={t().settings.keyIntro}
                    secret={created?.key ?? null} confirmLabel={t().settings.keyCopied} onClose={() => setCreated(null)} />
    </Setting>
  );
}
