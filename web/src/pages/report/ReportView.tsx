import type { Comparison, DeviceReport, HeatRow, MetricReport } from "../../../../server/src/types";
import { bandOf, metricDef, type MetricDef } from "../../metrics";
import { duration, fmt } from "../../util";

// The report itself, for one period, as the server computed it. Pure render:
// ReportPage fetches it, the phone tab reuses it with `compact`.
export function ReportView({ report, compact = false }: { report: DeviceReport; compact?: boolean }) {
  const v = report.verdict;
  const gap = report.measured_s > 0 && report.measured_s < report.elapsed_s * 0.95;
  return (
    <>
      <section className="rp-verdict" aria-label="Verdict">
        <p className="rp-verdict-text">
          <b className={v.tone ? `tone-${v.tone}` : undefined}>{v.head}</b>{v.rest}
        </p>
        {gap && (
          <p className="rp-sub">
            mesuré {duration(report.measured_s)} sur {duration(report.elapsed_s)} · le reste sans mesure, non compté
          </p>
        )}
      </section>

      {report.measured_s > 0 && (
        <>
          <h3 className="label-caps rp-section-title">Par mesure</h3>
          <ul className="rp-metrics">
            {report.metrics.map((m) => <MetricLine key={m.metric} m={m} report={report} compact={compact} />)}
          </ul>

          <div className="rp-lower">
            <section className="rp-heat-wrap" aria-labelledby="rp-heat-title">
              <h3 id="rp-heat-title" className="label-caps rp-section-title">
                CO₂ heure par heure{report.heatmap.by === "weekday" && <span className="rp-title-note"> · jour moyen</span>}
              </h3>
              <HeatMap report={report} compact={compact} />
            </section>
            {report.takeaways.length > 0 && (
              <section aria-labelledby="rp-take-title">
                <h3 id="rp-take-title" className="label-caps rp-section-title">À retenir</h3>
                <ol className="rp-take">{report.takeaways.map((t) => <li key={t}>{t}</li>)}</ol>
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
  return (
    <li className="rp-metric">
      <div className="rp-m-name">{def.label}<small>{def.unit}</small></div>
      <div className="rp-m-bar">
        {p.measured_s === 0 ? (
          <p className="rp-note">pas de mesure</p>
        ) : !p.zones ? (
          <p className="rp-note">
            pas de zones tant que le son n'est pas calibré
            {!compact && <> · <a href="#/reglages">Calibrer</a></>}
          </p>
        ) : (
          <>
            <div className="rp-bar" aria-hidden>
              {zones.map((z) => (
                <span key={z.word} className={z.tone} style={{ flexGrow: z.seconds }} title={`${z.word} : ${duration(z.seconds)}`} />
              ))}
            </div>
            <p className="rp-legend">
              {p.zones.map((z) => (
                <span key={z.word} title={duration(z.seconds)}>
                  <b className={`tone-${z.tone}`}>{z.word}</b> {pct(z.seconds, p.measured_s)}&nbsp;%
                </span>
              ))}
            </p>
          </>
        )}
      </div>
      <div className="rp-avg">
        <b className={band ? `tone-${band.tone}` : undefined}>{fmt(p.avg, def.decimals)}</b>
        <small>moyenne{band && <> · {band.word}</>}</small>
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
  // "Mieux que la semaine dernière : 6 % du temps…" → marked head, plain rest.
  const cut = c.text.search(/\s:\s/);
  const head = cut > 0 ? c.text.slice(0, cut) : c.text;
  const rest = cut > 0 ? c.text.slice(cut + 3) : "";
  const t = TREND[c.trend];
  return (
    <p className="rp-cmp">
      <span className={`rp-trend ${t.tone}`}><span aria-hidden>{t.mark} </span>{head}</span>
      <span className="sr-only"> : </span>
      {rest && rest[0]!.toUpperCase() + rest.slice(1)}
    </p>
  );
}

const DAY_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const DAY_TINY = ["lu", "ma", "me", "je", "ve", "sa", "di"];
const DAY_LONG = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function rowLabel(r: HeatRow, compact: boolean): { short: string; long: string } {
  const day = r.date ? Number(r.date.slice(8)) : null;
  const short = (compact ? DAY_TINY : DAY_SHORT)[r.weekday]!;
  return day === null
    ? { short, long: `${DAY_LONG[r.weekday]}s` }
    : { short: `${short} ${day}`, long: `${DAY_LONG[r.weekday]} ${day}` };
}

function HeatMap({ report, compact }: { report: DeviceReport; compact: boolean }) {
  const def = metricDef("co2", null);
  const every = compact ? 6 : 3;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <>
      <table className="rp-heat">
        <caption className="sr-only">
          CO₂ moyen par heure{report.heatmap.by === "weekday" ? ", moyenne par jour de la semaine" : ""}
        </caption>
        <thead>
          <tr>
            <td />
            {hours.map((h) => (
              <th key={h} scope="col">
                {h % every === 0 ? <>{h}&nbsp;h</> : <span className="sr-only">{h} h</span>}
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
        <span><i className="none" aria-hidden />pas de mesure</span>
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
      return <td className="rp-c future"><span className="sr-only">{h} h : à venir</span></td>;
    }
  }
  const band = bandOf(def, v);
  const text = v === null ? `${label}, ${h} h : pas de mesure` : `${label}, ${h} h : ${fmt(v)} ppm (${band?.word})`;
  return (
    <td className={`rp-c ${band ? band.tone : "none"}`} title={text}>
      <span className="sr-only">{text}</span>
    </td>
  );
}
