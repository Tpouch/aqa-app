import { useState, type FormEvent } from "react";
import { api } from "../api";
import { dateTime, usePoll } from "../util";
import { Setting } from "./Setting";
import { Button, Field, useConfirm, useToast } from "./ui";

export function FirmwareSection() {
  const list = usePoll(api.firmware, 60000, []);
  const toast = useToast();
  const confirm = useConfirm();
  const [version, setVersion] = useState("");
  const [bin, setBin] = useState<File | null>(null);
  const [sig, setSig] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!bin || !sig) return setError("Choisis firmware.bin et firmware.sig.");
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("version", version.trim());
    form.append("firmware", bin);
    form.append("signature", sig);
    try {
      await api.uploadFirmware(form);
      toast("good", `Firmware ${version.trim()} envoyé.`);
      setVersion(""); setBin(null); setSig(null);
      (e.target as HTMLFormElement).reset();
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Setting title="Firmwares"
             help={<>Dans le repo firmware : <code>pio run</code> puis <code>tools/sign_firmware.sh</code>. L'image contient le Wi-Fi et le jeton du
               <code> .env</code> : compile-la pour la carte visée. Elle n'est jamais publique, la carte la télécharge par un lien signé valable 24 h.</>}>
      <form className="st-stack" onSubmit={upload}>
        <Field label="Version"><input className="input mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.1.0" pattern="[A-Za-z0-9._\-]{1,32}" required /></Field>
        <Field label="Image firmware.bin" hint={bin ? `${Math.round(bin.size / 1024)} Ko` : undefined}>
          <input className="input" type="file" name="firmware" accept=".bin" onChange={(e) => setBin(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Signature firmware.sig" hint={sig ? `${Math.round(sig.size / 1024)} Ko` : undefined}>
          <input className="input" type="file" name="signature" accept=".sig" onChange={(e) => setSig(e.target.files?.[0] ?? null)} />
        </Field>
        {error && <p className="field-error small tone-bad" role="alert">{error}</p>}
        <div className="st-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!version.trim() || !bin || !sig}>Envoyer</Button>
        </div>
      </form>
      <table className="st-table">
        <thead><tr><th>Version</th><th>Taille</th><th className="hide-sm">Envoyé</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {list.data?.firmware.map((f) => (
            <tr key={f.version}>
              <td><code>{f.version}</code></td>
              <td className="num">{Math.round(f.size / 1024)} Ko</td>
              <td className="hide-sm">{dateTime(f.uploaded_at)}</td>
              <td className="st-td-actions">
                <Button size="sm" variant="danger"
                        onClick={async () => {
                          if (await confirm({ title: `Supprimer le firmware ${f.version} ?`, body: "Les mises à jour déjà en cours vers cette version échoueront.", confirmLabel: "Supprimer", danger: true })) {
                            api.deleteFirmware(f.version).then(() => { toast("good", "Firmware supprimé."); list.reload(); }, (err: Error) => toast("bad", err.message));
                          }
                        }}>Supprimer {f.version}</Button>
              </td>
            </tr>
          ))}
          {list.data?.firmware.length === 0 && <tr><td colSpan={4} className="muted small">Aucun firmware envoyé.</td></tr>}
        </tbody>
      </table>
    </Setting>
  );
}
