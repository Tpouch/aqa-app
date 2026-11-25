import { Button, Skeleton } from "../../components/ui";
import { toDisplay } from "../../metrics";
import type { AlertRow, DeviceSummary } from "../../../../server/src/types";
import { dateTime, duration } from "../../util";
import { alertDate, alertEnding, alertValue } from "./format";
import { t } from "../../i18n/dict";

interface Props {
  open: AlertRow[] | undefined;
  history: AlertRow[] | undefined;
  error: string | null;
  device: DeviceSummary | null;
  now: number;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}

export function AlertJournal({ open, history, error, device, now, hasMore, loadingMore, onMore }: Props) {
  return (
    <section className="al-journal" aria-labelledby="al-journal-title">
      <h3 id="al-journal-title" className="label-caps">{t().alerts.journal}</h3>
      {!open && error ? (
        <p className="small tone-warn" role="alert"><span aria-hidden>▲</span> {t().alerts.loadFailed(error)}</p>
      ) : !open || !history ? <Skeleton height={200} /> : open.length === 0 && history.length === 0 ? (
        <p className="muted small al-empty">{t().alerts.noAlertsYet}</p>
      ) : (
        <>
          {open.length > 0 && (
            <ul className="al-now-list" aria-label={t().alerts.open}>
              {open.map((a) => <NowItem key={a.id} alert={a} device={device} now={now} />)}
            </ul>
          )}
          {history.length > 0 && (
            <ul className="al-log" aria-label={t().alerts.history}>
              {history.map((a) => {
                const ending = alertEnding(a);
                return (
                  <li key={a.id}>
                    <time className="muted" dateTime={new Date(a.started_at * 1000).toISOString()} title={dateTime(a.started_at)}>
                      {alertDate(a.started_at, now)}
                    </time>
                    <span className={`tone-${a.tone}`} aria-hidden>●</span>
                    <span className="al-log-what">
                      {a.label}{a.start_value !== null && <span className="muted"> ({alertValue(a, a.start_value)})</span>}
                    </span>
                    <span className="muted al-log-dur">{duration((a.ended_at ?? now) - a.started_at)}</span>
                    {ending && <span className="muted al-log-end">{ending}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {hasMore && (
            <Button variant="ghost" size="sm" className="al-more" onClick={onMore} loading={loadingMore}>{t().alerts.older}</Button>
          )}
        </>
      )}
    </section>
  );
}

function NowItem({ alert: a, device, now }: { alert: AlertRow; device: DeviceSummary | null; now: number }) {
  const raw = a.metric && device?.latest ? device.latest[a.metric] : null;
  const current = a.metric ? toDisplay(a.metric, raw, device?.sound_calibration ?? null) : null;
  return (
    <li className={`al-now ${a.tone}`}>
      <div className="al-now-top">
        <span className={`tone-${a.tone}`}>{a.label}{current !== null && <> · {alertValue(a, current)}</>}</span>
        <span className="muted">{t().alerts.since(duration(Math.max(0, now - a.started_at)))}</span>
      </div>
      <p className="al-now-tip"><span className="muted" aria-hidden>→ </span>{a.advice}</p>
    </li>
  );
}
