import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeviceReport, Metric, MetricPeriod } from "../../../../server/src/types";
import { ReportView } from "./ReportView";

const empty: MetricPeriod = { measured_s: 0, zones: null, avg: null, min: null, max: null };
const co2: MetricPeriod = {
  measured_s: 1000, avg: 742, min: null, max: null,
  zones: [{ word: "bon", tone: "good", seconds: 720 }, { word: "aérer", tone: "warn", seconds: 220 }, { word: "mauvais", tone: "bad", seconds: 60 }],
};
const FROM = new Date(2026, 10, 16).getTime() / 1000;

function report(over: Partial<DeviceReport> = {}): DeviceReport {
  return {
    device_id: "aqa-24A160B3C8F0", kind: "week", tz: "Europe/Paris", from: FROM, to: FROM + 7 * 86400, prev_from: FROM - 7 * 86400,
    now: FROM + 8 * 86400, first_ts: FROM, in_progress: false, elapsed_s: 7 * 86400, measured_s: 7 * 86400, prev_elapsed_s: 7 * 86400,
    prev_measured_s: 7 * 86400, sound_calibrated: false,
    verdict: { tone: "good", head: "Bonne semaine", rest: " : l'air a été bon 86 % du temps." },
    air: { current: { measured_s: 1000, good_s: 860, warn_s: 140, bad_s: 0 }, previous: { measured_s: 0, good_s: 0, warn_s: 0, bad_s: 0 } },
    metrics: (["co2", "pm25", "snd", "temp", "hum"] as Metric[]).map((m) => ({
      metric: m, current: m === "co2" ? co2 : m === "snd" ? { ...empty, measured_s: 1000, avg: 84 } : empty, previous: empty,
      comparison: m === "co2" ? { trend: "better", text: "Mieux que la semaine dernière : 6 % du temps en zone mauvaise, contre 11 %." } : null,
    })),
    heatmap: { metric: "co2", by: "day", rows: Array.from({ length: 7 }, (_, i) => ({
      weekday: i, date: `2026-11-${16 + i}`, cells: Array.from({ length: 24 }, (_, h) => (h === 22 ? 1300 : i === 2 ? null : 600)),
    })) },
    alerts: { current: 0, previous: 0, by_kind: [] },
    takeaways: ["Le CO₂ dépasse 1 200 ppm presque chaque soir vers 22 h : aère avant de dormir.", "Aucune alerte cette semaine."],
    ...over,
  };
}
const html = (r: DeviceReport, compact = false) => renderToStaticMarkup(<ReportView report={r} compact={compact} />);

describe("ReportView", () => {
  it("affiche le verdict et une ligne par mesure", () => {
    const out = html(report());
    expect(out).toContain("Bonne semaine");
    for (const label of ["CO₂", "PM2.5", "Son", "Température", "Humidité"]) expect(out).toContain(label);
    expect(out).toContain("Mieux que la semaine dernière");
    expect(out).toContain("742");
  });
  it("le son non calibré n'a pas de zones", () => {
    expect(html(report())).toContain("pas de zones tant que le son n&#x27;est pas calibré");
    expect(html(report())).toContain("Calibrer");
    expect(html(report(), true)).not.toContain(">Calibrer<");
  });
  it("dessine la carte de chaleur 7 × 24", () => {
    const out = html(report());
    expect(out.match(/<tr class="rp-heat-row">/g)).toHaveLength(7);
    expect(out.match(/<td class="rp-c /g)).toHaveLength(7 * 24);
    expect(out).toContain("rp-c bad");
    expect(out).toContain("rp-c none");
  });
  it("liste les constats", () => {
    const out = html(report());
    expect(out).toMatch(/<ol class="rp-take">(<li>.*?<\/li>){2}<\/ol>/);
  });
  it("sans mesure, garde seulement le verdict", () => {
    const out = html(report({ measured_s: 0, verdict: { tone: null, head: "Pas de mesure", rest: " cette semaine." }, takeaways: [] }));
    expect(out).toContain("Pas de mesure");
    expect(out).not.toContain("rp-heat-row");
  });
});
