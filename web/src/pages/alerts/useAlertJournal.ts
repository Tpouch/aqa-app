import { useState } from "react";
import { api } from "../../api";
import { useToast } from "../../components/ui";
import type { AlertRow } from "../../../../server/src/types";
import { usePoll } from "../../util";

const PAGE = 50; // server default limit

// Alert journal of one board: open alerts and history, newest page polled,
// older pages loaded on demand. Use under key={id}: a card switch must remount
// so the poll data, older pages and in-flight requests never mix two cards.
export function useAlertJournal(id: string) {
  const toast = useToast();
  const journal = usePoll(() => api.alerts(id), 15000, [id]);
  const [older, setOlder] = useState<AlertRow[]>([]);
  const [olderDone, setOlderDone] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Closed alerts never change, so loaded pages are kept as they are; the poll
  // only refreshes the newest page, and rows it pushes out stay in `older`.
  const first = journal.data?.history;
  const seen = new Set(first?.map((a) => a.id));
  const history = first && [...first, ...older.filter((a) => !seen.has(a.id))]
    .sort((a, b) => b.started_at - a.started_at || b.id - a.id);
  const hasMore = !!history && !olderDone && (older.length > 0 || first!.length >= PAGE);

  async function more() {
    const last = history?.[history.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = (await api.alerts(id, last.started_at, last.id)).history;
      setOlder([...(history ?? []), ...page]);
      if (page.length < PAGE) setOlderDone(true);
    } catch (e) {
      toast("bad", (e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return { open: journal.data?.open, history, error: journal.error, hasMore, loadingMore, more };
}
