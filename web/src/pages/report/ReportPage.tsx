import { useMemo, useState } from "react";
import { api } from "../../api";
import { Skeleton } from "../../components/ui";
import type { DeviceSummary } from "../../../../server/src/types";
import { useNow, usePoll } from "../../util";
import { periodAt, useReportKind } from "./period";
import { ReportView } from "./ReportView";
import { t } from "../../i18n/dict";

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Bilan tab: picks the week or month, loads its report and shows it.
// Rendered with key={id} so a board switch starts over on the current period.
export function ReportPage({ id, device, compact = false }: {
  id: string;
  device: DeviceSummary | undefined;
  compact?: boolean;
}) {
  const [kind, setKind] = useReportKind();
  const [offset, setOffset] = useState(0);
  // The day changes while the tab stays open: on Monday 00:00 "this week" moves on.
  const today = new Date(useNow(60_000) * 1000).toDateString();
  const period = useMemo(() => periodAt(kind, offset, new Date()), [kind, offset, today]);
  // The period in progress changes every few minutes; a past one only if a
  // late frame arrives, and a failed load is retried at the same pace.
  const report = usePoll(() => api.report(id, period, TZ), period.current ? 5 * 60_000 : 30 * 60_000,
                         [id, period.from, period.kind]);
  const data = report.data;
  // Nothing to see before the board's first measurement (or its registration,
  // if older: a board's queue can hold frames from before it was added).
  // Kept while the next period loads, so ‹ does not flicker to disabled.
  const [firstTs, setFirstTs] = useState<number | null>(null);
  if (data && data.first_ts !== firstTs) setFirstTs(data.first_ts);
  const oldest = Math.min(device?.created_at ?? Infinity, firstTs ?? Infinity);
  const first = period.from <= oldest;

  const pickKind = (k: typeof kind) => {
    if (k === kind) return;
    setKind(k);
    setOffset(0);
  };

  const w = t().report;
  return (
    <div className={`rp${compact ? " compact" : ""}`}>
      <header className="rp-head">
        <div className="rp-title">
          <h2>{w.title}{device && !compact && <> · {device.name}</>}</h2>
          <p className="muted">{period.long}{period.current && w.inProgress}</p>
        </div>
        <div className="rp-tools">
          <div className="seg" role="group" aria-label={w.length}>
            <button type="button" aria-pressed={kind === "week"} onClick={() => pickKind("week")}>{w.week}</button>
            <button type="button" aria-pressed={kind === "month"} onClick={() => pickKind("month")}>{w.month}</button>
          </div>
          <div className="seg rp-nav" role="group" aria-label={w.period}>
            <button type="button" disabled={first} onClick={() => setOffset(offset - 1)}
                    aria-label={kind === "week" ? w.prevWeek : w.prevMonth}>‹</button>
            <span className="rp-period" aria-live="polite">{period.label}</span>
            <button type="button" disabled={period.current} onClick={() => setOffset(offset + 1)}
                    aria-label={kind === "week" ? w.nextWeek : w.nextMonth}>›</button>
          </div>
        </div>
      </header>

      {report.error && !data ? (
        <p className="callout warn rp-error" role="alert"><span aria-hidden>▲</span> {report.error}</p>
      ) : !data ? (
        <div className="rp-loading"><Skeleton height={compact ? 120 : 90} /><Skeleton height={360} /></div>
      ) : (
        <ReportView report={data} compact={compact} />
      )}
    </div>
  );
}
