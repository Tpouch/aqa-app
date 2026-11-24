import { describe, expect, it } from "vitest";
import { lastSendText, randomSecret, randomTopic } from "./notify";

describe("lastSendText", () => {
  const now = new Date(2026, 10, 24, 15, 0).getTime() / 1000;
  const at = new Date(2026, 10, 24, 14, 2).getTime() / 1000;
  it("rien envoyé", () => {
    expect(lastSendText(null, now)).toEqual({ tone: null, text: "aucun envoi pour l'instant" });
  });
  it("réussi", () => {
    expect(lastSendText({ at, ok: true, error: null }, now)).toEqual({ tone: "good", text: "réussi · auj. 14:02" });
  });
  it("échec avec la raison", () => {
    expect(lastSendText({ at, ok: false, error: "HTTP 403 : forbidden" }, now))
      .toEqual({ tone: "bad", text: "échec · auj. 14:02 · HTTP 403 : forbidden" });
  });
});

describe("randomTopic", () => {
  it("aqa- suivi de 10 caractères", () => {
    const t = randomTopic();
    expect(t).toMatch(/^aqa-[a-z0-9]{10}$/);
    expect(randomTopic()).not.toBe(t);
  });
});

describe("randomSecret", () => {
  it("32 caractères base64url, différent à chaque appel", () => {
    const s = randomSecret();
    expect(s).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomSecret()).not.toBe(s);
  });
});
