import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { ADMIN_PASSWORD: "x".repeat(12), SESSION_SECRET: "x".repeat(32) };

describe("WEBHOOK_ALLOWED_HOSTS", () => {
  it("is trimmed, lower-cased, without empty entries", () => {
    const cfg = loadConfig({ ...base, WEBHOOK_ALLOWED_HOSTS: "Hermes-Hooks.devgoblin.fr, ,baymax-hook.devgoblin.fr" });
    expect(cfg.WEBHOOK_ALLOWED_HOSTS).toEqual(["hermes-hooks.devgoblin.fr", "baymax-hook.devgoblin.fr"]);
  });
  it("defaults to an empty list", () => {
    expect(loadConfig(base).WEBHOOK_ALLOWED_HOSTS).toEqual([]);
  });
  it("rejects anything but bare hostnames", () => {
    expect(() => loadConfig({ ...base, WEBHOOK_ALLOWED_HOSTS: "https://x.fr" })).toThrow(/is not a hostname/);
    expect(() => loadConfig({ ...base, WEBHOOK_ALLOWED_HOSTS: "x.fr:8644" })).toThrow(/is not a hostname/);
  });
});

describe("AQA_TZ", () => {
  it("defaults to Europe/Paris", () => {
    expect(loadConfig(base).AQA_TZ).toBe("Europe/Paris");
  });
  it("rejects an unknown time zone", () => {
    expect(() => loadConfig({ ...base, AQA_TZ: "Mars/Olympus" })).toThrow(/AQA_TZ/);
  });
});
