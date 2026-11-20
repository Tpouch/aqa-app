// localStorage that never throws: with site data blocked, merely reading
// `localStorage` raises, and the app must still work for this visit.
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function storageGet(key: string, store?: Store): string | null {
  try {
    return (store ?? localStorage).getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string, store?: Store): void {
  try {
    (store ?? localStorage).setItem(key, value);
  } catch {
    // Blocked storage: the value holds only for this page view.
  }
}

export function storageRemove(key: string, store?: Store): void {
  try {
    (store ?? localStorage).removeItem(key);
  } catch {
    // Blocked storage: nothing was saved, nothing to remove.
  }
}
