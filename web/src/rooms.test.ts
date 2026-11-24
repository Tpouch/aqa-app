import { describe, expect, it } from "vitest";
import type { DeviceSummary, FrameRow } from "../../server/src/types";
import { otherAlerts, roomState } from "./rooms";

const frame = (over: Partial<FrameRow> = {}): FrameRow => ({
  ts: 0, ts_estimated: false, geohash: null, snd: 100, co2: 500, pm25: 5, hum: 50, temp: 21, stale: false, ...over,
});
const board = (over: Partial<DeviceSummary> = {}): DeviceSummary => ({
  id: "aqa-A", name: "A", created_at: 0, last_seen: 0, online: true, status: null, status_at: null,
  latest: frame(), sound_calibration: null, open_alerts: 0, ...over,
});

describe("roomState", () => {
  it("tout va bien : « bon »", () => expect(roomState(board())).toEqual({ tone: "good", word: "bon" }));
  it("donne la pire zone avec sa mesure", () =>
    expect(roomState(board({ latest: frame({ co2: 1480 }) }))).toEqual({ tone: "bad", word: "CO₂ mauvais" }));
  it("le mauvais l'emporte sur l'à-surveiller, quelle que soit la mesure", () =>
    expect(roomState(board({ latest: frame({ co2: 900, temp: 26 }) }))).toEqual({ tone: "bad", word: "Température chaud" }));
  it("à égalité, l'ordre des mesures de la colonne", () =>
    expect(roomState(board({ latest: frame({ co2: 900, pm25: 20 }) }))).toEqual({ tone: "warn", word: "CO₂ aérer" }));
  it("hors ligne passe avant les valeurs, qui sont périmées", () =>
    expect(roomState(board({ online: false, latest: frame({ co2: 1480 }) }))).toEqual({ tone: "off", word: "hors ligne" }));
  it("sans mesure", () => expect(roomState(board({ latest: null }))).toEqual({ tone: "off", word: "aucune mesure" }));
  it("le son brut, sans zones, ne compte pas", () =>
    expect(roomState(board({ latest: frame({ snd: 4000 }) }))).toEqual({ tone: "good", word: "bon" }));
  it("le son calibré compte", () =>
    expect(roomState(board({ sound_calibration: { snd_ref: 100, db_ref: 50 }, latest: frame({ snd: 2000 }) })))
      .toEqual({ tone: "bad", word: "Son fort" }));
});

describe("otherAlerts", () => {
  it("additionne les alertes des autres cartes", () => {
    const list = [board({ id: "a", open_alerts: 2 }), board({ id: "b", open_alerts: 1 }), board({ id: "c" })];
    expect(otherAlerts(list, "b")).toBe(2);
  });
});
