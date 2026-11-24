import { METRICS, type DeviceSummary } from "../../server/src/types";
import { bandOf, metricDef, toDisplay, type Tone } from "./metrics";

// One board in the list of rooms: its worst zone right now, in a word.
export interface RoomState { tone: Tone | "off"; word: string }

const RANK: Record<Tone, number> = { good: 0, warn: 1, bad: 2 };

/** Registered but never heard from: waiting for its first flash, not broken. */
export const neverSeen = (d: DeviceSummary) => d.last_seen === null;

export const WAITING = "en attente du premier contact";

export function roomState(d: DeviceSummary): RoomState {
  if (neverSeen(d)) return { tone: "off", word: "en attente du 1er contact" };
  // Offline: the last values are stale, saying "CO₂ mauvais" would mislead.
  if (!d.online) return { tone: "off", word: "hors ligne" };
  if (!d.latest) return { tone: "off", word: "aucune mesure" };
  let worst: RoomState = { tone: "good", word: "bon" };
  for (const m of METRICS) {
    const def = metricDef(m, d.sound_calibration);
    const band = bandOf(def, toDisplay(m, d.latest[m], d.sound_calibration));
    if (band && band.tone !== "good" && RANK[band.tone] > RANK[worst.tone as Tone]) {
      worst = { tone: band.tone, word: `${def.label} ${band.word}` };
    }
  }
  return worst;
}

/** Open alerts on every board but the one shown. */
export function otherAlerts(devices: DeviceSummary[], currentId: string): number {
  return devices.reduce((n, d) => (d.id === currentId ? n : n + d.open_alerts), 0);
}

const byName = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Boards by name as a French reader expects ("Étage" next to "étage", "bureau 9" before "bureau 10"). */
export function sortDevices(list: DeviceSummary[]): DeviceSummary[] {
  return [...list].sort((a, b) => byName.compare(a.name, b.name) || a.id.localeCompare(b.id));
}
