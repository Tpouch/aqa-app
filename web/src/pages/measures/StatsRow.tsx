import { bandOf, type MetricDef, type PeriodStats } from "../../metrics";
import { formatDuration } from "../../measures";
import { fmt } from "../../util";

const hm = new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit" });
const dm = new Intl.DateTimeFormat("fr", { day: "2-digit", month: "2-digit" });

// "à 13:50"; over more than a day the date is added, or the hour alone is ambiguous.
function when(ts: number, span: number) {
  const d = new Date(ts * 1000);
  return span > 86400 ? `le ${dm.format(d)} à ${hm.format(d)}` : `à ${hm.format(d)}`;
}

// MIN / MOYENNE / MAX / time in the alert zone, under the banner of the single-chart view.
export function StatsRow({ def, stats, span, period }: {
  def: MetricDef;
  // undefined while loading, null when the period has no measure.
  stats: PeriodStats | null | undefined;
  span: number;
  period: string;
}) {
  const avgBand = stats ? bandOf(def, stats.avg) : null;
  const maxBand = stats ? bandOf(def, stats.max.v) : null;
  const value = (v: number | undefined) => fmt(v, def.decimals);
  return (
    <dl className={`ms-stats${def.alertLabel ? "" : " three"}`}>
      <div>
        <dt className="label-caps">Min</dt>
        <dd className="ms-stat-value">{value(stats?.min.v)}</dd>
        <dd className="ms-stat-sub">{stats ? when(stats.min.ts, span) : stats === null ? "aucune mesure" : "\u00a0"}</dd>
      </div>
      <div>
        <dt className="label-caps">Moyenne</dt>
        <dd className="ms-stat-value">{value(stats?.avg)}</dd>
        <dd className={`ms-stat-sub${avgBand ? ` tone-${avgBand.tone}` : ""}`}>{avgBand ? `zone ${avgBand.word}` : " "}</dd>
      </div>
      <div>
        <dt className="label-caps">Max</dt>
        <dd className={`ms-stat-value${maxBand ? ` tone-${maxBand.tone}` : ""}`}>{value(stats?.max.v)}</dd>
        <dd className="ms-stat-sub">{stats ? when(stats.max.ts, span) : " "}</dd>
      </div>
      {def.alertLabel && (
        <div>
          <dt className="label-caps">{def.alertLabel}</dt>
          <dd className="ms-stat-value">{stats?.alertSeconds != null ? formatDuration(stats.alertSeconds) : "—"}</dd>
          <dd className="ms-stat-sub">sur {period}</dd>
        </div>
      )}
    </dl>
  );
}
