import { useCallback, useState } from "react";

// The period of the Bilan tab: a calendar week (Monday → Monday) or a calendar
// month, in local time, with the one just before it for the comparison.
export type PeriodKind = "week" | "month";

export interface Period {
  kind: PeriodKind;
  offset: number; // 0 = the period containing now, -1 = the one before…
  current: boolean;
  from: number; // seconds, [from, to)
  to: number;
  prevFrom: number; // previous period: [prevFrom, from)
  label: string; // "23 – 29 nov.", "novembre 2026"
  long: string; // "semaine du 23 au 29 novembre 2026", "mois de novembre 2026"
}

const sec = (d: Date) => d.getTime() / 1000;
const shortMonth = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const longMonth = new Intl.DateTimeFormat("fr-FR", { month: "long" });
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function weekLabels(first: Date, last: Date): { label: string; long: string } {
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();
  const d1 = first.getDate(), d2 = last.getDate();
  const m1 = shortMonth.format(first), m2 = shortMonth.format(last);
  const M1 = longMonth.format(first), M2 = longMonth.format(last);
  const y1 = first.getFullYear(), y2 = last.getFullYear();
  if (sameMonth) return { label: `${d1} – ${d2} ${m2}`, long: `semaine du ${d1} au ${d2} ${M2} ${y2}` };
  if (sameYear) return { label: `${d1} ${m1} – ${d2} ${m2}`, long: `semaine du ${d1} ${M1} au ${d2} ${M2} ${y2}` };
  return { label: `${d1} ${m1} ${y1} – ${d2} ${m2} ${y2}`, long: `semaine du ${d1} ${M1} ${y1} au ${d2} ${M2} ${y2}` };
}

export function periodAt(kind: PeriodKind, offset: number, now: Date): Period {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (kind === "week") {
    // new Date(y, m, day) stays on local midnight across clock changes.
    const monday = d - ((now.getDay() + 6) % 7) + 7 * offset;
    const first = new Date(y, m, monday);
    const { label, long } = weekLabels(first, new Date(y, m, monday + 6));
    return {
      kind, offset, current: offset === 0, label, long,
      from: sec(first), to: sec(new Date(y, m, monday + 7)), prevFrom: sec(new Date(y, m, monday - 7)),
    };
  }
  const first = new Date(y, m + offset, 1);
  const label = monthYear.format(first);
  return {
    kind, offset, current: offset === 0, label, long: `mois de ${label}`,
    from: sec(first), to: sec(new Date(y, m + offset + 1, 1)), prevFrom: sec(new Date(y, m + offset - 1, 1)),
  };
}

const KEY = "aqa-report-kind";

// Week or month, kept for the browser tab's lifetime.
export function useReportKind(): [PeriodKind, (k: PeriodKind) => void] {
  const [kind, setKind] = useState<PeriodKind>(() => {
    try {
      return sessionStorage.getItem(KEY) === "month" ? "month" : "week";
    } catch {
      return "week";
    }
  });
  const update = useCallback((k: PeriodKind) => {
    try {
      sessionStorage.setItem(KEY, k);
    } catch {
      // Blocked storage: the choice still holds for this page view.
    }
    setKind(k);
  }, []);
  return [kind, update];
}
