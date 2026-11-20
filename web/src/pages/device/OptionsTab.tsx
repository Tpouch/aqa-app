import {
  EyeIcon, EyeSlashIcon, IdentificationCardIcon, KeyIcon, MapPinIcon, ShieldWarningIcon,
  SlidersHorizontalIcon, TrashIcon, WarningIcon, WifiHighIcon,
} from "@phosphor-icons/react";
import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../api";
import { FirmwareSection } from "../../components/FirmwareSection";
import { TokenReveal } from "../../components/TokenReveal";
import { Button, Field, useConfirm, useToast } from "../../components/ui";
import type { DeviceSummary } from "../../../../server/src/types";
import type { Send } from "./DevicePage";
import { SignalBadge } from "./shared";

const WIFI_MIN_FIRMWARE = "2.1.0";

function versionAtLeast(v: string | undefined, min: string): boolean {
  if (!v) return false;
  const a = v.split(".").map((n) => parseInt(n, 10) || 0);
  const b = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}

export function OptionsTab({ device, send, reloadDevice, onDeleted }: { device: DeviceSummary; send: Send; reloadDevice: () => void; onDeleted: () => void }) {
  return (
    <div className="options">
      <NameSection device={device} reload={reloadDevice} />
      <WifiSection device={device} send={send} />
      <GeohashSection device={device} send={send} />
      <ParamsSection device={device} send={send} />
      <FirmwareSection />
      <DangerSection device={device} onDeleted={onDeleted} />
    </div>
  );
}

