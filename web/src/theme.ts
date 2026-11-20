// Dark by default whatever the system says. The same logic runs inline in
// index.html before the bundle loads, so the first paint has the right theme.
export type Theme = "dark" | "light";

const KEY = "aqa-theme";

export function readTheme(storage?: Pick<Storage, "getItem">): Theme {
  try {
    return (storage ?? localStorage).getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: Theme, storage?: Pick<Storage, "setItem">): void {
  document.documentElement.dataset.theme = t;
  try {
    (storage ?? localStorage).setItem(KEY, t);
  } catch {
    // Private mode or blocked storage: the theme still applies for this visit.
  }
}
