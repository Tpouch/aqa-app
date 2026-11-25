// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { setLang } from "../i18n/lang";
import { LangToggle } from "./LangToggle";

const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
afterEach(() => setLang("fr", mem));

describe("LangToggle", () => {
  it("offers English while in French", () => {
    const out = renderToStaticMarkup(<LangToggle />);
    expect(out).toContain('aria-label="Switch to English"');
    expect(out).toContain('lang="en"');
    expect(out).toMatch(/>EN<\/button>/);
  });
  it("offers French while in English", () => {
    setLang("en", mem);
    const out = renderToStaticMarkup(<LangToggle />);
    expect(out).toContain('aria-label="Passer en français"');
    expect(out).toContain('lang="fr"');
    expect(out).toMatch(/>FR<\/button>/);
  });
});
