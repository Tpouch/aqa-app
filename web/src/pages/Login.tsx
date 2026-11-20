import { useState, type FormEvent } from "react";
import { api } from "../api";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
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
      setError((err as Error & { status?: number }).status === 429
        ? "Trop d'essais, réessaie dans une minute."
        : "Mot de passe incorrect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1><span className="logo" />AQA</h1>
        <p className="muted">Qualité de l'air, capteurs ESP32</p>
        <label>
          Mot de passe admin
          <input type="password" autoFocus autoComplete="current-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !password}>{busy ? "Connexion…" : "Se connecter"}</button>
      </form>
    </main>
  );
}
