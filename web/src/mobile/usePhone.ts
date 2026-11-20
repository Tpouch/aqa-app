import { useSyncExternalStore } from "react";
import { COARSE_QUERY, isPhoneScreen } from "./routes";

function query(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(COARSE_QUERY) : null;
}

function subscribe(onChange: () => void) {
  const q = query();
  q?.addEventListener("change", onChange);
  return () => q?.removeEventListener("change", onChange);
}

const snapshot = () => isPhoneScreen(query()?.matches ?? false, screen.width, screen.height);

/** True on a phone (see isPhoneScreen); follows pointer changes such as DevTools emulation. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
