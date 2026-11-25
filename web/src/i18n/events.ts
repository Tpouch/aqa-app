// Board journal lines are stored in French with their values inside the text
// (server/src/events.ts, routes/app.ts, routes/device.ts). In English, each line
// is rebuilt from its kind and those values; anything unrecognised stays as stored.
import { COMMAND_TYPES, type CommandType, type EventRow } from "../../../server/src/types";
import { getLang } from "./lang";
import { commandLabel } from "./vocab";

const SENSOR: Record<string, string> = {
  "température/humidité": "Temperature/humidity", "CO₂": "CO₂", "PM2.5": "PM2.5", son: "Sound",
};

// "12 min", "2 h 5 min", "3 j 4 h" (server/src/events.ts span()).
const span = (s: string) => s.replace(/(\d+) j\b/, "$1 d");

const isCommand = (type: string): type is CommandType => (COMMAND_TYPES as readonly string[]).includes(type);

function english(kind: string, msg: string): string | null {
  let m: RegExpMatchArray | null;
  switch (kind) {
    case "first_contact":
      return msg === "Premier contact avec le serveur" ? "First contact with the server" : null;
    case "reconnect":
      return (m = msg.match(/^Reconnectée après (.+) sans contact$/)) ? `Reconnected after ${span(m[1]!)} without contact` : null;
    case "boot":
      return (m = msg.match(/^Démarrage n°(\d+) \(firmware (.+)\)$/)) ? `Boot #${m[1]} (firmware ${m[2]})` : null;
    case "firmware":
      return msg.startsWith("Firmware ") ? msg : null;
    case "sensor_lost":
    case "sensor_found": {
      m = msg.match(/^Capteur (.+?) (non détecté|détecté)$/);
      const name = m && SENSOR[m[1]!];
      return m && name ? `${name} sensor ${m[2] === "détecté" ? "detected" : "not detected"}` : null;
    }
    case "frames_dropped":
      return (m = msg.match(/^(\d+) mesure\(s\) perdue\(s\) : file pleine après une longue coupure$/))
        ? `${m[1]} reading(s) lost: queue full after a long outage` : null;
    case "weak_signal":
      return (m = msg.match(/^Signal Wi-Fi faible \((-?\d+) dBm\)$/)) ? `Weak Wi-Fi signal (${m[1]} dBm)` : null;
    case "command": {
      m = msg.match(/^Commande (\S+) (envoyée|terminée|en échec)(?: : (.*))?$/s);
      if (!m || !isCommand(m[1]!)) return null;
      const what = { "envoyée": "sent", "terminée": "completed", "en échec": "failed" }[m[2] as "envoyée"];
      return `${commandLabel(m[1])} ${what}${m[3] ? `: ${m[3]}` : ""}`;
    }
    default:
      return null;
  }
}

export function eventText(e: Pick<EventRow, "kind" | "message">): string {
  if (getLang() !== "en") return e.message;
  return english(e.kind, e.message) ?? e.message;
}
