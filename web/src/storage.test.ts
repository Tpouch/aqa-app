// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { storageGet, storageRemove, storageSet } from "./storage";

const throwing = {
  getItem: () => { throw new Error("denied"); },
  setItem: () => { throw new Error("denied"); },
  removeItem: () => { throw new Error("denied"); },
};

describe("stockage", () => {
  it("lit, écrit et efface", () => {
    storageSet("k", "v");
    expect(storageGet("k")).toBe("v");
    storageRemove("k");
    expect(storageGet("k")).toBeNull();
  });
  it("survit à un stockage qui lève", () => {
    expect(storageGet("k", throwing)).toBeNull();
    expect(() => storageSet("k", "v", throwing)).not.toThrow();
    expect(() => storageRemove("k", throwing)).not.toThrow();
  });
});
