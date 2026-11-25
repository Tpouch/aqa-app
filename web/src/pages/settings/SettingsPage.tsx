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
import { t } from "../../i18n/dict";

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
      <h2 className="st-title">{t().settings.title(device.name)}</h2>
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
      toast("good", t().settings.nameSaved);
      reload();
    } catch (err) {
      toast("bad", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Setting title={t().settings.name} help={t().settings.nameHelp}>
      <form className="st-row" onSubmit={save}>
        <Field label={t().settings.boardName}><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || name.trim() === device.name}>{t().settings.save}</Button>
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
      toast("good", t().settings.calibrated(fmt(res.value.db_ref, 1), fmt(res.value.snd_ref)));
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
      title: t().settings.clearCalTitle,
      body: t().settings.clearCalBody,
      confirmLabel: t().settings.clear, danger: true,
    })) return;
    try {
      await api.updateDevice(device.id, { sound_calibration: null });
      toast("good", t().settings.calCleared);
      reload();
    } catch (err) {
      toast("bad", (err as Error).message);
    }
  }

  return (
    <Setting title={t().settings.calTitle} help={t().settings.calHelp}>
      <p className="st-current">
        {t().settings.calCurrent}{" "}
        {cal ? <strong>{t().settings.calValue(fmt(cal.db_ref, 1), fmt(cal.snd_ref))}</strong> : <span className="muted">{t().settings.notCalibrated}</span>}
      </p>
      <form className="st-row" onSubmit={save}>
        <Field label={<>{t().settings.measuredLevel} (<span className="unit">dB</span>)</>} error={error}>
          <input className="input mono" inputMode="decimal" value={db} autoComplete="off" aria-invalid={error ? true : undefined}
                 onChange={(e) => { setDb(e.target.value); setError(null); }} />
        </Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!db.trim()}>{t().settings.calibrateNow}</Button>
        {cal && <Button type="button" variant="ghost" onClick={clear}>{t().settings.clear}</Button>}
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
  const sig = t().card.signal;
  const signal = s ? (s.rssi < -80 ? [sig.weak, "tone-warn"] : s.rssi < -70 ? [sig.medium, "muted"] : [sig.good, "tone-good"]) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "psk" && password.length > 0 && password.length < 8) return setError(t().settings.wpaMin);
    if (mode === "eap" && (!username || !password)) return setError(t().settings.eapRequired);
    setError(null);
    const ok = await confirm({
      title: t().settings.wifiTitle(ssid),
      body: t().settings.wifiBody,
      confirmLabel: t().settings.changeNetwork,
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
      title: t().settings.wifiResetTitle,
      body: t().settings.wifiResetBody,
      confirmLabel: t().settings.wifiResetConfirm,
    })) await send("wifi", { reset: true });
  }

  return (
    <Setting title="Wi-Fi"
             help={<>{t().settings.currentNetwork}{s && signal ? <><strong>{s.ssid}</strong> · {s.rssi} dBm <span className={signal[1]}>{signal[0]}</span></> : t().settings.unknown}</>}>
      {!supported && (
        <p className="st-warn tone-warn small" role="note">
          <span aria-hidden>▲ </span>{t().settings.needsFirmware(WIFI_MIN_FIRMWARE, s ? `v${s.firmware_version}` : null)}
        </p>
      )}
      <form className="st-stack" onSubmit={submit}>
        <div className="seg" role="group" aria-label={t().settings.networkType}>
          <button type="button" aria-pressed={mode === "psk"} onClick={() => setMode("psk")}>{t().settings.home}</button>
          <button type="button" aria-pressed={mode === "eap"} onClick={() => setMode("eap")}>{t().settings.enterprise}</button>
        </div>
        <Field label={t().settings.ssid}>
          <input className="input" value={ssid} onChange={(e) => setSsid(e.target.value)} maxLength={32} required autoComplete="off" />
        </Field>
        {mode === "eap" && (
          <div className="st-pair">
            <Field label={t().settings.username}><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={64} autoComplete="off" /></Field>
            <Field label={t().settings.identity} hint={t().settings.identityHint}><input className="input" value={identity} onChange={(e) => setIdentity(e.target.value)} maxLength={64} autoComplete="off" /></Field>
          </div>
        )}
        <Field label={t().settings.password} error={error} hint={mode === "psk" ? t().settings.openHint : t().settings.erasedHint}>
          <div className="st-password">
            <input className="input" type={show ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                   maxLength={mode === "psk" ? 63 : 64} autoComplete="new-password" aria-invalid={error ? true : undefined} />
            <Button type="button" variant="ghost" size="sm" aria-pressed={show} onClick={() => setShow((v) => !v)}>{show ? t().settings.hide : t().settings.show}</Button>
          </div>
        </Field>
        <div className="st-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!ssid.trim()}>{t().settings.changeNetwork}</Button>
          <Button type="button" variant="ghost" onClick={reset}>{t().settings.wifiReset}</Button>
        </div>
      </form>
    </Setting>
  );
}

