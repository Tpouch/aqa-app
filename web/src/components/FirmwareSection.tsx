import { useState, type FormEvent } from "react";
import { api } from "../api";
import { dateTime, usePoll } from "../util";
import { Setting } from "./Setting";
import { Button, Field, useConfirm, useToast } from "./ui";
import { t } from "../i18n/dict";
import { getLang } from "../i18n/lang";

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
    if (!bin || !sig) return setError(t().firmware.pickFiles);
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("version", version.trim());
    form.append("firmware", bin);
    form.append("signature", sig);
    try {
      await api.uploadFirmware(form);
      toast("good", t().firmware.sent(version.trim()));
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
    <Setting title={t().firmware.title}
             help={getLang() === "en"
               ? <>In the firmware repo: <code>pio run</code> then <code>tools/sign_firmware.sh</code>. The image holds the Wi-Fi and the token from
                 <code> .env</code>: build it for the target board. The app recognises the board by its token and offers the image to it only.
                 It is never public; the board downloads it through a signed link valid for 24 h.</>
               : <>Dans le repo firmware : <code>pio run</code> puis <code>tools/sign_firmware.sh</code>. L'image contient le Wi-Fi et le jeton du
               <code> .env</code> : compile-la pour la carte visée. L'app reconnaît la carte à son jeton et ne propose l'image qu'à elle.
               Elle n'est jamais publique, la carte la télécharge par un lien signé valable 24 h.</>}>
      <form className="st-stack" onSubmit={upload}>
        <Field label="Version"><input className="input mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.1.0" pattern="[A-Za-z0-9._\-]{1,32}" required /></Field>
        <Field label={t().firmware.image} hint={bin ? `${Math.round(bin.size / 1024)} ${t().card.kb}` : undefined}>
          <input className="input" type="file" name="firmware" accept=".bin" onChange={(e) => setBin(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label={t().firmware.signature} hint={sig ? `${Math.round(sig.size / 1024)} ${t().card.kb}` : undefined}>
          <input className="input" type="file" name="signature" accept=".sig" onChange={(e) => setSig(e.target.files?.[0] ?? null)} />
        </Field>
        {error && <p className="field-error small tone-bad" role="alert">{error}</p>}
        <div className="st-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!version.trim() || !bin || !sig}>{t().firmware.send}</Button>
        </div>
      </form>
      <table className="st-table">
        <thead><tr><th>Version</th><th>{t().firmware.colBoard}</th><th>{t().firmware.colSize}</th><th className="hide-sm">{t().firmware.colSent}</th><th><span className="sr-only">{t().card.actions}</span></th></tr></thead>
        <tbody>
          {list.data?.firmware.map((f) => (
            <tr key={f.version}>
              <td><code>{f.version}</code></td>
              <td>{f.device_name ?? (
                <span className="tone-bad" title={t().firmware.noBoardTitle}>
                  <span aria-hidden>▲ </span>{t().firmware.noBoard}
                </span>
              )}</td>
              <td className="num">{Math.round(f.size / 1024)} {t().card.kb}</td>
              <td className="hide-sm">{dateTime(f.uploaded_at)}</td>
              <td className="st-td-actions">
                <Button size="sm" variant="danger"
                        onClick={async () => {
                          if (await confirm({ title: t().firmware.deleteTitle(f.version), body: t().firmware.deleteBody, confirmLabel: t().firmware.delete, danger: true })) {
                            api.deleteFirmware(f.version).then(() => { toast("good", t().firmware.deleted); list.reload(); }, (err: Error) => toast("bad", err.message));
                          }
                        }}>{t().firmware.delete} {f.version}</Button>
              </td>
            </tr>
          ))}
          {list.data?.firmware.length === 0 && <tr><td colSpan={5} className="muted small">{t().firmware.none}</td></tr>}
        </tbody>
      </table>
    </Setting>
  );
}
