import { EyeIcon, EyeSlashIcon, WindIcon } from "@phosphor-icons/react";
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
      <form className="card login-card" onSubmit={submit} noValidate>
        <div>
          <div className="brand">
            <span className="brand-mark"><WindIcon size={16} weight="bold" aria-hidden /></span>
            AQA
          </div>
          <h1 style={{ fontSize: "1.35rem" }}>Connexion</h1>
          <p className="muted small">Suivi de la qualité de l'air de tes capteurs.</p>
        </div>
        <label className="field">
          <span>Mot de passe administrateur</span>
          <div className="password">
            <input className="input" type={show ? "text" : "password"} autoFocus autoComplete="current-password"
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined} />
            <Button type="button" variant="ghost" size="sm" iconOnly
                    icon={show ? <EyeSlashIcon size={18} aria-hidden /> : <EyeIcon size={18} aria-hidden />}
                    onClick={() => setShow((s) => !s)} aria-pressed={show}>
              {show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            </Button>
          </div>
          {error && <small id="login-error" className="field-error" role="alert">{error}</small>}
        </label>
        <Button variant="primary" type="submit" loading={busy} disabled={!password}>Se connecter</Button>
      </form>
    </main>
  );
}
