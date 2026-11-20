import { SignOutIcon, WarningIcon, WindIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { Button, ConfirmProvider, Skeleton, ToastProvider } from "./components/ui";
import { DevicePage, TABS, type TabKey } from "./pages/device/DevicePage";
import { Login } from "./pages/Login";
import { Setup } from "./pages/Setup";
import { useHashRoute, usePoll } from "./util";

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

function Shell({ onLogout }: { onLogout: () => void }) {
  const route = useHashRoute();
  const devices = usePoll(api.devices, 15000, []);
  const [pending, setPending] = useState(0);
  const [chosen, setChosen] = useState(() => localStorage.getItem("aqa-device") ?? "");

  // Old links (#/device/<id>/<tab>) still work.
  const legacy = route.match(/^\/device\/(aqa-[0-9A-F]{12})(?:\/(\w+))?$/);
  useEffect(() => {
    if (legacy) {
      setChosen(legacy[1]!);
      window.location.replace(`#/${legacy[2] ?? "overview"}`);
    }
  }, [legacy]);

  const tab: TabKey = TABS.find((t) => `/${t.key}` === route)?.key ?? "overview";
  const list = devices.data?.devices ?? [];
  const device = list.find((d) => d.id === chosen) ?? list[0];

  useEffect(() => {
    if (device) localStorage.setItem("aqa-device", device.id);
  }, [device]);
  useEffect(() => {
    const label = TABS.find((t) => t.key === tab)?.label;
    document.title = device ? `${label} · ${device.name} · AQA` : "AQA";
  }, [tab, device]);

  const onPendingChange = useCallback((n: number) => setPending(n), []);

  return (
    <>
      <a className="sr-only" href="#main">Aller au contenu</a>
      <nav className="topbar" aria-label="Navigation principale">
        <a href="#/overview" className="brand">
          <span className="brand-mark"><WindIcon size={16} weight="bold" aria-hidden /></span>
          <span className="hide-sm">AQA</span>
        </a>
        {device && TABS.map((t) => {
          const Icon = t.icon;
          const current = t.key === tab;
          return (
            <a key={t.key} href={`#/${t.key}`} className="nav-link" aria-current={current ? "page" : undefined} title={t.label}>
              <Icon size={18} weight={current ? "fill" : "regular"} aria-hidden />
              <span className="label">{t.label}</span>
              {t.key === "commands" && pending > 0 && <span className="tab-count" aria-label={`${pending} en cours`}>{pending}</span>}
            </a>
          );
        })}
        <span className="spacer" />
        {list.length > 1 && (
          <select className="input device-switch" value={device?.id} aria-label="Carte affichée" onChange={(e) => setChosen(e.target.value)}>
            {list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <Button variant="ghost" icon={<SignOutIcon size={18} aria-hidden />} title="Déconnexion"
                onClick={() => api.logout().finally(onLogout)}>
          <span className="label hide-sm">Déconnexion</span>
        </Button>
      </nav>
      <main id="main" className="content">
        {devices.error && !devices.data ? (
          <p className="callout warn" role="alert"><WarningIcon size={18} aria-hidden />{devices.error}</p>
        ) : !devices.data ? (
          <Skeleton height={400} />
        ) : !device ? (
          <Setup unknown={devices.data.unknown} onDone={() => { devices.reload(); window.location.hash = "/overview"; }} />
        ) : (
          <DevicePage key={device.id} id={device.id} tab={tab} onPendingChange={onPendingChange}
                      onDeleted={() => { localStorage.removeItem("aqa-device"); devices.reload(); window.location.hash = "/overview"; }} />
        )}
      </main>
    </>
  );
}
