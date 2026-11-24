import { useEffect, useRef, useState } from "react";
import { RoomList } from "../components/RoomList";
import { SessionTools } from "../components/Sidebar";
import { Skeleton } from "../components/ui";
import { parseRoute } from "../routes";
import type { DeviceSummary } from "../../../server/src/types";
import { neverSeen, otherAlerts, WAITING } from "../rooms";
import { ago } from "../util";
import { MOBILE_LABEL, parseMobileRoute, type MobileRoute } from "./routes";
import { DashboardPage } from "./DashboardPage";
import { GraphPage, openGraph } from "./GraphPage";
import { InfoPage } from "./InfoPage";
import { MobileAlertsPage } from "./MobileAlertsPage";
import { ReportPage } from "../pages/report/ReportPage";
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

function Page({ route, device, now, onLogout }: { route: MobileRoute; device: DeviceSummary; now: number; onLogout: () => void }) {
  switch (route.tab) {
    case "dashboard": return <DashboardPage device={device} onOpen={openGraph} />;
    case "bilan": return <ReportPage key={device.id} id={device.id} device={device} compact />;
    case "alertes": return <MobileAlertsPage key={device.id} id={device.id} device={device} />;
    case "infos": return <InfoPage device={device} now={now} onLogout={onLogout} />;
    case "graph": return <GraphPage key={device.id} id={device.id} device={device} metric={route.metric} />;
  }
}

export function TopBar({ devices, device, onDevice, now }: {
  devices: DeviceSummary[];
  device: DeviceSummary | undefined;
  onDevice: (id: string) => void;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const several = devices.length > 1;
  const elsewhere = device ? otherAlerts(devices, device.id) : 0;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return (
    <header className="mb-top">
      <span className="mb-brand" aria-hidden>AQA</span>
      {device && (
        <div className="mb-device">
          <span className={device.online ? "tone-good" : "muted"} aria-hidden>{device.online ? "●" : "○"}</span>
          {several ? (
            <button ref={trigger} type="button" className="mb-switch" aria-haspopup="dialog"
                    aria-label={`Changer de pièce, ${device.name} affichée`} onClick={() => setOpen(true)}>
              <span className="mb-name">{device.name}</span><span aria-hidden> ▾</span>
            </button>
          ) : (
            <span className="mb-name">{device.name}</span>
          )}
          {elsewhere > 0 && (
            <span className="tone-bad mb-elsewhere">
              <span aria-hidden>▲ {elsewhere}</span>
              <span className="sr-only">{elsewhere} alerte{elsewhere > 1 ? "s" : ""} dans une autre pièce</span>
            </span>
          )}
          <span className="mb-ago muted">
            {neverSeen(device) ? WAITING : <>
              {device.online ? <span className="sr-only">en ligne, </span> : "hors ligne · "}
              {device.latest ? ago(device.latest.ts, now) : "aucune mesure"}
            </>}
          </span>
        </div>
      )}
      {open && device && (
        <RoomSheet devices={devices} current={device.id} onClose={close}
                   onPick={(id) => { onDevice(id); close(); }} />
      )}
    </header>
  );
}

// Every room, full screen: the phone's way of switching boards.
function RoomSheet({ devices, current, onPick, onClose }: {
  devices: DeviceSummary[];
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="mb-sheet" role="dialog" aria-modal="true" aria-labelledby="mb-sheet-title">
      <div className="mb-sheet-head">
        <h2 id="mb-sheet-title" className="label-caps">Pièces</h2>
        <button ref={closeRef} type="button" className="mb-sheet-close" aria-label="Fermer" onClick={onClose}>✕</button>
      </div>
      <RoomList devices={devices} current={current} onPick={onPick} />
    </div>
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

