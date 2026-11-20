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
    <div className="setup-panel">
      <header>
        <div className="label-caps login-brand">AQA</div>
        <h1>Ajoute ta carte</h1>
        <p className="muted small">Une étape, puis les mesures arrivent toutes seules.</p>
      </header>

      {unknown.length > 0 && (
        <section aria-labelledby="unknown-title">
          <h2 id="unknown-title" className="label-caps">Cartes qui ont déjà écrit</h2>
          <p className="muted small">Ta carte a déjà essayé d'envoyer des mesures. Ajoute-la pour pré-remplir le formulaire.</p>
          <table className="st-table">
            <thead>
              <tr><th scope="col">Identifiant</th><th scope="col">Vue</th><th scope="col" className="hide-sm">IP</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {unknown.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{ago(u.last_seen, now)}</td>
                  <td className="hide-sm">{u.ip ?? "—"}</td>
                  <td className="st-td-actions">
                    <Button size="sm" onClick={() => { setNewId(u.id); setIdError(null); }}>Ajouter<span className="sr-only"> {u.id}</span></Button>{" "}
                    <Button size="sm" variant="ghost" onClick={() => api.forgetUnknown(u.id)}>Oublier<span className="sr-only"> {u.id}</span></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <form className="st-stack" onSubmit={add} noValidate>
        <Field label="Identifiant de la carte" error={idError}
               hint={<>Affiché au démarrage dans le log série (<code>sensor id aqa-…</code>) et dans le TUI.</>}>
          <input className="input mono" value={newId} placeholder="aqa-24A160B3C8F0" spellCheck={false} autoCapitalize="none" autoFocus
                 onChange={(e) => { setNewId(e.target.value); setIdError(null); }} aria-invalid={idError ? true : undefined} />
        </Field>
        <Field label="Nom" hint="Facultatif, ex. Chambre.">
          <input className="input" value={newName} maxLength={60} placeholder="Mon capteur" onChange={(e) => setNewName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!newId.trim()}>Ajouter la carte</Button>
      </form>

      <ol className="steps small muted">
        <li>Un jeton s'affiche : copie-le dans <code>DEVICE_TOKEN</code> du <code>.env</code> du firmware.</li>
        <li>Recompile et flashe la carte (<code>pio run -t upload</code>, ou le TUI).</li>
        <li>Les premières mesures apparaissent ici en moins d'une minute.</li>
      </ol>
      <TokenReveal deviceId={secret?.id ?? ""} token={secret?.token ?? null} onClose={() => { setSecret(null); onDone(); }} />
    </div>
  );
}
