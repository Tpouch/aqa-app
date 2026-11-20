// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyTheme, readTheme } from "./theme";

describe("thème", () => {
  it("vaut sombre par défaut", () => expect(readTheme({ getItem: () => null })).toBe("dark"));
  it("relit le choix", () => expect(readTheme({ getItem: () => "light" })).toBe("light"));
  it("ignore une valeur inconnue", () => expect(readTheme({ getItem: () => "blue" })).toBe("dark"));
  it("survit à un stockage qui lève", () => {
    expect(readTheme({ getItem: () => { throw new Error("denied"); } })).toBe("dark");
    expect(() => applyTheme("light", { setItem: () => { throw new Error("denied"); } })).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
