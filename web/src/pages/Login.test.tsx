import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
