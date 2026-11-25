import { afterEach, describe, expect, it } from "vitest";
import { eventText } from "./events";
import { setLang } from "./lang";
import { serverError } from "./serverErrors";

const mem = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
afterEach(() => setLang("fr", mem));
const ev = (kind: string, message: string) => eventText({ kind, message } as never);

describe("event log lines", () => {
  it("French: stored text as is", () => {
    expect(ev("boot", "Démarrage n°4 (firmware v1.2.0)")).toBe("Démarrage n°4 (firmware v1.2.0)");
  });

  it("English", () => {
    setLang("en", mem);
    expect(ev("first_contact", "Premier contact avec le serveur")).toBe("First contact with the server");
    expect(ev("reconnect", "Reconnectée après 12 min sans contact")).toBe("Reconnected after 12 min without contact");
    expect(ev("reconnect", "Reconnectée après 2 h 5 min sans contact")).toBe("Reconnected after 2 h 5 min without contact");
    expect(ev("reconnect", "Reconnectée après 3 j 4 h sans contact")).toBe("Reconnected after 3 d 4 h without contact");
    expect(ev("boot", "Démarrage n°4 (firmware v1.2.0)")).toBe("Boot #4 (firmware v1.2.0)");
    expect(ev("firmware", "Firmware v1.1 → v1.2")).toBe("Firmware v1.1 → v1.2");
    expect(ev("sensor_lost", "Capteur température/humidité non détecté")).toBe("Temperature/humidity sensor not detected");
    expect(ev("sensor_found", "Capteur CO₂ détecté")).toBe("CO₂ sensor detected");
    expect(ev("sensor_lost", "Capteur son non détecté")).toBe("Sound sensor not detected");
    expect(ev("frames_dropped", "12 mesure(s) perdue(s) : file pleine après une longue coupure")).toBe("12 reading(s) lost: queue full after a long outage");
    expect(ev("weak_signal", "Signal Wi-Fi faible (-84 dBm)")).toBe("Weak Wi-Fi signal (-84 dBm)");
    expect(ev("command", "Commande restart envoyée")).toBe("Restart sent");
    expect(ev("command", "Commande ota terminée")).toBe("Firmware update completed");
    expect(ev("command", "Commande wifi en échec")).toBe("Wi-Fi change failed");
    expect(ev("command", "Commande ota en échec : download failed : 404")).toBe("Firmware update failed: download failed : 404");
  });

  it("English falls back to the stored text when it doesn't recognise it", () => {
    setLang("en", mem);
    expect(ev("boot", "Démarrage bizarre")).toBe("Démarrage bizarre");
    expect(ev("mystery", "Quelque chose")).toBe("Quelque chose");
    expect(ev("command", "Commande teleport envoyée")).toBe("Commande teleport envoyée");
  });
});

describe("server errors", () => {
  it("French: unchanged", () => {
    expect(serverError("1.2 a été compilée pour Salon, pas pour Bureau.")).toBe("1.2 a été compilée pour Salon, pas pour Bureau.");
  });
  it("English", () => {
    setLang("en", mem);
    expect(serverError("1.2 ne contient le jeton d'aucune carte (jeton changé depuis la compilation ?)."))
      .toBe("1.2 doesn't contain any board's token (token changed since it was built?).");
    expect(serverError("1.2 a été compilée pour Salon, pas pour Bureau.")).toBe("1.2 was built for Salon, not for Bureau.");
    expect(serverError("1.2 existe déjà pour Salon : choisis un autre numéro (par ex. 1.2-bureau)."))
      .toBe("1.2 already exists for Salon: pick another number (e.g. 1.2-bureau).");
    expect(serverError("wrong password")).toBe("wrong password");
  });
});

describe("notification and webhook failure reasons", () => {
  it("French: unchanged; English: translated, unknown kept", async () => {
    const { sendError } = await import("./serverErrors");
    expect(sendError("délai dépassé (5 s)")).toBe("délai dépassé (5 s)");
    setLang("en", mem);
    expect(sendError("délai dépassé (5 s)")).toBe("timed out (5 s)");
    expect(sendError("injoignable : ECONNREFUSED")).toBe("unreachable: ECONNREFUSED");
    expect(sendError("aucun sujet configuré")).toBe("no topic set");
    expect(sendError("erreur interne : boom")).toBe("internal error: boom");
    expect(sendError("HTTP 403 : forbidden : really")).toBe("HTTP 403: forbidden : really");
    expect(sendError("HTTP 500")).toBe("HTTP 500");
    expect(sendError("HTTP 3xx (redirection)")).toBe("HTTP 3xx (redirect)");
    expect(sendError("échec : vérifie l'URL et le secret")).toBe("failed: check the URL and the secret");
    expect(sendError("hôte non autorisé (WEBHOOK_ALLOWED_HOSTS)")).toBe("host not allowed (WEBHOOK_ALLOWED_HOSTS)");
    expect(sendError("aucune URL configurée")).toBe("no URL set");
    expect(sendError("aucun secret configuré")).toBe("no secret set");
    expect(sendError("something else")).toBe("something else");
  });
});
