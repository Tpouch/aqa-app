import { useState, type FormEvent } from "react";
import { api } from "../api";
import { TokenReveal } from "../components/TokenReveal";
import { Button, Field, useToast } from "../components/ui";
import type { UnknownDevice } from "../../../server/src/types";
import { ago, useNow } from "../util";
import { t } from "../i18n/dict";
import { getLang } from "../i18n/lang";

const ID_RE = /^aqa-[0-9A-F]{12}$/;

// Registers a board and shows its token once: on first run (no board yet,
// full screen), or from the column's "+ ajouter une carte" link.
export function Setup({ unknown, first, onDone }: { unknown: UnknownDevice[]; first: boolean; onDone: (id: string | null) => void }) {
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
      setIdError(t().setup.idFormat);
      return;
    }
    setBusy(true);
    try {
      const res = await api.addDevice(normalized, newName.trim() || t().setup.defaultName);
      setSecret({ id: res.device.id, token: res.token });
      toast("good", t().setup.added(res.device.name));
    } catch (err) {
      setIdError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const d = t().setup;
  const en = getLang() === "en";
  return (
    <div className="setup-panel">
      <header>
        {first ? <div className="label-caps login-brand">AQA</div> : <a className="sb-link setup-back" href="#/mesures">{d.back}</a>}
        <h1>{first ? d.titleFirst : d.title}</h1>
        <p className="muted small">{first ? d.introFirst : d.intro}</p>
      </header>

      {unknown.length > 0 && (
        <section aria-labelledby="unknown-title">
          <h2 id="unknown-title" className="label-caps">{d.unknownTitle}</h2>
          <p className="muted small">{d.unknownIntro}</p>
          <table className="st-table">
            <thead>
              <tr><th scope="col">{d.colId}</th><th scope="col">{d.colSeen}</th><th scope="col" className="hide-sm">IP</th><th scope="col"><span className="sr-only">{d.actions}</span></th></tr>
            </thead>
            <tbody>
              {unknown.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{ago(u.last_seen, now)}</td>
                  <td className="hide-sm">{u.ip ?? "—"}</td>
                  <td className="st-td-actions">
                    <Button size="sm" onClick={() => { setNewId(u.id); setIdError(null); }}>{d.add}<span className="sr-only"> {u.id}</span></Button>{" "}
                    <Button size="sm" variant="ghost" onClick={() => api.forgetUnknown(u.id)}>{d.forget}<span className="sr-only"> {u.id}</span></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <form className="st-stack" onSubmit={add} noValidate>
        <Field label={d.idLabel} error={idError}
               hint={en ? <>Shown at boot in the serial log (<code>sensor id aqa-…</code>) and in the TUI.</> : <>Affiché au démarrage dans le log série (<code>sensor id aqa-…</code>) et dans le TUI.</>}>
          <input className="input mono" value={newId} placeholder="aqa-24A160B3C8F0" spellCheck={false} autoCapitalize="none" autoFocus
                 onChange={(e) => { setNewId(e.target.value); setIdError(null); }} aria-invalid={idError ? true : undefined} />
        </Field>
        <Field label={d.nameLabel} hint={d.nameHint}>
          <input className="input" value={newName} maxLength={60} placeholder={d.defaultName} onChange={(e) => setNewName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!newId.trim()}>{d.submit}</Button>
      </form>

      <ol className="steps small muted">
        {en ? <>
          <li>A token appears: copy it into <code>DEVICE_TOKEN</code> in the firmware's <code>.env</code>.</li>
          <li>Rebuild and flash the board (<code>pio run -t upload</code>, or the TUI).</li>
          <li>The first readings show up here in less than a minute.</li>
        </> : <>
          <li>Un jeton s'affiche : copie-le dans <code>DEVICE_TOKEN</code> du <code>.env</code> du firmware.</li>
          <li>Recompile et flashe la carte (<code>pio run -t upload</code>, ou le TUI).</li>
          <li>Les premières mesures apparaissent ici en moins d'une minute.</li>
        </>}
      </ol>
      <TokenReveal deviceId={secret?.id ?? ""} token={secret?.token ?? null} onClose={() => { const id = secret?.id ?? null; setSecret(null); onDone(id); }} />
    </div>
  );
}
