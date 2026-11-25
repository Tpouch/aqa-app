// Intl formatters of the active language, built once per language and options.
import { locale } from "./lang";

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.Collator>();

function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.Collator>(
  kind: string, opts: object, make: (loc: string) => T,
): T {
  const loc = locale();
  const key = `${kind}|${loc}|${JSON.stringify(opts)}`;
  let f = cache.get(key) as T | undefined;
  if (!f) cache.set(key, (f = make(loc)));
  return f;
}

export const dateFmt = (opts: Intl.DateTimeFormatOptions) => cached("d", opts, (l) => new Intl.DateTimeFormat(l, opts));
export const numFmt = (opts: Intl.NumberFormatOptions) => cached("n", opts, (l) => new Intl.NumberFormat(l, opts));
export const relFmt = (opts: Intl.RelativeTimeFormatOptions) => cached("r", opts, (l) => new Intl.RelativeTimeFormat(l, opts));
export const collator = (opts: Intl.CollatorOptions) => cached("c", opts, (l) => new Intl.Collator(l, opts));
