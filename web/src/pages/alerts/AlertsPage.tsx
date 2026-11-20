import type { DeviceSummary } from "../../../../server/src/types";

// Shell: the rules and the journal are filled in by the next task.
export function AlertsPage({ id: _id, device: _device }: { id: string; device: DeviceSummary | null }) {
  return (
    <div className="al-page">
      <section aria-label="Règles" />
      <section aria-label="Journal" />
    </div>
  );
}
