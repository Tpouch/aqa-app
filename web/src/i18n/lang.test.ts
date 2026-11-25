// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getLang, locale, readLang, setLang } from "./lang";
import { t } from "./dict";

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const throwing = {
  getItem: () => { throw new Error("denied"); },
  setItem: () => { throw new Error("denied"); },
  removeItem: () => { throw new Error("denied"); },
};

afterEach(() => setLang("fr", store()));

describe("language", () => {
  it("defaults to French", () => expect(readLang({ getItem: () => null })).toBe("fr"));
  it("reads English back", () => expect(readLang({ getItem: () => "en" })).toBe("en"));
  it("ignores an unknown value", () => expect(readLang({ getItem: () => "de" })).toBe("fr"));
  it("survives a storage that throws on read", () => expect(readLang(throwing)).toBe("fr"));

  it("switches, saves and marks the page", () => {
    const s = store();
    setLang("en", s);
    expect(getLang()).toBe("en");
    expect(s.getItem("aqa-lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("AQA · Sensors");
    expect(locale()).toBe("en-GB");
  });

  it("still switches when storage throws on write", () => {
    expect(() => setLang("en", throwing)).not.toThrow();
    expect(getLang()).toBe("en");
  });

  it("serves the dictionary of the active language", () => {
    expect(t().session.logout).toBe("déconnexion");
    expect(locale()).toBe("fr-FR");
    setLang("en", store());
    expect(t().session.logout).toBe("log out");
  });
});
