import { TabIcon } from "./icons";
import { MOBILE_LABEL, MOBILE_TABS, type MobileTab } from "./routes";

export function TabBar({ tab, alerts }: { tab: MobileTab; alerts: number }) {
  return (
    <nav className="mb-tabs" aria-label="Navigation">
      {MOBILE_TABS.map((t) => (
        <a key={t} href={`#/${t}`} className="mb-tab" aria-current={t === tab ? "page" : undefined}>
          <span className="mb-tab-icon">
            <TabIcon tab={t} />
            {t === "alertes" && alerts > 0 && <span className="mb-badge" aria-hidden>{alerts}</span>}
          </span>
          {MOBILE_LABEL[t]}
          {/* Read as text after the tab's name: an aria-label on a plain span is skipped by some screen readers. */}
          {t === "alertes" && alerts > 0 && <span className="sr-only">, {alerts} alerte{alerts > 1 ? "s" : ""} en cours</span>}
        </a>
      ))}
    </nav>
  );
}
