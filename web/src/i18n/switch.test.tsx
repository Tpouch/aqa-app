// @vitest-environment jsdom
// Switching the language re-renders the whole screen at once, without a reload.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLang } from "./lang";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
afterEach(() => { setLang("fr", mem); vi.unstubAllGlobals(); });

describe("language switch", () => {
  it("re-renders the screen in the other language and back", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ authenticated: false }), { status: 200 }));
    const { App } = await import("../App");
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    await act(async () => { root.render(<App />); });
    expect(el.textContent).toContain("Se connecter");

    await act(async () => { el.querySelector<HTMLButtonElement>('button[lang="en"]')!.click(); });
    expect(el.textContent).toContain("Log in");
    expect(el.textContent).not.toContain("Se connecter");
    expect(document.documentElement.lang).toBe("en");

    await act(async () => { el.querySelector<HTMLButtonElement>('button[lang="fr"]')!.click(); });
    expect(el.textContent).toContain("Se connecter");
    act(() => root.unmount());
    el.remove();
  });
});
