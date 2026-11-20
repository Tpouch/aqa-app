import { AlertJournal } from "../pages/alerts/AlertJournal";
import { useAlertJournal } from "../pages/alerts/useAlertJournal";
import type { DeviceSummary } from "../../../server/src/types";
import { useNow } from "../util";

// Open alerts and journal; rules stay on the desktop. Rendered with key={id}.
export function MobileAlertsPage({ id, device }: { id: string; device: DeviceSummary }) {
  const now = useNow(30000);
  const j = useAlertJournal(id);
  return (
    <div className="mb-alerts">
      <AlertJournal open={j.open} history={j.history} error={j.error} device={device} now={now}
                    hasMore={j.hasMore} loadingMore={j.loadingMore} onMore={j.more} />
      <p className="muted small mb-note">Les règles se modifient sur la version ordinateur.</p>
    </div>
  );
}
