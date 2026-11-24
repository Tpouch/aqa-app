import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AlertRule, DeviceSummary } from "../../../../server/src/types";
import { useNow } from "../../util";
import { AlertJournal } from "./AlertJournal";
import { useAlertJournal } from "./useAlertJournal";
import { NotifySection } from "./NotifySection";
import { RuleList } from "./RuleList";

// Rendered with key={id}: a card switch remounts the page, so the poll data,
// older pages and in-flight "plus ancien" requests never mix two cards.
export function AlertsPage({ id, device }: { id: string; device: DeviceSummary | null }) {
  const now = useNow(30000);
  const journal = useAlertJournal(id);
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.alertRules().then((r) => { if (alive) setRules(r.rules); }, (e: Error) => { if (alive) setRulesError(e.message); });
    return () => { alive = false; };
  }, []);

  const openCount = journal.open?.length ?? 0;
  return (
    <div className="al-page">
      <header className="al-head">
        <h2>Alertes{device && <> · {device.name}</>}</h2>
        {journal.open && <p className="muted">{openCount === 0 ? "aucune en cours" : `${openCount} en cours`}</p>}
      </header>
      <div className="al-cols">
        <div className="al-side">
          <RuleList rules={rules} error={rulesError} calibrated={device?.sound_calibration != null} onChange={setRules} />
          <NotifySection now={now} />
        </div>
        <AlertJournal open={journal.open} history={journal.history} error={journal.error} device={device} now={now}
                      hasMore={journal.hasMore} loadingMore={journal.loadingMore} onMore={journal.more} />
      </div>
    </div>
  );
}
