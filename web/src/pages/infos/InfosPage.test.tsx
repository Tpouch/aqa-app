import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeviceSummary } from "../../../../server/src/types";
import { InfosPage } from "./InfosPage";

const html = (device: DeviceSummary | null) => renderToStaticMarkup(<InfosPage device={device} />);
const board = (cal: DeviceSummary["sound_calibration"]) => ({ sound_calibration: cal }) as DeviceSummary;

describe("InfosPage, note de calibration du son", () => {
  it("rien tant que la carte n'est pas chargée", () => expect(html(null)).not.toContain("pas encore calibré"));
  it("carte non calibrée : la note annonce les zones ci-dessous", () => {
    const out = html(board(null));
    expect(out).toContain("pas encore calibré");
    expect(out).toContain("zones ci-dessous");
    expect(out).not.toContain("sans zones");
  });
});
