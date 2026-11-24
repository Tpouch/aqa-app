import { Fragment, useState, type FormEvent } from "react";
import { api } from "../../api";
import { FirmwareSection } from "../../components/FirmwareSection";
import { ApiKeysSection } from "./ApiKeysSection";
import { Setting } from "../../components/Setting";
import { TokenReveal } from "../../components/TokenReveal";
import { Button, Field, Skeleton, useConfirm, useToast } from "../../components/ui";
import type { DeviceSummary } from "../../../../server/src/types";
import { fmt, nowS } from "../../util";
import type { Send } from "../device/DevicePage";
import { deleteBody, deletedToast } from "./deleteText";
import { calibrationFrom } from "./calibration";

const WIFI_MIN_FIRMWARE = "2.1.0";

function versionAtLeast(v: string | undefined, min: string): boolean {
  if (!v) return false;
  const a = v.split(".").map((n) => parseInt(n, 10) || 0);
  const b = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}

export function SettingsPage({ device, next, send, reloadDevice, onDeleted }: {
  device: DeviceSummary | null;
  next: string | null; // board shown once this one is deleted, null if it is the last
  send: Send; reloadDevice: () => void; onDeleted: () => void;
}) {
  if (!device) return <Skeleton height={400} />;
  return (
    <div className="st">
      <h2 className="st-title">Réglages · {device.name}</h2>
      <NameRow device={device} reload={reloadDevice} />
      <CalibrationRow device={device} reload={reloadDevice} />
      <WifiRow device={device} send={send} />
      <GeohashRow device={device} send={send} />
      <ParamsRow device={device} send={send} />
      <FirmwareSection />
      <ApiKeysSection />
      <DangerZone device={device} next={next} onDeleted={onDeleted} />
    </div>
  );
}

// ---------------------------------------------------------------- name

function NameRow({ device, reload }: { device: DeviceSummary; reload: () => void }) {
  const [name, setName] = useState(device.name);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateDevice(device.id, { name: name.trim() });
      toast("good", "Nom enregistré.");
      reload();
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Setting title="Nom" help="Affiché dans le tableau de bord. Ne change rien sur la carte.">
      <form className="st-row" onSubmit={save}>
        <Field label="Nom de la carte"><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || name.trim() === device.name}>Enregistrer</Button>
      </form>
    </Setting>
  );
}

// ---------------------------------------------------------------- sound calibration

function CalibrationRow({ device, reload }: { device: DeviceSummary; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [db, setDb] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cal = device.sound_calibration;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Fresh summary: the polled one can be up to 15 s old.
      const fresh = await api.device(device.id);
      const res = calibrationFrom(fresh.latest, nowS(), db);
      if (!res.ok) return setError(res.error);
      await api.updateDevice(device.id, { sound_calibration: res.value });
      toast("good", `Son calibré : ${fmt(res.value.db_ref, 1)} dB pour une amplitude de ${fmt(res.value.snd_ref)}.`);
      setDb("");
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!await confirm({
      title: "Effacer la calibration du son ?",
      body: "Le son repasse en amplitude brute dans les mesures et la colonne de gauche.",
      confirmLabel: "Effacer", danger: true,
    })) return;
    try {
      await api.updateDevice(device.id, { sound_calibration: null });
      toast("good", "Calibration effacée.");
      reload();
    } catch (err) {
      toast("bad", (err as Error).message);
    }
  }

  return (
    <Setting title="Calibrer le son" help="Mesure le niveau de la pièce avec une appli sonomètre, puis saisis-le.">
      <p className="st-current">
        Calibration actuelle :{" "}
        {cal ? <strong>{fmt(cal.db_ref, 1)} dB pour une amplitude de {fmt(cal.snd_ref)}</strong> : <span className="muted">non calibré</span>}
      </p>
      <form className="st-row" onSubmit={save}>
        <Field label={<>Niveau mesuré (<span className="unit">dB</span>)</>} error={error}>
          <input className="input mono" inputMode="decimal" value={db} autoComplete="off" aria-invalid={error ? true : undefined}
                 onChange={(e) => { setDb(e.target.value); setError(null); }} />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!db.trim()}>Calibrer maintenant</Button>
        {cal && <Button type="button" variant="ghost" onClick={clear}>Effacer</Button>}
      </form>
    </Setting>
  );
}

// ---------------------------------------------------------------- wifi

