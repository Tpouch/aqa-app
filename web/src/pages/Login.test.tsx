import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n/lang";
import { Login } from "./Login";

describe("Login, bouton afficher/masquer", () => {
  const out = renderToStaticMarkup(<Login onLogin={() => {}} />);

  it("le champ porte seulement son libellé : le bouton n'est pas dans le <label>", () => {
    const label = out.match(/<label[^>]*>(.*?)<\/label>/s)?.[1] ?? "";
    expect(label).toContain("Mot de passe administrateur");
    expect(label).not.toContain("<button");
    expect(out).toMatch(/<label[^>]*for="login-password"/);
    expect(out).toMatch(/<input[^>]*id="login-password"/);
  });

  it("le bouton dit ce qu'il fait, sans état « pressé » qui contredirait son texte", () => {
    const button = out.match(/<button[^>]*type="button"[^>]*>/)?.[0] ?? "";
    expect(button).toContain('aria-label="Afficher le mot de passe"');
    expect(button).toContain('aria-controls="login-password"');
    expect(button).not.toContain("aria-pressed");
  });
});

describe("Login, language", () => {
  afterEach(() => setLang("fr", { getItem: () => null, setItem: () => {}, removeItem: () => {} }));

  it("offers the language switch before logging in", () => {
    expect(renderToStaticMarkup(<Login onLogin={() => {}} />)).toContain('aria-label="Switch to English"');
  });

  it("reads in English", () => {
    setLang("en", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const out = renderToStaticMarkup(<Login onLogin={() => {}} />);
    expect(out).toContain("Admin password");
    expect(out).toContain("Log in");
    expect(out).not.toContain("Mot de passe");
  });
});
