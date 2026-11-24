import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/ui";
import { Setup } from "./Setup";

const html = (first: boolean) =>
  renderToStaticMarkup(<ToastProvider><Setup unknown={[]} first={first} onDone={() => {}} /></ToastProvider>);

describe("Setup", () => {
  it("première carte : « Ajoute ta carte », sans retour", () => {
    const out = html(true);
    expect(out).toContain("Ajoute ta carte");
    expect(out).not.toContain("← retour");
  });
  it("carte suivante : « Ajoute une carte » et un retour aux mesures", () => {
    const out = html(false);
    expect(out).toContain("Ajoute une carte");
    expect(out).toMatch(/<a [^>]*href="#\/mesures"[^>]*>← retour<\/a>/);
  });
});
