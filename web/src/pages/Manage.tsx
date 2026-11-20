import { useState, type FormEvent } from "react";
import { api } from "../api";
import { ago, dateTime, usePoll } from "../util";

export function Manage() {
  const devices = usePoll(api.devices, 15000, []);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ id: string; token: string } | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.addDevice(newId.trim(), newName.trim());
      setSecret({ id: res.device.id, token: res.token });
      setNewId("");
      setNewName("");
      devices.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function act(fn: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    try {
      await fn();
      devices.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-head"><h1>Gestion</h1></div>
      {error && <p className="error">{error}</p>}

      {secret && <TokenReveal {...secret} onClose={() => setSecret(null)} />}

      <section className="card">
        <h2>Ajouter une carte</h2>
        {devices.data?.unknown.length ? (
          <p className="small">Cartes vues sans être enregistrées :{" "}
            {devices.data.unknown.map((u) => (
              <span key={u.id} className="chip">
                <button className="link" onClick={() => setNewId(u.id)}>{u.id}</button>
                <span className="muted"> {ago(u.last_seen)}</span>
                <button className="link muted" title="Oublier" onClick={() => act(() => api.forgetUnknown(u.id))}>×</button>
              </span>
            ))}
          </p>
        ) : null}
        <form className="inline-form" onSubmit={add}>
          <input placeholder="aqa-24A160B3C8F0" value={newId} onChange={(e) => setNewId(e.target.value)} />
          <input placeholder="Nom (ex. Chambre)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="primary" disabled={!newId.trim() || !newName.trim()}>Ajouter</button>
        </form>
        <p className="muted small">L'identifiant est affiché au démarrage de la carte (log série : <code>sensor id aqa-…</code>).</p>
      </section>

      <section className="card">
        <h2>Cartes</h2>
        <table>
          <thead><tr><th>Nom</th><th>Identifiant</th><th>Vue</th><th /></tr></thead>
          <tbody>
            {devices.data?.devices.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td><code>{d.id}</code></td>
                <td>{ago(d.last_seen)}</td>
                <td className="actions">
                  <button className="link" onClick={() => {
                    const name = window.prompt("Nouveau nom", d.name);
                    if (name?.trim()) void act(() => api.renameDevice(d.id, name.trim()));
                  }}>renommer</button>
                  <button className="link" onClick={() => act(async () => {
                    const { token } = await api.rotateToken(d.id);
                    setSecret({ id: d.id, token });
                  }, `Générer un nouveau jeton pour ${d.name} ? L'ancien cesse de fonctionner immédiatement : la carte devra être reflashée avec le nouveau.`)}>nouveau jeton</button>
                  <button className="link danger" onClick={() => act(() => api.deleteDevice(d.id),
                    `Supprimer ${d.name} et TOUTES ses mesures ? C'est définitif.`)}>supprimer</button>
                </td>
              </tr>
            ))}
            {devices.data?.devices.length === 0 && <tr><td colSpan={4} className="muted">Aucune carte.</td></tr>}
          </tbody>
        </table>
      </section>

      <FirmwareSection />
    </>
  );
}

function TokenReveal({ id, token, onClose }: { id: string; token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const snippet = `DEVICE_TOKEN=${token}`;
  return (
    <section className="card reveal" role="alert">
      <h2>Jeton de {id}</h2>
      <p>Copie-le maintenant dans le <code>.env</code> du firmware : <strong>il ne sera plus jamais affiché</strong>.</p>
      <pre>{snippet}</pre>
      <div className="button-row">
        <button className="primary" onClick={() => navigator.clipboard.writeText(snippet).then(() => setCopied(true))}>
          {copied ? "Copié ✓" : "Copier"}
        </button>
        <button onClick={onClose}>J'ai copié le jeton</button>
      </div>
    </section>
  );
}

function FirmwareSection() {
  const list = usePoll(api.firmware, 60000, []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      await api.uploadFirmware(new FormData(form));
      form.reset();
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Firmwares</h2>
      <p className="muted small">
        <code>pio run</code> puis <code>tools/sign_firmware.sh</code> dans le repo firmware, et envoie
        <code> .pio/build/ttgo-t7-v14-mini32/firmware.bin</code> + <code>firmware.sig</code>. L'image contient le Wi-Fi et le jeton
        du <code>.env</code> : compile-la pour la carte visée. Elle n'est jamais publique, la carte la télécharge par un lien signé valable 24 h.
      </p>
      <form className="inline-form" onSubmit={upload}>
        <input name="version" placeholder="version, ex. 2.0.1" required pattern="[A-Za-z0-9._\-]{1,32}" />
        <label className="file">firmware.bin<input type="file" name="firmware" accept=".bin" required /></label>
        <label className="file">firmware.sig<input type="file" name="signature" accept=".sig" required /></label>
        <button className="primary" disabled={busy}>{busy ? "Envoi…" : "Envoyer"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>Version</th><th>Taille</th><th>Envoyé</th><th /></tr></thead>
        <tbody>
          {list.data?.firmware.map((f) => (
            <tr key={f.version}>
              <td><code>{f.version}</code></td>
              <td>{Math.round(f.size / 1024)} Ko</td>
              <td>{dateTime(f.uploaded_at)}</td>
              <td className="actions">
                <button className="link danger" onClick={() => {
                  if (window.confirm(`Supprimer le firmware ${f.version} ?`)) {
                    api.deleteFirmware(f.version).then(list.reload, (err: Error) => setError(err.message));
                  }
                }}>supprimer</button>
              </td>
            </tr>
          ))}
          {list.data?.firmware.length === 0 && <tr><td colSpan={4} className="muted">Aucun firmware.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
