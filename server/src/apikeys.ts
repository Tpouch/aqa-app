import crypto from "node:crypto";
import { sha256Hex } from "./auth.js";
import { get, all, run, now, type Db } from "./db.js";
import type { ApiKey } from "./types.js";

export const KEY_PREFIX = "aqa_";
const COLUMNS = "id, name, prefix, created_at, last_used_at";
const TOUCH_EVERY_S = 60;

export function createKey(db: Db, name: string, at = now()): { key: string; row: ApiKey } {
  const key = KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
  const prefix = key.slice(KEY_PREFIX.length, KEY_PREFIX.length + 8);
  const res = run(
    db,
    "INSERT INTO api_keys (name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?)",
    name, prefix, sha256Hex(key), at,
  );
  const row = get<ApiKey>(db, `SELECT ${COLUMNS} FROM api_keys WHERE id = ?`, Number(res.lastInsertRowid))!;
  return { key, row };
}

export function listKeys(db: Db): ApiKey[] {
  return all<ApiKey>(db, `SELECT ${COLUMNS} FROM api_keys ORDER BY created_at DESC, id DESC`);
}

export function deleteKey(db: Db, id: number): boolean {
  return Number(run(db, "DELETE FROM api_keys WHERE id = ?", id).changes) > 0;
}

// Returns the key id, or null when unknown. last_used_at is bumped at most once a minute.
export function useKey(db: Db, key: string, at = now()): number | null {
  const row = get<{ id: number; last_used_at: number | null }>(
    db, "SELECT id, last_used_at FROM api_keys WHERE key_hash = ?", sha256Hex(key),
  );
  if (!row) return null;
  if (row.last_used_at === null || row.last_used_at <= at - TOUCH_EVERY_S) {
    run(db, "UPDATE api_keys SET last_used_at = ? WHERE id = ?", at, row.id);
  }
  return row.id;
}
