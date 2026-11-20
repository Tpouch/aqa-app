import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { Button } from "../components/ui";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429
        ? "Trop de tentatives. Réessaie dans une minute."
        : "Mot de passe incorrect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-panel" onSubmit={submit} noValidate>
        <div className="label-caps login-brand">AQA</div>
        <h1>Connexion</h1>
        <p className="muted small">Suivi de la qualité de l'air de tes capteurs.</p>
        <label className="field">
          <span className="label-caps">Mot de passe administrateur</span>
          <div className="password">
            <input className="input" type={show ? "text" : "password"} autoFocus autoComplete="current-password"
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
              {show ? "masquer" : "afficher"}
            </Button>
          </div>
          {error && <small id="login-error" className="field-error" role="alert">{error}</small>}
        </label>
        <Button variant="primary" type="submit" loading={busy} disabled={!password}>Se connecter</Button>
      </form>
    </main>
  );
}