// ---------------------------------------------------------------- position

function GeohashRow({ device, send }: { device: DeviceSummary; send: Send }) {
  const [geohash, setGeohash] = useState("");
  return (
    <Setting title={t().settings.position}
             help={<>{t().settings.geohashHelp1}<code>{device.status?.geohash ?? "?"}</code>{t().settings.geohashHelp2}</>}>
      <form className="st-row" onSubmit={async (e) => { e.preventDefault(); if (await send("geohash", { geohash: geohash.trim().toLowerCase() })) setGeohash(""); }}>
        <Field label={t().settings.newGeohash} hint={t().settings.geohashHint}>
          <input className="input mono" value={geohash} onChange={(e) => setGeohash(e.target.value)} maxLength={12} autoCapitalize="none" spellCheck={false}
                 pattern="[0-9b-hjkmnp-zB-HJKMNP-Z]{1,12}" />
        </Field>
        <Button type="submit" disabled={!geohash.trim()}>{t().settings.apply}</Button>
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
      if (!Number.isFinite(n)) return setError(t().settings.numberExpected(r.key));
      if (r.key.length > 15) return setError(t().settings.keyMax(r.key));
      params[r.key.trim()] = n;
    }
    if (Object.keys(params).length === 0) return setError(t().settings.addOneParam);
    setError(null);
    if (await send("config", params)) setRows([{ key: "", value: "" }]);
  }

  return (
    <Setting title={t().settings.params}
             help={t().settings.paramsHelp}>
      {Object.keys(current).length > 0 && (
        <dl className="st-kv">
          {Object.entries(current).map(([k, v]) => <Fragment key={k}><dt><code>{k}</code></dt><dd>{v}</dd></Fragment>)}
        </dl>
      )}
      <form className="st-stack" onSubmit={submit}>
        {rows.map((r, i) => (
          <div key={i} className="st-pair">
            <Field label={i === 0 ? t().settings.name : ""}><input className="input mono" value={r.key} maxLength={15} aria-label={t().settings.paramName(i + 1)}
              onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} /></Field>
            <Field label={i === 0 ? t().settings.value : ""}><input className="input mono" value={r.value} inputMode="decimal" aria-label={t().settings.paramValue(i + 1)}
              onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} /></Field>
          </div>
        ))}
        {error && <p className="field-error small tone-bad" role="alert">{error}</p>}
        <div className="st-actions">
          <Button type="submit">{t().settings.send}</Button>
          <Button type="button" variant="ghost" onClick={() => setRows([...rows, { key: "", value: "" }])}>{t().settings.addRow}</Button>
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
      title: t().settings.rotateTitle,
      body: t().settings.rotateBody,
      confirmLabel: t().settings.generate, danger: true,
    })) return;
    try {
      setToken((await api.rotateToken(device.id)).token);
    } catch (err) {
      toast("bad", (err as Error).message);
    }
  }

  async function remove() {
    if (!await confirm({
      title: t().settings.deleteTitle(device.name),
      body: deleteBody(next),
      confirmLabel: t().settings.deleteForever, danger: true,
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
    <Setting tone="bad" title={t().settings.danger} help={t().settings.dangerHelp}>
      <ul className="st-danger">
        <li>
          <p className="small"><strong>{t().settings.newToken}</strong><span className="muted">{t().settings.newTokenNote}</span></p>
          <Button variant="danger" onClick={rotate}>{t().settings.newToken}</Button>
        </li>
        <li>
          <p className="small"><strong>{t().settings.deleteBoard}</strong><span className="muted">{t().settings.deleteBoardNote}</span></p>
          <Button variant="danger" onClick={remove}>{t().settings.deleteBoard}</Button>
        </li>
      </ul>
      <TokenReveal deviceId={device.id} token={token} onClose={() => setToken(null)} />
    </Setting>
  );
}
