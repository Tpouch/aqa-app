import { useEffect, useRef, useState } from "react";
import type { Metric } from "../../server/src/types";

export const METRIC_INFO: Record<Metric, { label: string; unit: string; decimals: number; color: string }> = {
  co2: { label: "CO₂", unit: "ppm", decimals: 0, color: "#0d9488" },
  pm25: { label: "PM2.5", unit: "µg/m³", decimals: 0, color: "#c026d3" },
  snd: { label: "Son", unit: "p2p", decimals: 0, color: "#2563eb" },
  temp: { label: "Température", unit: "°C", decimals: 1, color: "#ea580c" },
  hum: { label: "Humidité", unit: "%", decimals: 1, color: "#16a34a" },
};

// Thresholds commonly used for indoor air (CO₂: ventilation guidance; PM2.5: WHO 24 h).
export function level(metric: Metric, value: number | null): "good" | "warn" | "bad" | null {
  if (value === null) return null;
  if (metric === "co2") return value < 800 ? "good" : value < 1200 ? "warn" : "bad";
  if (metric === "pm25") return value < 15 ? "good" : value < 35 ? "warn" : "bad";
  return null;
}

export function fmt(value: number | null | undefined, decimals = 0): string {
  return value === null || value === undefined ? "—" : value.toFixed(decimals);
}

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
export function ago(epoch: number | null | undefined): string {
  if (!epoch) return "jamais";
  const s = Math.round(Date.now() / 1000 - epoch);
  if (s < 60) return rtf.format(-s, "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}

const dtf = new Intl.DateTimeFormat("fr", { dateStyle: "short", timeStyle: "medium" });
export const dateTime = (epoch: number) => dtf.format(new Date(epoch * 1000));

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

export const nowS = () => Math.floor(Date.now() / 1000);

// Runs fn now and every intervalMs while the tab is visible; returns the latest result.
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fnRef.current().then(
        (d) => { if (alive) { setData(d); setError(null); } },
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

  return { data, error, reload: () => setTick((t) => t + 1) };
}

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export const go = (path: string) => { window.location.hash = path; };
