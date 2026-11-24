// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePoll } from "./util";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// One pending answer per id, resolved by the test.
const pending = new Map<string, (v: string) => void>();
const load = (id: string) => new Promise<string>((resolve) => pending.set(id, resolve));

function Probe({ id }: { id: string }) {
  const { data } = usePoll(() => load(id), 60_000, [id]);
  return <p>{data ?? "loading"}</p>;
}

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  el = document.createElement("div");
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  pending.clear();
});

describe("usePoll", () => {
  it("n'affiche plus les données de l'ancien identifiant pendant que le nouveau charge", async () => {
    act(() => root.render(<Probe id="a" />));
    await act(async () => pending.get("a")!("données de a"));
    expect(el.textContent).toBe("données de a");

    act(() => root.render(<Probe id="b" />));
    expect(el.textContent).toBe("loading");
    await act(async () => pending.get("b")!("données de b"));
    expect(el.textContent).toBe("données de b");
  });
});
