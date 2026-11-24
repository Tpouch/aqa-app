import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeviceSummary } from "../../../server/src/types";
import { TopBar } from "./MobileShell";

const board = (id: string, name: string, open_alerts = 0) =>
  ({ id, name, online: true, latest: null, sound_calibration: null, open_alerts }) as unknown as DeviceSummary;
const chambre = board("aqa-A", "Chambre");
const salon = board("aqa-B", "Salon", 1);
const html = (devices: DeviceSummary[]) =>
  renderToStaticMarkup(<TopBar devices={devices} device={chambre} onDevice={() => {}} now={0} />);

describe("TopBar", () => {
  it("plusieurs pièces : un bouton ouvre la liste, et l'alerte d'une autre pièce se voit", () => {
    const out = html([chambre, salon]);
    expect(out).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*aria-label="Changer de pièce, Chambre affichée"/);
    expect(out).toContain("▲ 1");
    expect(out).toContain("1 alerte dans une autre pièce");
  });
  it("une seule pièce : juste le nom", () => {
    const out = html([chambre]);
    expect(out).not.toContain("aria-haspopup");
    expect(out).toContain("Chambre");
  });
  it("carte jamais connectée : en attente du premier contact, pas « hors ligne »", () => {
    const fresh = { ...chambre, online: false, last_seen: null } as DeviceSummary;
    const out = renderToStaticMarkup(<TopBar devices={[fresh]} device={fresh} onDevice={() => {}} now={0} />);
    expect(out).toContain("en attente du premier contact");
    expect(out).not.toContain("hors ligne");
  });
});
