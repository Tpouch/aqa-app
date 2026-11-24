import { describe, expect, it } from "vitest";
import { CATALOG, checkAlerts, decideMetric, decideOffline, type Sample } from "../src/alerts.js";
import { all, get, openDb, run, type Db } from "../src/db.js";
import { ALERT_KINDS } from "../src/types.js";

const now = 10_000;
const rule = { enabled: true, threshold: 1200, duration_s: 300 };
const series = (from: number, to: number, v: number): Sample[] => {
  const out: Sample[] = [];
  for (let ts = from; ts <= to; ts += 15) out.push({ ts, v });
  return out;
};

describe("decideMetric", () => {
  it("ouvre après la durée", () => {
    const s = series(now - 300, now, 1300);
    expect(decideMetric("co2_high", rule, null, s, now)).toEqual({
      action: "open", started_at: now - 300, start_value: 1300, peak_value: 1300,
    });
  });
  it("prend le pic de la fenêtre", () => {
    const s = series(now - 300, now, 1300);
    s[5] = { ts: s[5]!.ts, v: 1500 };
    expect(decideMetric("co2_high", rule, null, s, now)).toMatchObject({ action: "open", peak_value: 1500 });
  });
  it("n'ouvre pas avant la durée", () => {
    const s = [...series(now - 600, now - 215, 900), ...series(now - 200, now, 1300)];
    expect(decideMetric("co2_high", rule, null, s, now)).toEqual({ action: "none" });
  });
  it("n'ouvre pas si une valeur repasse sous le seuil", () => {
    const s = series(now - 300, now, 1300);
    s[10] = { ts: s[10]!.ts, v: 1100 };
    expect(decideMetric("co2_high", rule, null, s, now)).toEqual({ action: "none" });
  });
  it("n'ouvre pas sur des mesures anciennes", () => {
    expect(decideMetric("co2_high", rule, null, series(now - 900, now - 400, 1300), now)).toEqual({ action: "none" });
  });
  it("fenêtre vide", () => {
    expect(decideMetric("co2_high", rule, null, [], now)).toEqual({ action: "none" });
    expect(decideMetric("co2_high", rule, { threshold: 1200, peak_value: 1300 }, [], now)).toEqual({ action: "none" });
  });
  it("met à jour le pic", () => {
    const open = { threshold: 1200, peak_value: 1300 };
    const s = [...series(now - 300, now - 15, 1300), { ts: now, v: 1400 }];
    expect(decideMetric("co2_high", rule, open, s, now)).toEqual({ action: "update", peak_value: 1400 });
    expect(decideMetric("co2_high", rule, open, series(now - 300, now, 1300), now)).toEqual({ action: "none" });
  });
  it("ferme après 2 min sous le seuil", () => {
    const open = { threshold: 1200, peak_value: 1300 };
    expect(decideMetric("co2_high", rule, open, series(now - 120, now, 700), now)).toEqual({ action: "close", end_value: 700 });
    expect(decideMetric("co2_high", rule, open, series(now - 60, now, 700), now).action).not.toBe("close");
  });
  it("ferme contre le seuil de l'alerte", () => {
    const open = { threshold: 1200, peak_value: 1300 };
    const r = { ...rule, threshold: 1000 };
    expect(decideMetric("co2_high", r, open, series(now - 120, now, 1100), now).action).toBe("close");
  });
  it("règles basses", () => {
    const r = { enabled: true, threshold: 19, duration_s: 1800 };
    const s = series(now - 1800, now, 18);
    s[3] = { ts: s[3]!.ts, v: 17 };
    expect(decideMetric("temp_low", r, null, s, now)).toMatchObject({ action: "open", peak_value: 17 });
  });
});

