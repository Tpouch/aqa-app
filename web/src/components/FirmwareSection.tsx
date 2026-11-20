import { CloudArrowUpIcon, FileArrowUpIcon, FileIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import { dateTime, usePoll } from "../util";
import { Button, Field, useConfirm, useToast } from "./ui";

function FileDrop({ name, label, accept, file, onFile }: { name: string; label: string; accept: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className={`dropzone${file ? " filled" : ""}`}>
      {file ? <FileIcon size={22} aria-hidden /> : <FileArrowUpIcon size={22} aria-hidden />}
      <span className="dz-text">
        <b>{label}</b>
        <span>{file ? `${file.name} · ${Math.round(file.size / 1024)} Ko` : "Choisir un fichier"}</span>
      </span>
      <input type="file" name={name} accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  );
}

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
    <section className="card option-section stacked" aria-labelledby="fw-title">
      <div className="card-head"><h2 id="fw-title"><CloudArrowUpIcon size={18} aria-hidden />Firmwares</h2></div>
      <div className="card-body stack" style={{ paddingTop: "0.5rem" }}>
        <p className="muted small">
          Dans le repo firmware : <code>pio run</code> puis <code>tools/sign_firmware.sh</code>. L'image contient le Wi-Fi et le jeton du
          <code> .env</code> : compile-la pour la carte visée. Elle n'est jamais publique, la carte la télécharge par un lien signé valable 24 h.
        </p>
        <form className="upload-grid" onSubmit={upload}>
          <Field label="Version"><input className="input mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.1.0" pattern="[A-Za-z0-9._\-]{1,32}" required /></Field>
          <FileDrop name="firmware" label="firmware.bin" accept=".bin" file={bin} onFile={setBin} />
          <FileDrop name="signature" label="firmware.sig" accept=".sig" file={sig} onFile={setSig} />
          <Button type="submit" variant="primary" loading={busy} disabled={!version.trim() || !bin || !sig}>Envoyer</Button>
        </form>
        {error && <p className="field-error small" role="alert">{error}</p>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Version</th><th>Taille</th><th className="hide-sm">Envoyé</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {list.data?.firmware.map((f) => (
              <tr key={f.version}>
                <td><code>{f.version}</code></td>
                <td className="num">{Math.round(f.size / 1024)} Ko</td>
                <td className="hide-sm">{dateTime(f.uploaded_at)}</td>
                <td className="actions">
                  <Button size="sm" variant="ghost" className="danger-text" icon={<TrashIcon size={16} aria-hidden />}
                          onClick={async () => {
                            if (await confirm({ title: `Supprimer le firmware ${f.version} ?`, body: "Les mises à jour déjà en cours vers cette version échoueront.", confirmLabel: "Supprimer", danger: true })) {
                              api.deleteFirmware(f.version).then(() => { toast("good", "Firmware supprimé."); list.reload(); }, (err: Error) => toast("bad", err.message));
                            }
                          }}>Supprimer</Button>
                </td>
              </tr>
            ))}
            {list.data?.firmware.length === 0 && <tr><td colSpan={4} className="muted small">Aucun firmware envoyé.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
