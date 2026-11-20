import { useEffect, useState } from "react";
import { api } from "../../api";
import { useToast } from "../../components/ui";
import type { AlertRow, AlertRule, DeviceSummary } from "../../../../server/src/types";
import { useNow, usePoll } from "../../util";
import { AlertJournal } from "./AlertJournal";
import { RuleList } from "./RuleList";

const PAGE = 50; // server default limit

// Rendered with key={id}: a card switch remounts the page, so the poll data,
// older pages and in-flight "plus ancien" requests never mix two cards.
export function AlertsPage({ id, device }: { id: string; device: DeviceSummary | null }) {
  const toast = useToast();
  const now = useNow(30000);
  const journal = usePoll(() => api.alerts(id), 15000, [id]);
  const [older, setOlder] = useState<AlertRow[]>([]);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.alertRules().then((r) => { if (alive) setRules(r.rules); }, (e: Error) => { if (alive) setRulesError(e.message); });
    return () => { alive = false; };
  }, []);

  // Closed alerts never change, so loaded pages are kept as they are; the poll
  // only refreshes the newest page, and rows it pushes out stay in `older`.
  const first = journal.data?.history;
  const seen = new Set(first?.map((a) => a.id));
  const history = first && [...first, ...older.filter((a) => !seen.has(a.id))]
    .sort((a, b) => b.started_at - a.started_at);
  const hasMore = !!history && !olderDone && (older.length > 0 || first!.length >= PAGE);

  async function more() {
    const last = history?.[history.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = (await api.alerts(id, last.started_at)).history;
      setOlder([...(history ?? []), ...page]);
      if (page.length < PAGE) setOlderDone(true);
    } catch (e) {
      toast("bad", (e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const openCount = journal.data?.open.length ?? 0;
  return (
    <div className="al-page">
      <header className="al-head">
        <h2>Alertes{device && <> · {device.name}</>}</h2>
        {journal.data && <p className="muted">{openCount === 0 ? "aucune en cours" : `${openCount} en cours`}</p>}
      </header>
      <div className="al-cols">
        <RuleList rules={rules} error={rulesError} calibrated={device?.sound_calibration != null} onChange={setRules} />
        <AlertJournal open={journal.data?.open} history={history} error={journal.error} device={device} now={now}
                      hasMore={hasMore} loadingMore={loadingMore} onMore={more} />
      </div>
    </div>
  );
}
