import { expect, it } from "vitest";
import { moveItem, ORDER_KEY, readOrder, saveOrder } from "./order";

function storeWith(raw: string | null) {
  const m = new Map<string, string>();
  if (raw !== null) m.set(ORDER_KEY, raw);
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

it.each([
  [null, ["co2", "pm25", "snd", "temp", "hum"]],
  ["pas du json", ["co2", "pm25", "snd", "temp", "hum"]],
  ['["temp","co2"]', ["temp", "co2", "pm25", "snd", "hum"]],
  ['["hum","xyz","hum","co2"]', ["hum", "co2", "pm25", "snd", "temp"]],
  ['{"a":1}', ["co2", "pm25", "snd", "temp", "hum"]],
])("readOrder(%s)", (raw, want) => expect(readOrder(storeWith(raw))).toEqual(want));

it("saveOrder puis readOrder", () => {
  const st = storeWith(null);
  saveOrder(["hum", "co2", "pm25", "snd", "temp"], st);
  expect(readOrder(st)).toEqual(["hum", "co2", "pm25", "snd", "temp"]);
});

it("moveItem", () => {
  expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
});
