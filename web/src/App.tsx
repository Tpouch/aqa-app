import { useCallback, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { Sidebar } from "./components/Sidebar";
import { ConfirmProvider, Skeleton, ToastProvider } from "./components/ui";
import { DevicePage } from "./pages/device/DevicePage";
import { Login } from "./pages/Login";
import { Setup } from "./pages/Setup";
import { parseRoute, TAB_LABEL, type Tab } from "./routes";
import { useSelection } from "./selection";
import { useNow, usePoll } from "./util";

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
  const [pending, setPending] = useState(0);
  const [chosen, setChosen] = useState(() => localStorage.getItem("aqa-device") ?? "");
  const tab = useRoute(setChosen);
  const [selection, setSelection] = useSelection();
  const now = useNow();

  const list = devices.data?.devices ?? [];
  const device = list.find((d) => d.id === chosen) ?? list[0];

  useEffect(() => {
    if (device) localStorage.setItem("aqa-device", device.id);
  }, [device]);
  useEffect(() => {
    document.title = device ? `${TAB_LABEL[tab]} · ${device.name} · AQA` : "AQA";
  }, [tab, device]);

  const onPendingChange = useCallback((n: number) => setPending(n), []);

  // No board registered yet: full screen, no column (there is nothing to read).
  if (devices.data && !device) {
    return (
      <>
        <a className="sr-only skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
          Aller au contenu
        </a>
        <main id="main" tabIndex={-1} className="setup">
          <Setup unknown={devices.data.unknown} onDone={() => { devices.reload(); window.location.hash = "/mesures"; }} />
        </main>
      </>
    );
  }

  return (
    <div className="shell">
      <a className="sr-only skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        Aller au contenu
      </a>
      <Sidebar devices={list} device={device} onDevice={setChosen} tab={tab} selection={selection} onSelection={setSelection}
               pending={pending} now={now} onLogout={() => api.logout().finally(onLogout)} />
      <main id="main" className="shell-main" tabIndex={-1}>
        {devices.error && !devices.data ? (
          <p className="callout warn" role="alert"><span aria-hidden>▲</span> {devices.error}</p>
        ) : !devices.data ? (
          <Skeleton height={400} />
        ) : !device ? null : (
          <DevicePage key={device.id} id={device.id} tab={tab} selection={selection} onSelection={setSelection}
                      onPendingChange={onPendingChange} onDeviceChanged={devices.reload}
                      onDeleted={() => { localStorage.removeItem("aqa-device"); devices.reload(); window.location.hash = "/mesures"; }} />
        )}
      </main>
    </div>
  );
}
