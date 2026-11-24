import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// Schema mirrors EPITECH_ESP32/docs/api.md §5. Each entry runs once, in order.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE devices (
    id           TEXT PRIMARY KEY,          -- aqa-XXXXXXXXXXXX
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL,             -- sha256(DEVICE_TOKEN), hex
    created_at   INTEGER NOT NULL,
    last_seen    INTEGER,
    status_json  TEXT,                      -- last /status body
    status_at    INTEGER
  );

  CREATE TABLE frames (
    device_id    TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ts           INTEGER NOT NULL,
    ts_estimated INTEGER NOT NULL,
    geohash      TEXT,
    snd INTEGER, co2 INTEGER, pm25 INTEGER, hum REAL, temp REAL,
    stale        INTEGER NOT NULL DEFAULT 0,
    received_at  INTEGER NOT NULL,
    PRIMARY KEY (device_id, ts)
  ) WITHOUT ROWID;

  CREATE TABLE commands (
    id          TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    params_json TEXT NOT NULL DEFAULT '{}',
    state       TEXT NOT NULL,
    progress    INTEGER NOT NULL DEFAULT 0,
    detail      TEXT,
    created_at  INTEGER NOT NULL,
    sent_at     INTEGER,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX commands_device ON commands(device_id, created_at);

  -- Boards that called the API without being registered, so the admin can
  -- add them from the UI with one click.
  CREATE TABLE unknown_devices (
    id         TEXT PRIMARY KEY,
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL,
    ip         TEXT
  );
  `,
  `
  CREATE TABLE events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ts         INTEGER NOT NULL,
    kind       TEXT NOT NULL,
    level      TEXT NOT NULL,
    message    TEXT NOT NULL
  );
  CREATE INDEX events_device ON events(device_id, ts);
  `,
  `
  ALTER TABLE devices ADD COLUMN snd_ref INTEGER;
  ALTER TABLE devices ADD COLUMN db_ref REAL;
  `,
  `
  CREATE TABLE alert_rules (
    kind        TEXT PRIMARY KEY,
    enabled     INTEGER NOT NULL,
    threshold   REAL,                       -- NULL for offline
    duration_s  INTEGER NOT NULL
  );
  INSERT INTO alert_rules (kind, enabled, threshold, duration_s) VALUES
    ('co2_high',  1, 1200, 300),
    ('pm25_high', 1, 35,   300),
    ('temp_low',  1, 19,   1800),
    ('temp_high', 1, 24,   1800),
    ('hum_low',   1, 40,   1800),
    ('hum_high',  1, 60,   1800),
    ('snd_high',  0, 70,   120),
    ('offline',   1, NULL, 300);

  CREATE TABLE alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    threshold   REAL,                       -- threshold when the alert opened
    started_at  INTEGER NOT NULL,           -- start of the excursion, not the tick time
    ended_at    INTEGER,                    -- NULL = ongoing
    start_value REAL,
    peak_value  REAL,                       -- worst value during the alert
    end_value   REAL,
    end_reason  TEXT                        -- 'normal' | 'disabled'
  );
  CREATE INDEX alerts_device ON alerts(device_id, started_at);
  `,
  `
  -- ntfy notifications: one global row, edited from the Alertes page.
  CREATE TABLE notify (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    enabled       INTEGER NOT NULL DEFAULT 0,
    server        TEXT NOT NULL DEFAULT 'https://ntfy.sh',
    topic         TEXT NOT NULL DEFAULT '',
    token         TEXT,                     -- NULL = no token; never returned by the API
    notify_close  INTEGER NOT NULL DEFAULT 1,
    last_at       INTEGER,                  -- last send (alert or test)
    last_ok       INTEGER,
    last_error    TEXT
  );
  INSERT INTO notify (id) VALUES (1);
  `,
  `
  CREATE TABLE api_keys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    prefix       TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER
  );
  `,
  `
  -- Outgoing webhook (Hermes): one global row, edited from the Alertes page.
  CREATE TABLE webhook (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    enabled       INTEGER NOT NULL DEFAULT 0,
    url           TEXT NOT NULL DEFAULT '',
    secret        TEXT,                     -- signs the body; never returned by the API
    notify_close  INTEGER NOT NULL DEFAULT 1,
    last_at       INTEGER,
    last_ok       INTEGER,
    last_error    TEXT
  );
  INSERT INTO webhook (id) VALUES (1);
  `,
];

export type Db = DatabaseSync;

export function openDb(dataDir: string): Db {
  const file = dataDir === ":memory:" ? ":memory:" : path.join(dataDir, "aqa.sqlite3");
  if (file !== ":memory:") fs.mkdirSync(dataDir, { recursive: true });
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(file);
  } catch (err) {
    // Usually a mounted folder owned by root while the app runs as another user.
    const uid = typeof process.getuid === "function" ? process.getuid() : "?";
    throw new Error(
      `Cannot open ${file}: make sure ${dataDir} is writable by uid ${uid} ` +
      `(in Docker, use a named volume or chown the mounted folder). ${(err as Error).message}`,
      { cause: err },
    );
  }
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: Db) {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function all<T>(db: Db, sql: string, ...args: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...args) as T[];
}

export function get<T>(db: Db, sql: string, ...args: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...args) as T | undefined;
}

export function run(db: Db, sql: string, ...args: SQLInputValue[]) {
  return db.prepare(sql).run(...args);
}

export const now = () => Math.floor(Date.now() / 1000);