function WifiRow({ device, send }: { device: DeviceSummary; send: Send }) {
  const confirm = useConfirm();
  const [mode, setMode] = useState<"psk" | "eap">("psk");
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [identity, setIdentity] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = device.status;
  const supported = versionAtLeast(s?.firmware_version, WIFI_MIN_FIRMWARE);
  const signal = s ? (s.rssi < -80 ? ["faible", "tone-warn"] : s.rssi < -70 ? ["moyen", "muted"] : ["bon", "tone-good"]) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "psk" && password.length > 0 && password.length < 8) return setError("Un mot de passe WPA2 fait au moins 8 caractères.");
    if (mode === "eap" && (!username || !password)) return setError("Identifiant et mot de passe requis.");
    setError(null);
    const ok = await confirm({
      title: `Passer la carte sur « ${ssid} » ?`,
      body: "La carte essaie le nouveau réseau pendant 20 s environ. Si la connexion échoue, elle revient automatiquement sur le réseau actuel et la commande passe en échec.",
      confirmLabel: "Changer de réseau",
    });
    if (!ok) return;
    setBusy(true);
    const params = mode === "psk"
      ? { ssid, password }
      : { ssid, eap_username: username, eap_password: password, ...(identity ? { eap_identity: identity } : {}) };
    if (await send("wifi", params)) { setPassword(""); }
    setBusy(false);
  }

  async function reset() {
    if (await confirm({
      title: "Revenir au Wi-Fi du firmware ?",
      body: "La carte oublie le réseau configuré à distance et reprend celui de son .env (avec le même retour automatique en cas d'échec).",
      confirmLabel: "Revenir au réseau d'origine",
    })) await send("wifi", { reset: true });
  }

  return (
    <Setting title="Wi-Fi"
             help={<>Réseau actuel : {s && signal ? <><strong>{s.ssid}</strong> · {s.rssi} dBm <span className={signal[1]}>{signal[0]}</span></> : "inconnu"}</>}>
      {!supported && (
        <p className="st-warn tone-warn small" role="note">
          <span aria-hidden>▲ </span>Nécessite le firmware {WIFI_MIN_FIRMWARE} ou plus (la carte a {s ? `v${s.firmware_version}` : "une version inconnue"}). Sinon elle refusera la commande.
        </p>
      )}
      <form className="st-stack" onSubmit={submit}>
        <div className="seg" role="group" aria-label="Type de réseau">
          <button type="button" aria-pressed={mode === "psk"} onClick={() => setMode("psk")}>Maison (WPA2)</button>
          <button type="button" aria-pressed={mode === "eap"} onClick={() => setMode("eap")}>Entreprise (PEAP)</button>
        </div>
        <Field label="Nom du réseau (SSID)">
          <input className="input" value={ssid} onChange={(e) => setSsid(e.target.value)} maxLength={32} required autoComplete="off" />
        </Field>
        {mode === "eap" && (
          <div className="st-pair">
            <Field label="Identifiant"><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={64} autoComplete="off" /></Field>
            <Field label="Identité anonyme" hint="Facultatif, vide = identifiant"><input className="input" value={identity} onChange={(e) => setIdentity(e.target.value)} maxLength={64} autoComplete="off" /></Field>
          </div>
        )}
        <Field label="Mot de passe" error={error} hint={mode === "psk" ? "Vide pour un réseau ouvert." : "Effacé du serveur dès que la carte a répondu."}>
          <div className="st-password">
            <input className="input" type={show ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                   maxLength={mode === "psk" ? 63 : 64} autoComplete="new-password" aria-invalid={error ? true : undefined} />
            <Button type="button" variant="ghost" size="sm" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? "Masquer" : "Afficher"}</Button>
          </div>
        </Field>
        <div className="st-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!ssid.trim()}>Changer de réseau</Button>
          <Button type="button" variant="ghost" onClick={reset}>Revenir au Wi-Fi du firmware</Button>
        </div>
      </form>
    </Setting>
  );
}

// ---------------------------------------------------------------- position

function GeohashRow({ device, send }: { device: DeviceSummary; send: Send }) {
  const [geohash, setGeohash] = useState("");
  return (
    <Setting title="Position"
             help={<>Géohash associé aux mesures, actuellement <code>{device.status?.geohash ?? "?"}</code>. Trouve le tien sur geohash.softeng.co.</>}>
      <form className="st-row" onSubmit={async (e) => { e.preventDefault(); if (await send("geohash", { geohash: geohash.trim().toLowerCase() })) setGeohash(""); }}>
        <Field label="Nouveau géohash" hint="1 à 12 caractères, ex. u09tv (Paris)">
          <input className="input mono" value={geohash} onChange={(e) => setGeohash(e.target.value)} maxLength={12} autoCapitalize="none" spellCheck={false}
                 pattern="[0-9b-hjkmnp-zB-HJKMNP-Z]{1,12}" />
        </Field>
        <Button type="submit" disabled={!geohash.trim()}>Appliquer</Button>
      </form>
    </Setting>
  );
}

