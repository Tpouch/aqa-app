import { describe, expect, it } from "vitest";
import type { AlertRow, AlertRule } from "../../../../server/src/types";
import { fmt } from "../../util";
import { alertDate, alertEnding, alertValue, ruleSummary } from "./format";

const row = (over: Partial<AlertRow>): AlertRow => ({
  id: 1, kind: "co2_high", label: "CO₂ élevé", unit: "ppm", metric: "co2", tone: "bad", threshold: 1200,
  started_at: 1000, ended_at: 2000, start_value: 1300, peak_value: 1400, end_value: 640, end_reason: "normal",
  advice: "Ouvre une fenêtre.", ...over,
});

const rule = (over: Partial<AlertRule>): AlertRule => {
  const values = { enabled: true, threshold: 1200, duration_s: 300 };
  return { kind: "co2_high", label: "CO₂ élevé", unit: "ppm", metric: "co2", defaults: values, ...values, ...over };
};

describe("alertValue", () => {
  it("formate selon la mesure", () => {
    expect(alertValue({ metric: "co2", unit: "ppm" }, 1340)).toBe(`${fmt(1340)} ppm`);
    expect(alertValue({ metric: "temp", unit: "°C" }, 25.84)).toBe("25,8 °C");
    expect(alertValue({ metric: "snd", unit: "dB" }, 71.6)).toBe("72 dB");
  });
  it("affiche un tiret sans valeur", () => {
    expect(alertValue({ metric: "co2", unit: "ppm" }, null)).toBe("—");
  });
});

describe("alertEnding", () => {
  it("dit comment l'alerte s'est terminée", () => {
    expect(alertEnding(row({}))).toBe("retour à 640 ppm");
    expect(alertEnding(row({ end_reason: "disabled" }))).toBe("règle désactivée");
    expect(alertEnding(row({ kind: "offline", label: "Carte hors ligne", unit: "", metric: null, end_value: null }))).toBe("reconnectée");
  });
  it("ne dit rien pour une alerte en cours", () => {
    expect(alertEnding(row({ ended_at: null, end_value: null, end_reason: null }))).toBeNull();
  });
});

describe("ruleSummary", () => {
  it("résume seuil et durée", () => {
    expect(ruleSummary(rule({}))).toBe(`> ${fmt(1200)} ppm · 5 min`);
    expect(ruleSummary(rule({ kind: "temp_low", unit: "°C", metric: "temp", threshold: 19, duration_s: 1800 }))).toBe("< 19 °C · 30 min");
  });
  it("résume la règle hors ligne", () => {
    expect(ruleSummary(rule({ kind: "offline", unit: "", metric: null, threshold: null, duration_s: 300 }))).toBe("plus de 5 min sans contact");
  });
});

describe("alertDate", () => {
  const now = new Date(2026, 10, 20, 15, 0).getTime() / 1000;
  const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime() / 1000;
  it("dit auj., hier, sinon la date", () => {
    expect(alertDate(at(20, 14, 2), now)).toBe("auj. 14:02");
    expect(alertDate(at(19, 22, 40), now)).toBe("hier 22:40");
    expect(alertDate(at(12, 8, 15), now)).toBe("12/11 08:15");
  });
});

describe("alert texts in English", () => {
  it("read in English", async () => {
    const { setLang } = await import("../../i18n/lang");
    const { lastSendText } = await import("./notify");
    const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    setLang("en", mem);
    try {
      const base = { kind: "co2_high", metric: "co2", unit: "ppm", ended_at: 10, end_value: null, end_reason: null } as never;
      expect(alertEnding(base)).toBe("back to normal");
      expect(alertEnding({ ...(base as object), end_value: 700 } as never)).toBe("back to 700 ppm");
      expect(alertEnding({ ...(base as object), end_reason: "disabled" } as never)).toBe("rule disabled");
      expect(alertEnding({ ...(base as object), kind: "offline" } as never)).toBe("reconnected");
      expect(ruleSummary({ metric: null, kind: "offline", duration_s: 300 } as never)).toBe("over 5 min without contact");
      const now = new Date(2026, 10, 24, 15, 0).getTime() / 1000;
      expect(alertDate(new Date(2026, 10, 24, 14, 2).getTime() / 1000, now)).toBe("today 14:02");
      expect(alertDate(new Date(2026, 10, 23, 22, 40).getTime() / 1000, now)).toBe("yesterday 22:40");
      expect(lastSendText(null, now).text).toBe("nothing sent yet");
    } finally {
      setLang("fr", mem);
    }
  });
});
