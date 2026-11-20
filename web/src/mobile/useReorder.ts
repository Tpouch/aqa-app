import { useLayoutEffect, useRef, useState } from "react";
import type { Metric } from "../../../server/src/types";
import { moveItem } from "./order";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Drag to reorder the gauges of a grid, with Pointer Events only. The lifted
// gauge follows the finger; when the finger is over another slot the order
// changes and the other gauges slide to their new place (FLIP, 150 ms).
export function useReorder(order: Metric[], onChange: (o: Metric[]) => void, enabled: boolean) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [lifted, setLifted] = useState<Metric | null>(null);
  const drag = useRef<{ metric: Metric; el: HTMLElement; grabX: number; grabY: number; x: number; y: number } | null>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const orderRef = useRef(order);
  orderRef.current = order;

  const items = () => Array.from(gridRef.current?.querySelectorAll<HTMLElement>("[data-metric]") ?? []);

  // Lifted gauge: put it under the finger again, wherever its slot now is.
  const follow = () => {
    const d = drag.current;
    if (!d) return;
    d.el.style.transform = "";
    const r = d.el.getBoundingClientRect();
    d.el.style.transform = `translate(${d.x - d.grabX - r.left}px, ${d.y - d.grabY - r.top}px) scale(1.04)`;
  };

  // After each reorder: the lifted one follows the finger, the others slide from where they were.
  useLayoutEffect(() => {
    const animate = !reducedMotion();
    for (const el of items()) {
      const key = el.dataset.metric!;
      const now = el.getBoundingClientRect();
      const before = rects.current.get(key);
      if (animate && before && key !== drag.current?.metric) {
        const dx = before.left - now.left;
        const dy = before.top - now.top;
        if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 150, easing: "ease-out" });
      }
      rects.current.set(key, now);
    }
    follow();
  }, [order]);

  const end = () => {
    const d = drag.current;
    if (!d) return;
    d.el.style.transform = "";
    drag.current = null;
    setLifted(null);
    for (const el of items()) rects.current.set(el.dataset.metric!, el.getBoundingClientRect());
  };

  const bind = (metric: Metric) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || drag.current || (e.target as HTMLElement).closest("button")) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.setPointerCapture(e.pointerId);
      drag.current = { metric, el, grabX: e.clientX - r.left, grabY: e.clientY - r.top, x: e.clientX, y: e.clientY };
      for (const it of items()) rects.current.set(it.dataset.metric!, it.getBoundingClientRect());
      setLifted(metric);
      follow();
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.metric !== metric) return;
      d.x = e.clientX;
      d.y = e.clientY;
      follow();
      // Slot under the finger, judged on where the other gauges sit (not their animation).
      const over = items().find((el) => {
        if (el === d.el) return false;
        const r = rects.current.get(el.dataset.metric!);
        return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (!over) return;
      const list = orderRef.current;
      const from = list.indexOf(metric);
      const to = list.indexOf(over.dataset.metric as Metric);
      if (from >= 0 && to >= 0 && from !== to) onChange(moveItem(list, from, to));
    },
    onPointerUp: end,
    onPointerCancel: end,
  });

  return { lifted, bind, gridRef };
}
