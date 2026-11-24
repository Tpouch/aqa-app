import type { MobileTab } from "./routes";

// Line icons for the tab bar (24×24, stroke = currentColor). Decorative: the label sits beside them.
const PATHS: Record<MobileTab, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  bilan: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6M9 14h4M9 18h5" /></>,
  alertes: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  infos: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  graph: <><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></>,
};

export function TabIcon({ tab }: { tab: MobileTab }) {
  return (
    <svg className="mb-icon" viewBox="0 0 24 24" aria-hidden focusable="false" fill="none" stroke="currentColor"
         strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[tab]}
    </svg>
  );
}
