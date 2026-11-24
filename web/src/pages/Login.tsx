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
        {/* The label wraps only its text: the field's name stays "Mot de passe administrateur",
            and the button names its action ("Masquer le mot de passe") rather than a pressed state. */}
        <div className="field">
          <label htmlFor="login-password" className="label-caps">Mot de passe administrateur</label>
          <div className="password">
            <input id="login-password" className="input" type={show ? "text" : "password"} autoFocus autoComplete="current-password"
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-controls="login-password">
              {show ? "masquer" : "afficher"}
            </Button>
          </div>
          {error && <small id="login-error" className="field-error" role="alert">{error}</small>}
        </div>
        <Button variant="primary" type="submit" loading={busy} disabled={!password}>Se connecter</Button>
      </form>
    </main>
  );
}
