import { afterEach, describe, expect, it } from "vitest";
import { ALERT_KINDS } from "../../../server/src/types";
import { ZONES } from "../../../server/src/zones";
import { bandRanges, metricDef } from "../metrics";
import { roomState } from "../rooms";
import { setLang } from "./lang";
import { alertAdvice, alertLabel, commandLabel, commandState, localizeAlert, localizeReport, tabLabel, zoneWord } from "./vocab";

const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
afterEach(() => setLang("fr", mem));
const sp = (s: string) => s.replace(/ /g, " ").replace(/ (?=\d)/g, " ");

describe("shared vocabulary", () => {
  it("French passes the server's words through", () => {
    expect(zoneWord("aérer")).toBe("aérer");
    expect(alertLabel("co2_high", "CO₂ élevé")).toBe("CO₂ élevé");
    expect(tabLabel("bilan")).toBe("Bilan");
    expect(commandLabel("restart")).toBe("Redémarrage");
    expect(commandState("failed").label).toBe("Échec");
    expect(metricDef("temp", null).label).toBe("Température");
    expect(metricDef("temp", null).bands!.map((b) => b.word)).toEqual(["froid", "confort", "chaud"]);
  });

  it("English", () => {
    setLang("en", mem);
    expect(zoneWord("aérer")).toBe("ventilate");
    expect(zoneWord("xyz")).toBe("xyz");
    expect(alertLabel("co2_high", "CO₂ élevé")).toBe("High CO₂");
    for (const k of ALERT_KINDS) {
      expect(alertLabel(k, "fr")).not.toBe("fr");
      expect(alertAdvice(k, "fr")).not.toBe("fr");
    }
    expect(tabLabel("bilan")).toBe("Report");
    expect(commandLabel("restart")).toBe("Restart");
    expect(commandState("failed").label).toBe("Failed");
    const temp = metricDef("temp", null);
    expect(temp.label).toBe("Temperature");
    expect(temp.bands!.map((b) => b.word)).toEqual(["cold", "comfort", "hot"]);
    expect(bandRanges(metricDef("co2", null).bands!, "ppm")).toEqual(["less than 800 ppm", "800 to 1,200 ppm", "1,200 ppm and over"]);
    expect(bandRanges(temp.bands!, "°C")).toEqual(["less than 19 °C", "19 to 24 °C", "over 24 °C"]);
    const row = localizeAlert({ kind: "temp_low" as const, label: "Trop froid", advice: "Monte le chauffage" });
    expect(row.label).toBe("Too cold");
    expect(row.advice).not.toContain("chauffage");
  });

  it("a report's zone words and alert names read in English", () => {
    setLang("en", mem);
    const zones = [{ word: "bon", tone: "good" as const, seconds: 1 }, { word: "aérer", tone: "warn" as const, seconds: 1 }];
    const period = { measured_s: 2, zones, avg: 1, min: null, max: null };
    const r = localizeReport({ metrics: [{ metric: "co2", current: period, previous: { ...period, zones: null }, comparison: null }],
      alerts: { current: 1, previous: 0, by_kind: [{ kind: "co2_high", label: "CO₂ élevé", count: 1 }] } } as never);
    expect(r.metrics[0]!.current.zones!.map((z) => z.word)).toEqual(["good", "ventilate"]);
    expect(r.metrics[0]!.previous.zones).toBeNull();
    expect(r.alerts.by_kind[0]!.label).toBe("High CO₂");
  });

  it("every zone word has an English word", () => {
    setLang("en", mem);
    for (const bands of Object.values(ZONES)) for (const b of bands) expect(zoneWord(b.word)).not.toBe(b.word);
  });

  it("grid summary phrases and the average zone read naturally", async () => {
    const { alertPhrase } = await import("../measures");
    const cal = { snd_ref: 1, db_ref: 50 };
    expect(alertPhrase(metricDef("snd", cal))).toBe("Son fort");
    expect(alertPhrase(metricDef("co2", null))).toBe("CO₂ en zone mauvaise");
    setLang("en", mem);
    expect(alertPhrase(metricDef("snd", cal))).toBe("Loud sound");
    expect(alertPhrase(metricDef("co2", null))).toBe("CO₂ in the bad zone");
    expect(alertPhrase(metricDef("temp", null))).toBe("Temperature out of comfort");
    const { t } = await import("./dict");
    expect(t().measures.zone("ventilate")).toBe("zone: ventilate");
  });

  it("a room's state reads in English", () => {
    setLang("en", mem);
    const d = { id: "aqa-000000000001", name: "Office", last_seen: 1, online: true, sound_calibration: null,
      latest: { co2: 1500, pm25: 3, temp: 21, hum: 50, snd: 10 } } as never;
    expect(roomState(d)).toEqual({ tone: "bad", word: "CO₂ bad" });
    expect(roomState({ ...(d as object), online: false } as never).word).toBe("offline");
    void sp;
  });
});
