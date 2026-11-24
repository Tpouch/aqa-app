// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openGraph } from "./GraphPage";
import { useMobileRoute } from "./MobileShell";

// uPlot reads matchMedia as soon as it loads, which jsdom lacks; no chart is drawn here.
vi.mock("uplot", () => ({ default: class {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const route = useMobileRoute(() => {});
  return <p>{route.tab}</p>;
}

let root: Root;
let el: HTMLDivElement;
const scrollTo = vi.fn();
const scrolledTo = (y: number) => Object.defineProperty(window, "scrollY", { value: y, configurable: true });
const nextHashChange = () => new Promise((resolve) => window.addEventListener("hashchange", resolve, { once: true }));

beforeEach(() => {
  window.history.replaceState(null, "", "#/dashboard");
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  scrollTo.mockClear();
  scrolledTo(0);
  el = document.createElement("div");
  root = createRoot(el);
  act(() => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
});

describe("useMobileRoute, position de la page", () => {
  it("un nouvel onglet s'ouvre en haut", async () => {
    scrolledTo(640);
    await act(async () => {
      const changed = nextHashChange();
      window.location.hash = "#/alertes";
      await changed;
    });
    expect(el.textContent).toBe("alertes");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it("en revenant d'un graphe, le Dashboard retrouve sa position", async () => {
    scrolledTo(640);
    act(() => openGraph("co2"));
    expect(el.textContent).toBe("graph");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

    scrolledTo(0);
    await act(async () => {
      const back = nextHashChange();
      window.history.back();
      await back;
    });
    expect(el.textContent).toBe("dashboard");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });
});
