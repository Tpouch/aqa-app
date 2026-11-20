import { useSyncExternalStore } from "react";
import { PHONE_QUERY } from "./routes";

function query(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(PHONE_QUERY) : null;
}

function subscribe(onChange: () => void) {
  const q = query();
  q?.addEventListener("change", onChange);
  return () => q?.removeEventListener("change", onChange);
}

/** True on a phone (see PHONE_QUERY); follows rotation and emulation changes. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false);
}
