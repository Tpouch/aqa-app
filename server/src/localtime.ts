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

// Offset (seconds east of UTC) of a zone at an instant, cached per half hour.
function offsetLookup(tz: string): (ts: number) => number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  });
  const offsets = new Map<number, number>(); // half hour index → offset in seconds

  return (ts) => {
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
}

export function localClock(tz: string): (ts: number) => LocalTime {
  const offsetAt = offsetLookup(tz);
  return (ts) => {
    const d = new Date((ts + offsetAt(ts)) * 1000);
    return {
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      weekday: (d.getUTCDay() + 6) % 7,
      hour: d.getUTCHours(),
    };
  };
}

// Unix seconds of 00:00 local on YYYY-MM-DD. The offset is resolved at the
// local midnight itself (guess, then correct once), so 23 h and 25 h days hold.
export function localMidnight(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!) / 1000;
  const offsetAt = offsetLookup(tz);
  const first = offsetAt(guess);
  const t = guess - first;
  const second = offsetAt(t);
  return second === first ? t : guess - second;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

// "2026-11-24T21:00:00+01:00"
export function isoLocal(ts: number, tz: string): string {
  return isoLocalWith(ts, offsetLookup(tz)(ts));
}

function isoLocalWith(ts: number, off: number): string {
  const d = new Date((ts + off) * 1000);
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(a / 3600))}:${pad(Math.floor((a % 3600) / 60))}`;
}

const TIME_KEYS = new Set(["ts", "from", "to", "prev_from", "now", "first_ts"]);

// Deep copy where every unix-seconds field becomes an ISO string with offset.
export function withIsoTimes<T>(value: T, tz: string): unknown {
  const offsetAt = offsetLookup(tz);
  const iso = (ts: number) => isoLocalWith(ts, offsetAt(ts));
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === "number" && key !== undefined && (TIME_KEYS.has(key) || key.endsWith("_at"))) return iso(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    }
    return v;
  };
  return walk(value);
}
