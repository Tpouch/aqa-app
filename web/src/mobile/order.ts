import { storageGet, storageSet } from "../storage";
import { METRICS, type Metric } from "../../../server/src/types";

// Order of the dashboard gauges, kept on this phone and shared by every board.
export const ORDER_KEY = "aqa-gauge-order";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Saved order, cleaned: unknown and repeated entries dropped, missing metrics appended in METRICS order. */
export function readOrder(store?: Store): Metric[] {
  let saved: unknown = null;
  try {
    saved = JSON.parse(storageGet(ORDER_KEY, store) ?? "null");
  } catch {
    saved = null;
  }
  const list = Array.isArray(saved) ? saved : [];
  const out: Metric[] = [];
  for (const m of list) {
    if ((METRICS as readonly unknown[]).includes(m) && !out.includes(m as Metric)) out.push(m as Metric);
  }
  for (const m of METRICS) if (!out.includes(m)) out.push(m);
  return out;
}

export function saveOrder(order: Metric[], store?: Store): void {
  storageSet(ORDER_KEY, JSON.stringify(order), store);
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item!);
  return out;
}
