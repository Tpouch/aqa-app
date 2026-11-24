import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { newDeviceToken, sha256Hex } from "../src/auth.js";
import { FirmwareStore, tokenCandidates } from "../src/firmware.js";

// A fake ESP32 image: magic byte, padding, then the given C strings (NUL-terminated).
function image(...strings: string[]): Buffer {
  return Buffer.concat([Buffer.from([0xe9]), Buffer.alloc(2048), ...strings.map((s) => Buffer.from(s + "\0"))]);
}

describe("tokenCandidates", () => {
  it("finds the board token baked into the image", () => {
    const token = newDeviceToken();
    expect(tokenCandidates(image("wifi-ssid", token, "https://sensor.example.test")).has(sha256Hex(token))).toBe(true);
  });

  it("finds a token glued to other base64url characters", () => {
    const token = newDeviceToken();
    expect(tokenCandidates(image(`abcDEF${token}xyz`)).has(sha256Hex(token))).toBe(true);
  });

  it("ignores runs shorter than a token", () => {
    expect(tokenCandidates(image("a".repeat(42), "b".repeat(10))).size).toBe(0);
  });
});

describe("FirmwareStore.tokenHashes", () => {
  it("follows the image saved under a version", () => {
    const store = new FirmwareStore(fs.mkdtempSync(path.join(os.tmpdir(), "aqa-fw-")), "s".repeat(32));
    const a = newDeviceToken();
    const b = newDeviceToken();
    store.save("1.0", image(a), Buffer.from("sig"));
    expect(store.tokenHashes("1.0").has(sha256Hex(a))).toBe(true);
    store.save("1.0", image(b), Buffer.from("sig"));
    expect(store.tokenHashes("1.0").has(sha256Hex(b))).toBe(true);
    expect(store.tokenHashes("1.0").has(sha256Hex(a))).toBe(false);
  });
});
