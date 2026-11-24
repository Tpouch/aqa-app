// Wall-clock date and hour of an instant in a given IANA time zone, for the
// report (heat map, "vers 22 h"). Offsets change on the hour or half hour at
// most, so one Intl lookup per UTC half hour is enough.

export interface LocalTime {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = Monday … 6 = Sunday
  hour: number; // 0–23
}

export function isTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

export function localClock(tz: string): (ts: number) => LocalTime {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  });
  const offsets = new Map<number, number>(); // half hour index → offset in seconds

  const offsetAt = (ts: number) => {
    const key = Math.floor(ts / 1800);
    let off = offsets.get(key);
    if (off === undefined) {
      const at = key * 1800;
      const p = Object.fromEntries(fmt.formatToParts(new Date(at * 1000)).map((x) => [x.type, x.value]));
      off = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!) / 1000 - at;
      offsets.set(key, off);
    }
    return off;
  };

  return (ts) => {
    const d = new Date((ts + offsetAt(ts)) * 1000);
    return {
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      weekday: (d.getUTCDay() + 6) % 7,
      hour: d.getUTCHours(),
    };
  };
}
