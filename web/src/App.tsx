import { useCallback, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { Sidebar, SessionTools } from "./components/Sidebar";
import { ConfirmProvider, Skeleton, ToastProvider } from "./components/ui";
import { DevicePage } from "./pages/device/DevicePage";
import { MobileEmpty, MobileShell } from "./mobile/MobileShell";
import { usePhone } from "./mobile/usePhone";
import { Login } from "./pages/Login";
import { Setup } from "./pages/Setup";
import { sortDevices } from "./rooms";
import { parseRoute, TAB_LABEL, type Tab } from "./routes";
import { useSelection } from "./selection";
import { storageGet, storageRemove, storageSet } from "./storage";
import { useNow, usePoll } from "./util";
import type { DeviceSummary, UnknownDevice } from "../../server/src/types";

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Gate />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Gate() {
  const [auth, setAuth] = useState<boolean | null>(null);
  useEffect(() => {
    setUnauthorizedHandler(() => setAuth(false));
    api.session().then((s) => setAuth(s.authenticated), () => setAuth(false));
  }, []);
  if (auth === null) return null;
  if (!auth) return <Login onLogin={() => setAuth(true)} />;
  return <Shell onLogout={() => setAuth(false)} />;
}

// Current tab from the hash. Older hashes are replaced by their canonical form;
// a legacy #/device/<id>/<tab> also selects that board.
function useRoute(onLegacyDevice: (id: string) => void): Tab {
  const [hash, setHash] = useState(() => window.location.hash);
  const route = parseRoute(hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    if (route.device) onLegacyDevice(route.device);
    if (route.redirect) {
      window.location.replace(route.redirect);
      setHash(route.redirect);
    }
  }, [route.device, route.redirect, onLegacyDevice]);
  return route.tab;
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const devices = usePoll(api.devices, 15000, []);
  const [chosen, setChosen] = useState(() => storageGet("aqa-device") ?? "");
  const phone = usePhone();
  const now = useNow();

  // Sorted once: the column, the phone's sheet and the default board all follow this order.
  const list = useMemo(() => sortDevices(devices.data?.devices ?? []), [devices.data]);
  const device = list.find((d) => d.id === chosen) ?? list[0];
  const logout = () => { api.logout().finally(onLogout); };

  useEffect(() => {
    if (device) storageSet("aqa-device", device.id);
  }, [device]);

  // A phone gets its own pages; a computer keeps the web view at any width.
  if (phone) {
    if (devices.data && !device) return <MobileEmpty onLogout={logout} />;
    return <MobileShell devices={list} device={device} onDevice={setChosen} onLogout={logout} now={now}
                        error={devices.error && !devices.data ? devices.error : null} />;
  }
  return <WebShell devices={devices} list={list} device={device} onDevice={setChosen} onLogout={logout} now={now} />;
}

function WebShell({ devices, list, device, onDevice, onLogout, now }: {
  devices: ReturnType<typeof usePoll<{ devices: DeviceSummary[]; unknown: UnknownDevice[] }>>;
  list: DeviceSummary[];
  device: DeviceSummary | undefined;
  onDevice: (id: string) => void;
  onLogout: () => void;
  now: number;
}) {
  const [pending, setPending] = useState(0);
  const tab = useRoute(onDevice);
  const [selection, setSelection] = useSelection();

  useEffect(() => {
    document.title = tab === "ajouter" ? `${TAB_LABEL[tab]} · AQA` : device ? `${TAB_LABEL[tab]} · ${device.name} · AQA` : "AQA";
  }, [tab, device]);

  const onPendingChange = useCallback((n: number) => setPending(n), []);

  // No board registered yet: full screen, no column (there is nothing to read).
  if (devices.data && !device) {
    return (
      <>
        <a className="sr-only skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
          Aller au contenu
        </a>
        <div className="setup-tools"><SessionTools onLogout={onLogout} /></div>
        <main id="main" tabIndex={-1} className="setup">
          <Setup unknown={devices.data.unknown} first onDone={() => { devices.reload(); window.location.hash = "/mesures"; }} />
        </main>
      </>
    );
  }

  return (
    <div className="shell">
      <a className="sr-only skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        Aller au contenu
      </a>
      <Sidebar devices={list} device={device} onDevice={onDevice} tab={tab} selection={selection} onSelection={setSelection}
               pending={pending} alerts={device?.open_alerts ?? 0} unknown={devices.data?.unknown.length ?? 0}
               now={now} onLogout={onLogout} />
      <main id="main" className="shell-main" tabIndex={-1}>
        {devices.error && !devices.data ? (
          <p className="callout warn" role="alert"><span aria-hidden>▲</span> {devices.error}</p>
        ) : !devices.data ? (
          <Skeleton height={400} />
        ) : !device ? null : tab === "ajouter" ? (
          <Setup unknown={devices.data.unknown} first={false} onDone={(id) => {
            devices.reload();
            if (id) onDevice(id);
            window.location.hash = "/mesures";
          }} />
        ) : (
          <DevicePage key={device.id} id={device.id} others={list.filter((d) => d.id !== device.id)} tab={tab} selection={selection} onSelection={setSelection}
                      onPendingChange={onPendingChange} onDeviceChanged={devices.reload}
                      onDeleted={() => {
                        // Straight to the board the confirmation named (the first of the others).
                        const next = list.find((d) => d.id !== device.id);
                        if (next) onDevice(next.id); else storageRemove("aqa-device");
                        devices.reload();
                        window.location.hash = "/mesures";
                      }} />
        )}
      </main>
    </div>
  );
}