function Section({ icon, title, description, children, tone }: { icon: ReactNode; title: string; description: ReactNode; children: ReactNode; tone?: "danger" }) {
  const id = `opt-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className={`card option-section ${tone ?? ""}`} aria-labelledby={id}>
      <div className="option-intro">
        <h2 id={id}>{icon}{title}</h2>
        <p className="muted small">{description}</p>
      </div>
      <div className="option-body">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- name

function NameSection({ device, reload }: { device: DeviceSummary; reload: () => void }) {
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
    <Section icon={<IdentificationCardIcon size={18} aria-hidden />} title="Nom" description="Affiché dans le tableau de bord. Ne change rien sur la carte.">
      <form className="row" onSubmit={save}>
        <Field label="Nom de la carte"><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || name.trim() === device.name}>Enregistrer</Button>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------- wifi

function WifiSection({ device, send }: { device: DeviceSummary; send: Send }) {
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
    <Section icon={<WifiHighIcon size={18} aria-hidden />} title="Wi-Fi"
             description={<>Réseau actuel : {s ? <><strong>{s.ssid}</strong> · {s.rssi} dBm <SignalBadge rssi={s.rssi} /></> : "inconnu"}</>}>
      {!supported && (
        <div className="callout warn" style={{ marginBottom: "1rem" }}>
          <WarningIcon size={18} aria-hidden />
          <span>Nécessite le firmware {WIFI_MIN_FIRMWARE} ou plus (la carte a {s ? `v${s.firmware_version}` : "une version inconnue"}). Sinon elle refusera la commande.</span>
        </div>
      )}
      <form className="stack" onSubmit={submit} style={{ paddingTop: 0 }}>
        <div className="segmented" role="radiogroup" aria-label="Type de réseau">
          <button type="button" role="radio" aria-checked={mode === "psk"} aria-pressed={mode === "psk"} onClick={() => setMode("psk")}>Maison (WPA2)</button>
          <button type="button" role="radio" aria-checked={mode === "eap"} aria-pressed={mode === "eap"} onClick={() => setMode("eap")}>Entreprise (PEAP)</button>
        </div>
        <Field label="Nom du réseau (SSID)">
          <input className="input" value={ssid} onChange={(e) => setSsid(e.target.value)} maxLength={32} required autoComplete="off" />
        </Field>
        {mode === "eap" && (
          <div className="range-fields">
            <Field label="Identifiant"><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={64} autoComplete="off" /></Field>
            <Field label="Identité anonyme" hint="Facultatif, vide = identifiant"><input className="input" value={identity} onChange={(e) => setIdentity(e.target.value)} maxLength={64} autoComplete="off" /></Field>
          </div>
        )}
        <Field label="Mot de passe" error={error} hint={mode === "psk" ? "Vide pour un réseau ouvert." : "Effacé du serveur dès que la carte a répondu."}>
          <div className="password">
            <input className="input" type={show ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                   maxLength={mode === "psk" ? 63 : 64} autoComplete="new-password" aria-invalid={error ? true : undefined} />
            <Button type="button" variant="ghost" size="sm" iconOnly aria-pressed={show}
                    icon={show ? <EyeSlashIcon size={18} aria-hidden /> : <EyeIcon size={18} aria-hidden />}
                    onClick={() => setShow((v) => !v)}>{show ? "Masquer" : "Afficher"}</Button>
          </div>
        </Field>
        <div className="toolbar">
          <Button type="submit" variant="primary" loading={busy} disabled={!ssid.trim()}>Changer de réseau</Button>
          <Button type="button" variant="ghost" onClick={reset}>Revenir au Wi-Fi du firmware</Button>
        </div>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------- position

function GeohashSection({ device, send }: { device: DeviceSummary; send: Send }) {
  const [geohash, setGeohash] = useState("");
  return (
    <Section icon={<MapPinIcon size={18} aria-hidden />} title="Position"
             description={<>Géohash associé aux mesures, actuellement <code>{device.status?.geohash ?? "?"}</code>. Trouve le tien sur geohash.softeng.co.</>}>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await send("geohash", { geohash: geohash.trim().toLowerCase() })) setGeohash(""); }}>
        <Field label="Nouveau géohash" hint="1 à 12 caractères, ex. u09tv (Paris)">
          <input className="input mono" value={geohash} onChange={(e) => setGeohash(e.target.value)} maxLength={12} autoCapitalize="none" spellCheck={false}
                 pattern="[0-9b-hjkmnp-zB-HJKMNP-Z]{1,12}" />
        </Field>
        <Button type="submit" disabled={!geohash.trim()}>Appliquer</Button>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------- parameters

function ParamsSection({ device, send }: { device: DeviceSummary; send: Send }) {
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
    <Section icon={<SlidersHorizontalIcon size={18} aria-hidden />} title="Paramètres"
             description="Valeurs numériques stockées sur la carte (NVS), conservées au redémarrage. Le firmware actuel les garde sans encore les utiliser.">
      {Object.keys(current).length > 0 && (
        <dl className="kv" style={{ marginBottom: "1rem" }}>
          {Object.entries(current).map(([k, v]) => <Fragment key={k}><dt><code>{k}</code></dt><dd>{v}</dd></Fragment>)}
        </dl>
      )}
      <form className="stack" style={{ paddingTop: 0 }} onSubmit={submit}>
        {rows.map((r, i) => (
          <div key={i} className="range-fields">
            <Field label={i === 0 ? "Nom" : ""}><input className="input mono" value={r.key} maxLength={15} aria-label={`Nom du paramètre ${i + 1}`}
              onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} /></Field>
            <Field label={i === 0 ? "Valeur" : ""}><input className="input mono" value={r.value} inputMode="decimal" aria-label={`Valeur du paramètre ${i + 1}`}
              onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} /></Field>
          </div>
        ))}
        {error && <p className="field-error small" role="alert">{error}</p>}
        <div className="toolbar">
          <Button type="submit">Envoyer</Button>
          <Button type="button" variant="ghost" onClick={() => setRows([...rows, { key: "", value: "" }])}>+ Ajouter une ligne</Button>
        </div>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------- danger zone

function DangerSection({ device, onDeleted }: { device: DeviceSummary; onDeleted: () => void }) {
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
      body: "La carte et TOUTES ses mesures, commandes et entrées de journal seront effacées, et tu reviendras à l'écran d'ajout. C'est définitif : exporte les données (CSV) avant.",
      confirmLabel: "Supprimer définitivement", danger: true,
    })) return;
    try {
      await api.deleteDevice(device.id);
      toast("good", `${device.name} supprimée.`);
      onDeleted();
    } catch (err) {
      toast("bad", (err as Error).message);
    }
  }

  return (
    <Section tone="danger" icon={<ShieldWarningIcon size={18} aria-hidden />} title="Zone sensible" description="Actions irréversibles.">
      <div className="danger-list">
        <div>
          <strong><KeyIcon size={16} aria-hidden /> Nouveau jeton</strong>
          <p className="muted small">Si le jeton a fuité ou est perdu. Il faudra reflasher la carte.</p>
        </div>
        <Button onClick={rotate}>Générer</Button>
        <div>
          <strong><TrashIcon size={16} aria-hidden /> Supprimer la carte</strong>
          <p className="muted small">Efface la carte et tout son historique.</p>
        </div>
        <Button variant="danger" onClick={remove}>Supprimer</Button>
      </div>
      <TokenReveal deviceId={device.id} token={token} onClose={() => setToken(null)} />
    </Section>
  );
}