describe("decideOffline", () => {
  const r = { enabled: true, threshold: null, duration_s: 300 };
  it("ouvre après la durée", () => {
    expect(decideOffline(r, false, now - 400, 0, now)).toEqual({
      action: "open", started_at: now - 400, start_value: null, peak_value: null,
    });
  });
  it("compte depuis le démarrage du serveur", () => {
    expect(decideOffline(r, false, now - 400, now - 60, now)).toEqual({ action: "none" });
  });
  it("jamais vue", () => {
    expect(decideOffline(r, false, null, 0, now)).toEqual({ action: "none" });
  });
  it("ferme au retour", () => {
    expect(decideOffline(r, true, now - 10, 0, now)).toEqual({ action: "close", end_value: null });
  });
});

describe("migration", () => {
  it("les défauts de la migration correspondent au catalogue", () => {
    const db = openDb(":memory:");
    for (const kind of ALERT_KINDS) {
      const r = get<{ enabled: number; threshold: number | null; duration_s: number }>(
        db, "SELECT enabled, threshold, duration_s FROM alert_rules WHERE kind = ?", kind)!;
      expect({ enabled: r.enabled === 1, threshold: r.threshold, duration_s: r.duration_s })
        .toEqual(CATALOG[kind].defaults);
    }
  });
});

