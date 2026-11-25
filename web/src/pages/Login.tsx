import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { LangToggle } from "../components/LangToggle";
import { Button } from "../components/ui";
import { t } from "../i18n/dict";

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
        ? t().login.tooMany
        : t().login.wrong);
    } finally {
      setBusy(false);
    }
  }

  const d = t().login;
  return (
    <main className="login">
      <form className="login-panel" onSubmit={submit} noValidate>
        <div className="label-caps login-brand">AQA</div>
        <h1>{d.title}</h1>
        <p className="muted small">{d.tagline}</p>
        {/* The label wraps only its text: the field's name stays "Mot de passe administrateur",
            and the button names its action ("Masquer le mot de passe") rather than a pressed state. */}
        <div className="field">
          <label htmlFor="login-password" className="label-caps">{d.password}</label>
          <div className="password">
            <input id="login-password" className="input" type={show ? "text" : "password"} autoFocus autoComplete="current-password"
                   value={password} onChange={(e) => setPassword(e.target.value)}
                   aria-invalid={error ? true : undefined} aria-describedby={error ? "login-error" : undefined} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setShow((s) => !s)}
                    aria-label={show ? d.hideLabel : d.showLabel} aria-controls="login-password">
              {show ? d.hide : d.show}
            </Button>
          </div>
          {error && <small id="login-error" className="field-error" role="alert">{error}</small>}
        </div>
        <Button variant="primary" type="submit" loading={busy} disabled={!password}>{d.submit}</Button>
        <div className="login-lang"><LangToggle /></div>
      </form>
    </main>
  );
}
