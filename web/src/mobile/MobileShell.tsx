import { useEffect, useState } from "react";
import { SessionTools } from "../components/Sidebar";
import { Skeleton } from "../components/ui";
import { parseRoute } from "../routes";
import type { DeviceSummary } from "../../../server/src/types";
import { ago } from "../util";
import { MOBILE_LABEL, parseMobileRoute, type MobileRoute } from "./routes";
import { DashboardPage } from "./DashboardPage";
import { TabBar } from "./TabBar";

// Current mobile tab from the hash. Web and legacy hashes are replaced by
// #/dashboard; a legacy #/device/<id>/... link still selects that board.
export function useMobileRoute(onLegacyDevice: (id: string) => void): MobileRoute {
  const [hash, setHash] = useState(() => window.location.hash);
  const route = parseMobileRoute(hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    const legacy = parseRoute(hash).device;
    if (legacy) onLegacyDevice(legacy);
    if (route.redirect) {
      window.location.replace(route.redirect);
      setHash(route.redirect);
    }
  }, [hash, route.redirect, onLegacyDevice]);
  return route;
}

export function MobileShell({ devices, device, onDevice, onLogout, now, error }: {
  devices: DeviceSummary[];
  device: DeviceSummary | undefined;
  onDevice: (id: string) => void;
  onLogout: () => void;
  now: number;
  error: string | null;
}) {
  const route = useMobileRoute(onDevice);
  const full = route.tab === "graph" && route.metric !== null;

  useEffect(() => {
    document.title = device ? `${MOBILE_LABEL[route.tab]} · ${device.name} · AQA` : "AQA";
  }, [route.tab, device]);

  return (
    <div className={`mb${full ? " mb-full" : ""}`}>
      <a className="sr-only skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        Aller au contenu
      </a>
      {!full && <TopBar devices={devices} device={device} onDevice={onDevice} now={now} />}
      <main id="main" className="mb-main" tabIndex={-1}>
        <h1 className="sr-only">{MOBILE_LABEL[route.tab]}</h1>
        {error ? (
          <p className="callout warn" role="alert"><span aria-hidden>▲</span> {error}</p>
        ) : !device ? (
          <Skeleton height={400} />
        ) : (
          <Page route={route} device={device} now={now} onLogout={onLogout} />
        )}
      </main>
      {!full && <TabBar tab={route.tab} alerts={device?.open_alerts ?? 0} />}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Page({ route, device, now: _now, onLogout }: { route: MobileRoute; device: DeviceSummary; now: number; onLogout: () => void }) {
  switch (route.tab) {
    case "dashboard": return <DashboardPage device={device} onOpen={(m) => { window.location.hash = `/graph/${m}`; }} />;
    case "alertes": return <Placeholder name="Alertes" />;
    case "infos": return <><Placeholder name="Infos" /><SessionTools onLogout={onLogout} /></>;
    case "graph": return <Placeholder name={`Graph ${route.metric ?? ""}`} />;
  }
}

// Temporary until the page lands (Tasks 4 to 6).
function Placeholder({ name }: { name: string }) {
  return <p className="muted">{name}</p>;
}

function TopBar({ devices, device, onDevice, now }: {
  devices: DeviceSummary[];
  device: DeviceSummary | undefined;
  onDevice: (id: string) => void;
  now: number;
}) {
  return (
    <header className="mb-top">
      <span className="mb-brand" aria-hidden>AQA</span>
      {device && (
        <div className="mb-device">
          <span className={device.online ? "tone-good" : "muted"} aria-hidden>{device.online ? "●" : "○"}</span>
          {devices.length > 1 ? (
            <select className="mb-switch" value={device.id} aria-label="Carte affichée" onChange={(e) => onDevice(e.target.value)}>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : (
            <span className="mb-name">{device.name}</span>
          )}
          <span className="mb-ago muted">
            {device.online ? <span className="sr-only">en ligne, </span> : "hors ligne · "}
            {device.latest ? ago(device.latest.ts, now) : "aucune mesure"}
          </span>
        </div>
      )}
    </header>
  );
}

// No board registered yet: adding one is a desktop task.
export function MobileEmpty({ onLogout }: { onLogout: () => void }) {
  return (
    <main id="main" className="mb-empty" tabIndex={-1}>
      <h1>AQA</h1>
      <p>Aucune carte. Ajoute ta première carte depuis la version ordinateur.</p>
      <SessionTools onLogout={onLogout} />
    </main>
  );
}

