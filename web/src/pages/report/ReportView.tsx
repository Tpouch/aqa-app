import type { Comparison, DeviceReport, HeatRow, MetricReport } from "../../../../server/src/types";
import { bandOf, metricDef, type MetricDef } from "../../metrics";
import { duration, fmt } from "../../util";
import { t } from "../../i18n/dict";
import { getLang } from "../../i18n/lang";

// The report itself, for one period, as the server computed it. Pure render:
// ReportPage fetches it, the phone tab reuses it with `compact`.
export function ReportView({ report, compact = false }: { report: DeviceReport; compact?: boolean }) {
  const v = report.verdict;
  const gap = report.measured_s > 0 && report.measured_s < report.elapsed_s * 0.95;
  const w = t().report;
  return (
    <>
      <section className="rp-verdict" aria-label="Verdict">
        <p className="rp-verdict-text">
          <b className={v.tone ? `tone-${v.tone}` : undefined}>{v.head}</b>{v.rest}
        </p>
        {gap && (
          <p className="rp-sub">
            {w.measuredOutOf(duration(report.measured_s), duration(report.elapsed_s))}
          </p>
        )}
      </section>

      {report.measured_s > 0 && (
        <>
          <h3 className="label-caps rp-section-title">{w.perReading}</h3>
          <ul className="rp-metrics">
            {report.metrics.map((m) => <MetricLine key={m.metric} m={m} report={report} compact={compact} />)}
          </ul>

          <div className="rp-lower">
            <section className="rp-heat-wrap" aria-labelledby="rp-heat-title">
              <h3 id="rp-heat-title" className="label-caps rp-section-title">
                {w.co2Hourly}{report.heatmap.by === "weekday" && <span className="rp-title-note">{w.averageDay}</span>}
              </h3>
              <HeatMap report={report} compact={compact} />
            </section>
            {report.takeaways.length > 0 && (
              <section aria-labelledby="rp-take-title">
                <h3 id="rp-take-title" className="label-caps rp-section-title">{w.takeaways}</h3>
                <ol className="rp-take">{report.takeaways.map((s) => <li key={s}>{s}</li>)}</ol>
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}

// metricDef only checks whether a calibration exists; the report says so.
const CALIBRATED = { snd_ref: 1, db_ref: 0 };

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

function MetricLine({ m, report, compact }: { m: MetricReport; report: DeviceReport; compact: boolean }) {
  const def = metricDef(m.metric, report.sound_calibrated ? CALIBRATED : null);
  const p = m.current;
  const band = bandOf(def, p.avg);
  const zones = p.zones?.filter((z) => z.seconds > 0) ?? [];
  const w = t().report;
  return (
    <li className="rp-metric">
      <div className="rp-m-name">{def.label}<small>{def.unit}</small></div>
      <div className="rp-m-bar">
        {p.measured_s === 0 ? (
          <p className="rp-note">{w.noReading}</p>
        ) : !p.zones ? (
          <p className="rp-note">
            {w.noZones}
            {!compact && <> · <a href="#/reglages">{w.calibrate}</a></>}
          </p>
        ) : (
          <>
            <div className="rp-bar" aria-hidden>
              {zones.map((z) => (
                <span key={z.word} className={z.tone} style={{ flexGrow: z.seconds }} title={`${z.word}${w.colon}${duration(z.seconds)}`} />
              ))}
            </div>
            <p className="rp-legend">
              {p.zones.map((z) => (
                <span key={z.word} title={duration(z.seconds)}>
                  <b className={`tone-${z.tone}`}>{z.word}</b> {pct(z.seconds, p.measured_s)}{getLang() === "en" ? "" : "\u00a0"}%
                </span>
              ))}
            </p>
          </>
        )}
      </div>
      <div className="rp-avg">
        <b className={band ? `tone-${band.tone}` : undefined}>{fmt(p.avg, def.decimals)}</b>
        <small>{w.average}{band && <> · {band.word}</>}</small>
      </div>
      <CompareLine c={m.comparison} />
    </li>
  );
}

const TREND = {
  better: { mark: "▼", tone: "tone-good" },
  worse: { mark: "▲", tone: "tone-bad" },
  same: { mark: "=", tone: "" },
} as const;

function CompareLine({ c }: { c: Comparison | null }) {
  if (!c) return <p className="rp-cmp" />;
  if (!c.trend) return <p className="rp-cmp">{c.text}</p>;
  // "Mieux que la semaine dernière : 6 % du temps…" / "Better than last week: 6%…"
  // → marked head, plain rest.
  const m = c.text.match(/\s?:\s/);
  const cut = m?.index ?? -1;
  const head = cut > 0 ? c.text.slice(0, cut) : c.text;
  const rest = cut > 0 ? c.text.slice(cut + m![0].length) : "";
  const tr = TREND[c.trend];
  return (
    <p className="rp-cmp">
      <span className={`rp-trend ${tr.tone}`}><span aria-hidden>{tr.mark} </span>{head}</span>
      <span className="sr-only">{t().report.colon}</span>
      {rest && rest[0]!.toUpperCase() + rest.slice(1)}
    </p>
  );
}


function rowLabel(r: HeatRow, compact: boolean): { short: string; long: string } {
  const day = r.date ? Number(r.date.slice(8)) : null;
  const w = t().report;
  const short = (compact ? w.dayTiny : w.dayShort)[r.weekday]!;
  return day === null
    ? { short, long: w.everyDay(w.dayLong[r.weekday]!) }
    : { short: `${short} ${day}`, long: `${w.dayLong[r.weekday]} ${day}` };
}

function HeatMap({ report, compact }: { report: DeviceReport; compact: boolean }) {
  const def = metricDef("co2", null);
  const every = compact ? 6 : 3;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <>
      <table className="rp-heat">
        <caption className="sr-only">
          {t().report.heatCaption(report.heatmap.by === "weekday")}
        </caption>
        <thead>
          <tr>
            <td />
            {hours.map((h) => (
              <th key={h} scope="col">
                {h % every === 0 ? <>{t().report.hour(h)}</> : <span className="sr-only">{t().report.hour(h)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.heatmap.rows.map((r) => {
            const label = rowLabel(r, compact);
            return (
              <tr key={r.weekday} className="rp-heat-row">
                <th scope="row"><span aria-hidden>{label.short}</span><span className="sr-only">{label.long}</span></th>
                {r.cells.map((v, h) => <HeatCell key={h} v={v} h={h} row={r} def={def} now={report.now} label={label.long} />)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="rp-key">
        {def.bands!.map((b) => <span key={b.word}><i className={b.tone} aria-hidden />{b.word}</span>)}
        <span><i className="none" aria-hidden />{t().report.noReading}</span>
      </p>
    </>
  );
}

function HeatCell({ v, h, row, def, now, label }: {
  v: number | null; h: number; row: HeatRow; def: MetricDef; now: number; label: string;
}) {
  // An hour still to come in the current week: nothing to show, not even a frame.
  if (v === null && row.date) {
    const [y, m, d] = row.date.split("-").map(Number);
    if (new Date(y!, m! - 1, d!, h).getTime() / 1000 >= now) {
      return <td className="rp-c future"><span className="sr-only">{t().report.toCome(h)}</span></td>;
    }
  }
  const band = bandOf(def, v);
  const text = v === null ? t().report.cellNone(label, h) : t().report.cell(label, h, fmt(v), band?.word ?? "");
  return (
    <td className={`rp-c ${band ? band.tone : "none"}`} title={text}>
      <span className="sr-only">{text}</span>
    </td>
  );
}
