// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceSummary, Metric } from "../../../server/src/types";
import { DashboardPage } from "./DashboardPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const device = {
  id: "aqa-A", name: "Chambre", online: true, latest: null, sound_calibration: null, open_alerts: 0,
} as unknown as DeviceSummary;

let root: Root;
let el: HTMLDivElement;
let onOpen: ReturnType<typeof vi.fn<(m: Metric) => void>>;

// Fake layout: two columns of 200 px squares, moved up by the page scroll.
let scroll = 0;
function fakeRect(this: HTMLElement) {
  if (!this.dataset.metric) return new DOMRect(0, 0, 0, 0);
  const i = Array.from(this.parentElement!.children).indexOf(this);
  return new DOMRect((i % 2) * 200, Math.floor(i / 2) * 200 - scroll, 190, 190);
}

const gauges = () => Array.from(el.querySelectorAll<HTMLElement>("[data-metric]"));
const button = (text: string) => Array.from(el.querySelectorAll("button")).find((b) => b.textContent === text)!;
const pointer = (target: Element, type: string, init: PointerEventInit = {}) =>
  act(() => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, button: 0, pointerId: 1, ...init })); });

beforeEach(() => {
  vi.useFakeTimers();
  scroll = 0;
  localStorage.clear();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(fakeRect);
  HTMLElement.prototype.animate = vi.fn();
  onOpen = vi.fn<(m: Metric) => void>();
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  act(() => root.render(<DashboardPage device={device} onOpen={onOpen} />));
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("DashboardPage, organiser", () => {
  it("après un défilement, ↓ ne fait glisser que les deux jauges échangées", () => {
    act(() => button("organiser").click());
    scroll = 300;
    const down = el.querySelector<HTMLButtonElement>('[aria-label^="Descendre"]')!;
    act(() => down.click());
    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(2);
  });
});
