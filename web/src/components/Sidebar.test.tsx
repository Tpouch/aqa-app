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
               selection={{ view: "single", metric: "co2", grid: ["co2"] }} onSelection={() => {}}
               pending={0} alerts={0} unknown={0} onLogout={() => {}} now={0} />);
    expect(out).toContain("en attente du premier contact");
    expect(out).not.toContain("hors ligne");
  });
});
