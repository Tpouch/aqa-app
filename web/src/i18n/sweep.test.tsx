// @vitest-environment jsdom
// In English, no screen should show French. Renders the main screens with
// small fixtures and looks for accents and common French words.
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DeviceReport, DeviceSummary, Metric, MetricPeriod } from "../../../server/src/types";
import { Sidebar } from "../components/Sidebar";
import { TabBar } from "../mobile/TabBar";
import { InfoPage } from "../mobile/InfoPage";
import { CardPage } from "../pages/card/CardPage";
import { InfosPage } from "../pages/infos/InfosPage";
import { Login } from "../pages/Login";
import { Banner } from "../pages/measures/Banner";
import { ReportView } from "../pages/report/ReportView";
import { Setup } from "../pages/Setup";
import { setLang } from "./lang";
import { localizeReport } from "./vocab";

const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
beforeAll(() => setLang("en", mem));
afterAll(() => setLang("fr", mem));

// Accents, and French words that never appear in the English copy.
const FRENCH = /[éèàùâêîôûç]|\b(le|la|les|des|une|pour|avec|aucun|aucune|carte|mesures?|jamais|réglages)\b/i;
// Text only: attribute values that are data (ids, URLs) are not copy.
const text = (html: string) => html.replace(/<[^>]*>/g, " ");
const ariaLabels = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(" ");
const check = (html: string) => {
  // The language switch names French in French, on purpose (lang="fr").
  const own = html.replace(/<button[^>]*lang="fr"[^>]*>.*?<\/button>/gs, "");
  const visible = `${text(own)} ${ariaLabels(own)}`;
  expect(visible.match(FRENCH)?.[0] ?? null).toBeNull();
};

const board = {
  id: "aqa-24A160B3C8F0", name: "Office", created_at: 0, last_seen: 900, online: true, status_at: 900,
  latest: { ts: 900, co2: 950, pm25: 4, temp: 21.5, hum: 45, snd: 30 }, sound_calibration: null, open_alerts: 1,
  status: {
    firmware_version: "2.1.0", hardware_version: 1, uptime_s: 3600, boot_count: 3, rssi: -75, ssid: "home", ip: "10.0.0.2",
    queue: { pending: 2, dropped: 1 }, free_heap: 120000, geohash: "u09tv",
    sensors: { temperature: true, co2: "SCD41", pm: true, sound: false },
  },
} as unknown as DeviceSummary;

const zones = [{ word: "bon", tone: "good" as const, seconds: 700 }, { word: "aérer", tone: "warn" as const, seconds: 300 }, { word: "mauvais", tone: "bad" as const, seconds: 0 }];
const period: MetricPeriod = { measured_s: 1000, zones, avg: 742, min: null, max: null };
const empty: MetricPeriod = { measured_s: 0, zones: null, avg: null, min: null, max: null };
const report = {
  device_id: board.id, kind: "week", tz: "Europe/Paris", from: 0, to: 7 * 86400, prev_from: -7 * 86400, now: 8 * 86400, first_ts: 0,
  in_progress: false, elapsed_s: 7 * 86400, measured_s: 6 * 86400, prev_elapsed_s: 0, prev_measured_s: 0, sound_calibrated: false,
  verdict: { tone: "good", head: "Good week", rest: ": the air was good 86% of the time." },
  air: { current: { measured_s: 1, good_s: 1, warn_s: 0, bad_s: 0 }, previous: { measured_s: 0, good_s: 0, warn_s: 0, bad_s: 0 } },
  metrics: (["co2", "pm25", "snd", "temp", "hum"] as Metric[]).map((m) => ({ metric: m, current: m === "co2" ? period : empty, previous: empty, comparison: null })),
  heatmap: { metric: "co2", by: "weekday", rows: [{ weekday: 0, date: null, cells: Array(24).fill(600) }] },
  alerts: { current: 1, previous: 0, by_kind: [{ kind: "co2_high", label: "CO₂ élevé", count: 1 }] },
  takeaways: ["No alerts this week."],
} as unknown as DeviceReport;

describe("no French left in English mode", () => {
  it("login", () => check(renderToStaticMarkup(<Login onLogin={() => {}} />)));
  it("sidebar", () => check(renderToStaticMarkup(
    <Sidebar devices={[board, { ...board, id: "aqa-000000000002", name: "Den", online: false }]} device={board} onDevice={() => {}} tab="mesures"
             selection={{ view: "grid", metric: "co2", grid: ["co2", "temp"], compare: null, smoothing: "smooth" }} onSelection={() => {}}
             pending={1} alerts={1} unknown={1} onLogout={() => {}} now={1000} />)));
  it("measures banner", () => check(renderToStaticMarkup(
    <Banner headRef={createRef()} title="CO₂" subtitle="Rolling 24 h" range={{ kind: "preset", seconds: 86400 }}
            onRange={() => {}} today="2026-11-24" view="single" onView={() => {}} onCsv={() => {}} csvDisabled={false}
            smoothing="band" onSmoothing={() => {}} compare={{ choices: [{ id: "b", name: "Den" }], current: null, note: null, onPick: () => {} }} />)));
  it("report", () => check(renderToStaticMarkup(<ReportView report={localizeReport(report)} />)));
  it("board page", () => check(renderToStaticMarkup(
    <CardPage id={board.id} device={board} commands={[]} commandsError={null} reload={() => {}} send={async () => true} now={1000} />)));
  it("info page", () => check(renderToStaticMarkup(<InfosPage device={board} />)));
  it("add a board", () => check(renderToStaticMarkup(<Setup unknown={[]} first onDone={() => {}} />)));
  it("phone tabs and info", () => {
    check(renderToStaticMarkup(<TabBar tab="dashboard" alerts={2} />));
    check(renderToStaticMarkup(<InfoPage device={board} now={1000} onLogout={() => {}} />));
  });
});
