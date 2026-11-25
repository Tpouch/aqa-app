// Language of the interface: French by default, English on request. The same
// rule runs inline in index.html before the bundle loads (lang + title).
// Read at call time by t() and the formatters, so plain helpers translate too.
import { useSyncExternalStore } from "react";
import { storageSet } from "../storage";

export type Lang = "fr" | "en";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY = "aqa-lang";
const TITLE: Record<Lang, string> = { fr: "AQA · Capteurs", en: "AQA · Sensors" };

export function readLang(store?: Pick<Storage, "getItem">): Lang {
  try {
    return (store ?? localStorage).getItem(KEY) === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

let current: Lang = readLang();
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;
export const locale = (): "fr-FR" | "en-GB" => (current === "en" ? "en-GB" : "fr-FR");

/** Puts the language on <html lang> and the tab title. */
export function markDocument(l: Lang = current): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = l;
  document.title = TITLE[l];
}

export function setLang(l: Lang, store?: Store): void {
  current = l;
  storageSet(KEY, l, store);
  markDocument(l);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-renders the caller when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

