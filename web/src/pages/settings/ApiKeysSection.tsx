import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { Setting } from "../../components/Setting";
import { SecretReveal } from "../../components/TokenReveal";
import { Button, Field, useConfirm, useToast } from "../../components/ui";
import { dateTime, useNow, usePoll } from "../../util";
import { lastUsedText, maskedKey } from "./apiKeys";

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
    <Setting title="Clés d'API"
             help="Pour qu'un agent (Hermes…) lise tes mesures et règle le webhook. Une clé ne peut pas piloter les cartes.">
      <ul className="st-stack">
        {list.data?.keys.map((k) => (
          <li key={k.id} className="st-actions">
            <span>
              <strong>{k.name}</strong> · <code>{maskedKey(k.prefix)}</code> · créée le {dateTime(k.created_at)} · {lastUsedText(k.last_used_at, now)}
            </span>
            <Button size="sm" variant="danger"
                    onClick={async () => {
                      if (await confirm({ title: `Révoquer « ${k.name} » ?`, body: "L'agent qui l'utilise perdra l'accès tout de suite.", confirmLabel: "Révoquer", danger: true })) {
                        api.deleteApiKey(k.id).then(() => { toast("good", "Clé révoquée"); list.reload(); }, (err: Error) => toast("bad", err.message));
                      }
                    }}>Révoquer<span className="sr-only"> {k.name}</span></Button>
          </li>
        ))}
        {list.data?.keys.length === 0 && <li className="muted small">Aucune clé.</li>}
      </ul>
      {adding ? (
        <form className="st-stack" onSubmit={create}>
          <Field label="Nom" error={error}>
            <input className="input" value={name} maxLength={60} autoFocus placeholder="Hermes"
                   onChange={(e) => setName(e.target.value)} required />
          </Field>
          <div className="st-actions">
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>Créer</Button>
            <Button type="button" onClick={() => { setAdding(false); setError(null); }}>Annuler</Button>
          </div>
        </form>
      ) : (
        <div className="st-actions"><Button onClick={() => setAdding(true)}>Nouvelle clé</Button></div>
      )}
      <SecretReveal title={`Clé « ${created?.name ?? ""} »`} intro="Copie-la dans la config de ton agent."
                    secret={created?.key ?? null} confirmLabel="J'ai copié la clé" onClose={() => setCreated(null)} />
    </Setting>
  );
}
