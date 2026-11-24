import { describe, expect, it } from "vitest";
import { createKey, deleteKey, listKeys, useKey } from "../src/apikeys.js";
import { sha256Hex } from "../src/auth.js";
import { get, openDb } from "../src/db.js";

const lastUsed = (db: ReturnType<typeof openDb>, id: number) =>
  get<{ last_used_at: number | null }>(db, "SELECT last_used_at FROM api_keys WHERE id = ?", id)!.last_used_at;

describe("createKey", () => {
  it("returns a well-formed key and stores only its hash", () => {
    const db = openDb(":memory:");
    const { key, row } = createKey(db, "Hermes");
    expect(key).toMatch(/^aqa_[A-Za-z0-9_-]{43}$/);
    expect(row.prefix).toBe(key.slice(4, 12));
    expect(row.last_used_at).toBeNull();
    const stored = get<Record<string, unknown>>(db, "SELECT * FROM api_keys WHERE id = ?", row.id)!;
    expect(stored.key_hash).toBe(sha256Hex(key));
    expect(Object.keys(stored)).not.toContain("key");
    expect(Object.values(stored)).not.toContain(key);
  });
});

describe("useKey", () => {
  it("accepts the key and rejects anything else", () => {
    const db = openDb(":memory:");
    const { key, row } = createKey(db, "Hermes");
    expect(useKey(db, key)).toBe(row.id);
    expect(useKey(db, "aqa_nope")).toBeNull();
    expect(useKey(db, "")).toBeNull();
    const tampered = key.slice(0, -1) + (key.endsWith("A") ? "B" : "A");
    expect(useKey(db, tampered)).toBeNull();
  });

  it("bumps last_used_at at most once a minute", () => {
    const db = openDb(":memory:");
    const { key, row } = createKey(db, "Hermes");
    useKey(db, key, 1000);
    expect(lastUsed(db, row.id)).toBe(1000);
    useKey(db, key, 1030);
    expect(lastUsed(db, row.id)).toBe(1000);
    useKey(db, key, 1060);
    expect(lastUsed(db, row.id)).toBe(1060);
  });
});

describe("listKeys / deleteKey", () => {
  it("lists newest first without the hash", () => {
    const db = openDb(":memory:");
    createKey(db, "old", 100);
    createKey(db, "new", 200);
    const keys = listKeys(db);
    expect(keys.map((k) => k.name)).toEqual(["new", "old"]);
    for (const k of keys) expect(k).not.toHaveProperty("key_hash");
  });

  it("deletes a key once", () => {
    const db = openDb(":memory:");
    const { key, row } = createKey(db, "Hermes");
    expect(deleteKey(db, row.id)).toBe(true);
    expect(useKey(db, key)).toBeNull();
    expect(deleteKey(db, row.id)).toBe(false);
  });
});
