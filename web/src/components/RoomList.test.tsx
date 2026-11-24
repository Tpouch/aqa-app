import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeviceSummary } from "../../../server/src/types";
import { RoomList } from "./RoomList";

const board = (id: string, name: string, open_alerts = 0) =>
  ({ id, name, online: true, latest: null, sound_calibration: null, open_alerts }) as unknown as DeviceSummary;

describe("RoomList", () => {
  const html = renderToStaticMarkup(
    <RoomList devices={[board("aqa-A", "Chambre"), board("aqa-B", "Salon", 1)]} current="aqa-A" onPick={() => {}} />);

  it("une ligne par pièce, la pièce affichée marquée", () => {
    expect(html).toContain("Chambre");
    expect(html).toContain("Salon");
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });
  it("montre les alertes en cours d'une autre pièce, avec un texte lisible", () => {
    expect(html).toContain("▲ 1");
    expect(html).toContain("1 alerte en cours");
  });
});
