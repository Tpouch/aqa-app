import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabBar } from "./TabBar";

const alertsLink = (alerts: number) =>
  renderToStaticMarkup(<TabBar tab="dashboard" alerts={alerts} />).match(/<a href="#\/alertes".*?<\/a>/s)?.[0] ?? "";

describe("TabBar, nombre d'alertes", () => {
  it("le nombre est du texte lu avec le nom de l'onglet, pas un aria-label sur un <span>", () => {
    const link = alertsLink(2);
    expect(link).not.toMatch(/<span[^>]*aria-label/);
    expect(link).toMatch(/<span class="mb-badge" aria-hidden="true">2<\/span>/);
    expect(link.replace(/<span[^>]*aria-hidden="true"[^>]*>.*?<\/span>/gs, "").replace(/<[^>]+>/g, ""))
      .toBe("Alertes, 2 alertes en cours");
  });
  it("une seule alerte, au singulier ; aucune, rien de plus", () => {
    expect(alertsLink(1)).toContain(", 1 alerte en cours");
    expect(alertsLink(0).replace(/<[^>]+>/g, "")).toBe("Alertes");
  });
});

describe("TabBar in English", () => {
  it("reads in English", async () => {
    const { setLang } = await import("../i18n/lang");
    const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    setLang("en", mem);
    try {
      const out = renderToStaticMarkup(<TabBar tab="dashboard" alerts={2} />);
      for (const s of ["Report", "Alerts", "Info", "2 open alerts"]) expect(out).toContain(s);
      expect(out).not.toMatch(/Bilan|Alertes|en cours/);
    } finally {
      setLang("fr", mem);
    }
  });
});