describe("checkAlerts", () => {
  const T = 100_000;
  const setup = (cal = false): Db => {
    const db = openDb(":memory:");
    run(db, "INSERT INTO devices (id, name, token_hash, created_at, last_seen, snd_ref, db_ref) VALUES ('d1','Salon','x',0,?,?,?)",
      T + 1000, cal ? 100 : null, cal ? 50 : null);
    return db;
  };
  const frames = (db: Db, from: number, to: number, f: Record<string, number | null>) => {
    for (let ts = from; ts <= to; ts += 15) {
      run(db, "INSERT INTO frames (device_id, ts, ts_estimated, snd, co2, pm25, hum, temp, received_at) VALUES ('d1',?,0,?,?,?,?,?,?)",
        ts, f.snd ?? null, f.co2 ?? null, f.pm25 ?? null, f.hum ?? null, f.temp ?? null, ts);
    }
  };
  const alerts = (db: Db) => all<any>(db, "SELECT * FROM alerts ORDER BY id");

  it("ouvre puis ferme une alerte CO₂", () => {
    const db = setup();
    frames(db, T - 300, T, { co2: 1300 });
    checkAlerts(db, T, 0);
    expect(alerts(db)).toHaveLength(1);
    expect(alerts(db)[0]).toMatchObject({ kind: "co2_high", threshold: 1200, ended_at: null });
    frames(db, T + 15, T + 150, { co2: 600 });
    checkAlerts(db, T + 150, 0);
    expect(alerts(db)[0]).toMatchObject({ ended_at: T + 150, end_value: 600, end_reason: "normal" });
  });
  it("ignore les null", () => {
    const db = setup();
    frames(db, T - 300, T, { co2: null });
    checkAlerts(db, T, 0);
    expect(alerts(db)).toHaveLength(0);
  });
  it("ignore snd_high sans calibration", () => {
    const db = setup();
    run(db, "UPDATE alert_rules SET enabled = 1 WHERE kind = 'snd_high'");
    frames(db, T - 120, T, { snd: 4000 });
    expect(() => checkAlerts(db, T, 0)).not.toThrow();
    expect(alerts(db)).toHaveLength(0);
  });
  it("convertit le son avec la calibration", () => {
    const db = setup(true);
    run(db, "UPDATE alert_rules SET enabled = 1 WHERE kind = 'snd_high'");
    frames(db, T - 120, T, { snd: 1000 });
    checkAlerts(db, T, 0);
    expect(alerts(db)).toHaveLength(0);
    const db2 = setup(true);
    run(db2, "UPDATE alert_rules SET enabled = 1 WHERE kind = 'snd_high'");
    frames(db2, T - 120, T, { snd: 2000 });
    checkAlerts(db2, T, 0);
    expect(alerts(db2)).toHaveLength(1);
    expect(alerts(db2)[0].kind).toBe("snd_high");
  });
  it("ferme quand la règle est désactivée", () => {
    const db = setup();
    frames(db, T - 300, T, { co2: 1300 });
    checkAlerts(db, T, 0);
    run(db, "UPDATE alert_rules SET enabled = 0 WHERE kind = 'co2_high'");
    checkAlerts(db, T + 30, 0);
    expect(alerts(db)[0]).toMatchObject({ ended_at: T + 30, end_reason: "disabled" });
  });
  it("ne duplique pas", () => {
    const db = setup();
    frames(db, T - 300, T, { co2: 1300 });
    checkAlerts(db, T, 0);
    checkAlerts(db, T, 0);
    expect(alerts(db)).toHaveLength(1);
  });
  it("ferme snd_high quand la calibration est retirée", () => {
    const db = setup(true);
    run(db, "UPDATE alert_rules SET enabled = 1 WHERE kind = 'snd_high'");
    frames(db, T - 120, T, { snd: 2000 });
    checkAlerts(db, T, 0);
    expect(alerts(db)).toHaveLength(1);
    run(db, "UPDATE devices SET snd_ref = NULL, db_ref = NULL WHERE id = 'd1'");
    checkAlerts(db, T + 30, 0);
    expect(alerts(db)[0]).toMatchObject({ ended_at: T + 30, end_reason: "disabled" });
  });
  it("ouvre offline après la durée et ferme au retour", () => {
    const db = setup();
    run(db, "UPDATE devices SET last_seen = ? WHERE id = 'd1'", T - 1000);
    checkAlerts(db, T, 0);
    expect(alerts(db)).toHaveLength(1);
    expect(alerts(db)[0]).toMatchObject({ kind: "offline", started_at: T - 1000, ended_at: null });
    run(db, "UPDATE devices SET last_seen = ? WHERE id = 'd1'", T + 20);
    checkAlerts(db, T + 30, 0);
    expect(alerts(db)[0]).toMatchObject({ ended_at: T + 30, end_reason: "normal" });
  });
  it("renvoie les événements après le commit", () => {
    const db = setup();
    frames(db, T - 300, T, { co2: 1300 });
    const opened = checkAlerts(db, T, 0);
    expect(opened).toEqual([{
      type: "opened", device_id: "d1", device_name: "Salon", kind: "co2_high", threshold: 1200, value: 1300, started_at: T - 300, at: T,
    }]);
    expect(opened[0]).toMatchObject({ device_id: "d1" });
    expect(checkAlerts(db, T, 0)).toEqual([]);
    frames(db, T + 15, T + 150, { co2: 600 });
    const closed = checkAlerts(db, T + 150, 0);
    expect(closed).toEqual([{
      type: "closed", device_id: "d1", device_name: "Salon", kind: "co2_high", started_at: T - 300, at: T + 150, end_value: 600, reason: "normal",
    }]);
    expect(closed[0]).toMatchObject({ device_id: "d1" });
  });
  it("événement pour une règle désactivée", () => {
    const db = setup();
    frames(db, T - 300, T, { co2: 1300 });
    checkAlerts(db, T, 0);
    run(db, "UPDATE alert_rules SET enabled = 0 WHERE kind = 'co2_high'");
    expect(checkAlerts(db, T + 30, 0)).toEqual([{
      type: "closed", device_id: "d1", device_name: "Salon", kind: "co2_high", started_at: T - 300, at: T + 30, end_value: null, reason: "disabled",
    }]);
  });
  it("événement hors ligne sans valeur", () => {
    const db = setup();
    run(db, "UPDATE devices SET last_seen = ? WHERE id = 'd1'", T - 1000);
    expect(checkAlerts(db, T, 0)).toEqual([{
      type: "opened", device_id: "d1", device_name: "Salon", kind: "offline", threshold: null, value: null, started_at: T - 1000, at: T,
    }]);
  });
  it("enregistre le nouveau pic", () => {
    const db = setup();
    frames(db, T - 300, T, { co2: 1300 });
    checkAlerts(db, T, 0);
    expect(alerts(db)[0].peak_value).toBe(1300);
    frames(db, T + 15, T + 30, { co2: 1500 });
    checkAlerts(db, T + 30, 0);
    expect(alerts(db)).toHaveLength(1);
    expect(alerts(db)[0].peak_value).toBe(1500);
  });
});
