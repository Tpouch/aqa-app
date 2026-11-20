import {
  CloudIcon, DropIcon, SpeakerHighIcon, ThermometerIcon, WindIcon, type Icon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Metric } from "../../server/src/types";

export interface MetricInfo {
  label: string;
  unit: string;
  decimals: number;
  color: string;
  icon: Icon;
  // [warn, bad] thresholds, drawn on charts and turned into a text level.
  thresholds?: [number, number];
  thresholdSource?: string;
}

// Series colours checked for >= 3:1 against both the light and dark surfaces.
export const METRIC_INFO: Record<Metric, MetricInfo> = {
  co2: {
    label: "CO₂", unit: "ppm", decimals: 0, color: "#0d9488", icon: WindIcon,
    thresholds: [800, 1200], thresholdSource: "aération recommandée au-delà de 800 ppm",
  },
  pm25: {
    label: "PM2.5", unit: "µg/m³", decimals: 0, color: "#a21caf", icon: CloudIcon,
    thresholds: [15, 35], thresholdSource: "OMS 24 h : 15 µg/m³",
  },
  snd: { label: "Son", unit: "p2p", decimals: 0, color: "#2563eb", icon: SpeakerHighIcon },
  temp: { label: "Température", unit: "°C", decimals: 1, color: "#ea580c", icon: ThermometerIcon },
  hum: { label: "Humidité", unit: "%", decimals: 1, color: "#16a34a", icon: DropIcon },
};

export type Level = { tone: "good" | "warn" | "bad"; label: string };

// Colour is never the only signal: every level has a word.
export function level(metric: Metric, value: number | null | undefined): Level | null {
  const t = METRIC_INFO[metric].thresholds;
  if (!t || value === null || value === undefined) return null;
  if (value < t[0]) return { tone: "good", label: "Bon" };
  if (value < t[1]) return { tone: "warn", label: "Moyen" };
  return { tone: "bad", label: "Mauvais" };
}

export function fmt(value: number | null | undefined, decimals = 0): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
export function ago(epoch: number | null | undefined, nowSec = Date.now() / 1000): string {
  if (!epoch) return "jamais";
  const s = Math.max(0, Math.round(nowSec - epoch));
  if (s < 10) return "à l'instant";
  if (s < 60) return rtf.format(-s, "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

const dtf = new Intl.DateTimeFormat("fr", { dateStyle: "short", timeStyle: "short" });
export const dateTime = (epoch: number) => dtf.format(new Date(epoch * 1000));

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

export const nowS = () => Math.floor(Date.now() / 1000);

// Re-renders every `ms` so relative times ("il y a 2 min") stay true.
export function useNow(ms = 5000): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// Runs fn now and every intervalMs while the tab is visible.
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fnRef.current().then(
        (d) => { if (alive) { setData(d); setError(null); setUpdatedAt(Date.now() / 1000); } },
        (e: Error) => { if (alive) setError(e.message); },
      );
    };
    load();
    const timer = setInterval(load, intervalMs);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, tick]);

  return { data, error, updatedAt, reload: () => setTick((t) => t + 1) };
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => v === null ? "" : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
