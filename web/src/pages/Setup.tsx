import { CpuIcon, PlusIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import { TokenReveal } from "../components/TokenReveal";
import { Button, Field, useToast } from "../components/ui";
import type { UnknownDevice } from "../../../server/src/types";
import { ago, useNow } from "../util";

const ID_RE = /^aqa-[0-9A-F]{12}$/;

// First run: no board registered yet. Registers it and shows its token once.
export function Setup({ unknown, onDone }: { unknown: UnknownDevice[]; onDone: () => void }) {
  const toast = useToast();
  const now = useNow();
  const [newId, setNewId] = useState(unknown[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ id: string; token: string } | null>(null);

  const normalized = newId.trim().replace(/^aqa-/i, "aqa-").replace(/(?<=^aqa-).*/, (m) => m.toUpperCase());

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!ID_RE.test(normalized)) {
      setIdError("Format attendu : aqa- suivi de 12 caractères hexadécimaux, ex. aqa-24A160B3C8F0.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.addDevice(normalized, newName.trim() || "Mon capteur");
      setSecret({ id: res.device.id, token: res.token });
      toast("good", `${res.device.name} ajoutée.`);
    } catch (err) {
      setIdError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup">
      <div className="card empty" style={{ alignItems: "stretch", textAlign: "left", padding: "1.75rem" }}>
        <div style={{ display: "flex", gap: "0.9rem", alignItems: "center" }}>
          <div className="empty-icon"><CpuIcon size={24} aria-hidden /></div>
          <div>
            <h1 style={{ fontSize: "1.35rem" }}>Ajoute ta carte</h1>
            <p className="muted small">Une étape, puis les mesures arrivent toutes seules.</p>
          </div>
        </div>

        {unknown.length > 0 && (
          <div className="callout warn">
            <WarningIcon size={18} weight="fill" aria-hidden />
            <div className="grow">
              <span>Ta carte a déjà essayé d'envoyer des mesures. Clique pour pré-remplir :</span>
              <div className="chips">
                {unknown.map((u) => (
                  <span key={u.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.15rem" }}>
                    <button type="button" className="chip-btn" onClick={() => { setNewId(u.id); setIdError(null); }}>
                      {u.id} <span className="muted" style={{ fontFamily: "var(--font)" }}>· {ago(u.last_seen, now)}</span>
                    </button>
                    <Button size="sm" variant="ghost" iconOnly icon={<XIcon size={14} aria-hidden />}
                            onClick={() => api.forgetUnknown(u.id)}>Oublier {u.id}</Button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <form className="stack" onSubmit={add} noValidate style={{ paddingTop: 0 }}>
          <Field label="Identifiant de la carte" error={idError}
                 hint={<>Affiché au démarrage dans le log série (<code>sensor id aqa-…</code>) et dans le TUI.</>}>
            <input className="input mono" value={newId} placeholder="aqa-24A160B3C8F0" spellCheck={false} autoCapitalize="none" autoFocus
                   onChange={(e) => { setNewId(e.target.value); setIdError(null); }} aria-invalid={idError ? true : undefined} />
          </Field>
          <Field label="Nom" hint="Facultatif, ex. Chambre.">
            <input className="input" value={newName} maxLength={60} placeholder="Mon capteur" onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" loading={busy} disabled={!newId.trim()} icon={<PlusIcon size={16} aria-hidden />}>Ajouter la carte</Button>
        </form>

        <ol className="steps small">
          <li>Un jeton s'affiche : copie-le dans <code>DEVICE_TOKEN</code> du <code>.env</code> du firmware.</li>
          <li>Recompile et flashe la carte (<code>pio run -t upload</code>, ou le TUI).</li>
          <li>Les premières mesures apparaissent ici en moins d'une minute.</li>
        </ol>
      </div>
      <TokenReveal deviceId={secret?.id ?? ""} token={secret?.token ?? null} onClose={() => { setSecret(null); onDone(); }} />
    </div>
  );
}
