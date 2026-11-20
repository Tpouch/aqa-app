import { useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";
import { Dashboard } from "./pages/Dashboard";
import { DevicePage } from "./pages/DevicePage";
import { Login } from "./pages/Login";
import { Manage } from "./pages/Manage";
import { useHashRoute } from "./util";

export function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const route = useHashRoute();

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth(false));
    api.session().then((s) => setAuth(s.authenticated), () => setAuth(false));
  }, []);

  if (auth === null) return null;
  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  const device = route.match(/^\/device\/(aqa-[0-9A-F]{12})$/)?.[1];
  const page = device ? <DevicePage key={device} id={device} />
    : route === "/manage" ? <Manage />
    : <Dashboard />;

  return (
    <>
      <nav className="topbar">
        <a href="#/" className="brand"><span className="logo" />AQA</a>
        <a href="#/" className={!device && route !== "/manage" ? "active" : ""}>Capteurs</a>
        <a href="#/manage" className={route === "/manage" ? "active" : ""}>Gestion</a>
        <span className="spacer" />
        <button className="link" onClick={() => api.logout().finally(() => setAuth(false))}>Déconnexion</button>
      </nav>
      <main className="content">{page}</main>
    </>
  );
}
