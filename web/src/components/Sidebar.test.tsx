// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeviceSummary } from "../../../server/src/types";
import { Sidebar } from "./Sidebar";

const fresh = {
  id: "aqa-24A160B3C8F0", name: "Bureau", created_at: 0, last_seen: null, online: false, status: null, status_at: null,
  latest: null, sound_calibration: null, open_alerts: 0,
} as DeviceSummary;

describe("Sidebar, une seule carte jamais connectée", () => {
  it("affiche « en attente du premier contact » plutôt que « hors ligne »", () => {
    const out = renderToStaticMarkup(
      <Sidebar devices={[fresh]} device={fresh} onDevice={() => {}} tab="mesures"
               selection={{ view: "single", metric: "co2", grid: ["co2"], compare: null, smoothing: "smooth" }} onSelection={() => {}}
               pending={0} alerts={0} unknown={0} onLogout={() => {}} now={0} />);
    expect(out).toContain("en attente du premier contact");
    expect(out).not.toContain("hors ligne");
  });
});

describe("Sidebar in English", () => {
  it("reads in English", async () => {
    const { setLang } = await import("../i18n/lang");
    setLang("en", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    try {
      const out = renderToStaticMarkup(
        <Sidebar devices={[fresh]} device={fresh} onDevice={() => {}} tab="mesures"
                 selection={{ view: "single", metric: "co2", grid: ["co2"], compare: null, smoothing: "smooth" }} onSelection={() => {}}
                 pending={0} alerts={0} unknown={2} onLogout={() => {}} now={0} />);
      for (const s of ["waiting for first contact", "Measures", "Report", "log out", "2 unknown boards are trying to connect", "Temperature"]) {
        expect(out).toContain(s);
      }
      expect(out).not.toMatch(/déconnexion|Mesures|en attente/);
    } finally {
      setLang("fr", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    }
  });
});