// ---------------------------------------------------------------- parameters

function ParamsRow({ device, send }: { device: DeviceSummary; send: Send }) {
  const current = device.status?.parameters ?? {};
  const [rows, setRows] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const params: Record<string, number> = {};
    for (const r of rows) {
      if (!r.key.trim()) continue;
      const n = Number(r.value.replace(",", "."));
      if (!Number.isFinite(n)) return setError(`« ${r.key} » : un nombre est attendu.`);
      if (r.key.length > 15) return setError(`« ${r.key} » : 15 caractères maximum.`);
      params[r.key.trim()] = n;
    }
    if (Object.keys(params).length === 0) return setError("Ajoute au moins un paramètre.");
    setError(null);
    if (await send("config", params)) setRows([{ key: "", value: "" }]);
  }

  return (
    <Setting title="Paramètres"
             help="Valeurs numériques stockées sur la carte (NVS), conservées au redémarrage. Le firmware actuel les garde sans encore les utiliser.">
      {Object.keys(current).length > 0 && (
        <dl className="st-kv">
          {Object.entries(current).map(([k, v]) => <Fragment key={k}><dt><code>{k}</code></dt><dd>{v}</dd></Fragment>)}
        </dl>
      )}
      <form className="st-stack" onSubmit={submit}>
        {rows.map((r, i) => (
          <div key={i} className="st-pair">
            <Field label={i === 0 ? "Nom" : ""}><input className="input mono" value={r.key} maxLength={15} aria-label={`Nom du paramètre ${i + 1}`}
              onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} /></Field>
            <Field label={i === 0 ? "Valeur" : ""}><input className="input mono" value={r.value} inputMode="decimal" aria-label={`Valeur du paramètre ${i + 1}`}
              onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} /></Field>
          </div>
        ))}
        {error && <p className="field-error small tone-bad" role="alert">{error}</p>}
        <div className="st-actions">
          <Button type="submit">Envoyer</Button>
          <Button type="button" variant="ghost" onClick={() => setRows([...rows, { key: "", value: "" }])}>+ Ajouter une ligne</Button>
        </div>
      </form>
    </Setting>
  );
}

// ---------------------------------------------------------------- danger zone

function DangerZone({ device, next, onDeleted }: { device: DeviceSummary; next: string | null; onDeleted: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);

  async function rotate() {
    if (!await confirm({
      title: "Générer un nouveau jeton ?",
      body: "L'ancien jeton cesse de fonctionner immédiatement : la carte ne pourra plus envoyer de mesures tant qu'elle n'est pas reflashée avec le nouveau.",
      confirmLabel: "Générer", danger: true,
    })) return;
    try {
      setToken((await api.rotateToken(device.id)).token);
    } catch (err) {
      toast("bad", (err as Error).message);
    }
  }

  async function remove() {
    if (!await confirm({
      title: `Supprimer ${device.name} ?`,
      body: deleteBody(next),
      confirmLabel: "Supprimer définitivement", danger: true,
    })) return;
    try {
      await api.deleteDevice(device.id);
      toast("good", deletedToast(device.name, next));
      onDeleted();
    } catch (err) {
      toast("bad", (err as Error).message);
    }
  }

  return (
    <Setting tone="bad" title="Zone sensible" help="Actions irréversibles.">
      <ul className="st-danger">
        <li>
          <p className="small"><strong>Nouveau jeton</strong><span className="muted"> · Si le jeton a fuité ou est perdu. Il faudra reflasher la carte.</span></p>
          <Button variant="danger" onClick={rotate}>Nouveau jeton</Button>
        </li>
        <li>
          <p className="small"><strong>Supprimer la carte</strong><span className="muted"> · Efface la carte et tout son historique.</span></p>
          <Button variant="danger" onClick={remove}>Supprimer la carte</Button>
        </li>
      </ul>
      <TokenReveal deviceId={device.id} token={token} onClose={() => setToken(null)} />
    </Setting>
  );
}
