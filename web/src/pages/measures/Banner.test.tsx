import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Banner, ComparePanel, type CompareControl } from "./Banner";

const chambre = { id: "aqa-B", name: "Chambre" };
const salon = { id: "aqa-C", name: "Salon" };
const control = (over: Partial<CompareControl> = {}): CompareControl =>
  ({ choices: [chambre, salon], current: null, note: null, onPick: () => {}, ...over });

const banner = (compare?: CompareControl) => renderToStaticMarkup(
  <Banner headRef={createRef()} title="CO₂" subtitle="démo · 24 h glissantes" range={{ kind: "preset", seconds: 86400 }}
          onRange={() => {}} today="2026-11-24" view="single" onView={() => {}} onCsv={() => {}} csvDisabled={false}
          smoothing="band" onSmoothing={() => {}} compare={compare} />);

describe("Banner : comparer", () => {
  it("pas de bouton sans pièce à comparer (une seule carte, ou grille)", () => {
    expect(banner()).not.toContain("compar");
  });
  it("« comparer avec… » fermé par défaut", () => {
    expect(banner(control())).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="ms-compare"[^>]*>comparer avec…<\/button>/);
  });
  it("pièce comparée : le bouton la nomme", () => {
    const out = banner(control({ current: chambre }));
    expect(out).toMatch(/<button[^>]*class="active"[^>]*>avec Chambre…<\/button>/);
  });
});

describe("Banner : lissage", () => {
  it("trois boutons, le mode courant enfoncé", () => {
    const out = banner();
    expect(out).toContain('aria-label="Traitement des données"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>marge</);
    expect(out).toMatch(/aria-pressed="false"[^>]*>lissé</);
    expect(out).toMatch(/aria-pressed="false"[^>]*>brut</);
  });
});

describe("ComparePanel", () => {
  it("un bouton par pièce, la pièce comparée enfoncée, et de quoi arrêter", () => {
    const out = renderToStaticMarkup(<ComparePanel control={control({ current: chambre })} onDone={() => {}} />);
    expect(out).toMatch(/aria-pressed="true"[^>]*>Chambre</);
    expect(out).toMatch(/aria-pressed="false"[^>]*>Salon</);
    expect(out).toContain("ne plus comparer");
  });
  it("rien de comparé : pas de « ne plus comparer »", () => {
    expect(renderToStaticMarkup(<ComparePanel control={control()} onDone={() => {}} />)).not.toContain("ne plus comparer");
  });
  it("son non calibré : la raison à la place des pièces", () => {
    const out = renderToStaticMarkup(
      <ComparePanel control={control({ choices: [], note: "Le son ne se compare qu'entre cartes calibrées." })} onDone={() => {}} />);
    expect(out).toContain("Le son ne se compare qu&#x27;entre cartes calibrées.");
    expect(out).not.toContain("Chambre");
  });
});
