import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeviceSummary } from "../../../../server/src/types";
import { CardPage } from "./CardPage";

const board = (over: Partial<DeviceSummary>) => ({
  id: "aqa-24A160B3C8F0", name: "Bureau", created_at: 0, last_seen: null, online: false, status: null, status_at: null,
  latest: null, sound_calibration: null, open_alerts: 0, ...over,
}) as DeviceSummary;
const html = (d: DeviceSummary) => renderToStaticMarkup(
  <CardPage id={d.id} device={d} commands={[]} commandsError={null} reload={() => {}} send={async () => true} now={1000} />);

describe("CardPage, carte jamais connectée", () => {
  it("dit qu'elle attend son premier contact et rappelle les étapes", () => {
    const out = html(board({}));
    expect(out).toContain("en attente du premier contact");
    expect(out).not.toContain("hors ligne");
    expect(out).toContain("DEVICE_TOKEN");
    expect(out).toContain("Nouveau jeton");
  });
  it("une carte déjà vue sans rapport d'état garde le message habituel", () => {
    const out = html(board({ last_seen: 900 }));
    expect(out).toContain("hors ligne");
    expect(out).toMatch(/Aucun rapport d(&#x27;|')état reçu/);
  });
});
