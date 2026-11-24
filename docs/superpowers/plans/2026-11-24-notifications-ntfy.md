# Notifications ntfy — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envoyer chaque ouverture (et, au choix, chaque fin) d'alerte vers un sujet ntfy, avec le nom de la carte, réglable et testable depuis la page Alertes desktop.

**Architecture:** Un module `server/src/notify.ts` (construction des messages, `Notifier.publish()` point d'envoi unique, `Notifier.alerts()` qui applique le réglage). `openAlert`/`closeAlert` produisent des événements que `checkAlerts` renvoie après le `COMMIT` ; le minuteur de `buildApp` les passe au notifier sans attendre. Réglage dans une table `notify` à une ligne, trois routes admin, une section « Notifications » sous les règles.

**Tech Stack:** Fastify 5, zod 4, `node:sqlite`, `fetch` natif (Node ≥ 24), Vitest 5, React 19.

**Spec:** `docs/superpowers/specs/2026-11-24-notifications-ntfy-design.md` (à lire en entier avant chaque tâche).

## Global Constraints

- Format ntfy : `POST <serveur>/` (racine, pas `/<topic>`), corps JSON `{ topic, title, message, priority, tags, click }`, `priority` entier : `low` = 2, `default` = 3, `high` = 4. Jeton → `Authorization: Bearer <jeton>`.
- Délai d'envoi : 5 s (`AbortSignal.timeout(5000)`). Aucune exception ne sort de `publish` / `alerts`.
- Aucun appel réseau dans une transaction SQLite ; aucune notification pour `end_reason = 'disabled'`.
- Le jeton n'apparaît dans aucune réponse d'API (seulement `token_set: boolean`).
- Sujet : `/^[-_A-Za-z0-9]{1,64}$/` ou vide ; serveur : URL `http(s)`, barre finale retirée ; activer sans sujet → 422.
- Défauts : `enabled = 0`, `server = 'https://ntfy.sh'`, `topic = ''`, `token = NULL`, `notify_close = 1`.
- Textes en français, tutoiement ; copie fixée par la spec (titres, corps, test).
- `server/src/types.ts` sans code d'exécution. Commits `feat(notif): …`, pas d'attribution IA.
- `npm test`, `npm run typecheck`, `npm run build` passent à la fin de chaque tâche.

## Review Focus

1. **ntfy injoignable ou lent** : le tick n'attend pas et ne lève rien ; le dernier envoi dit « délai dépassé » — test `publish: délai dépassé` (Task 1) et `checkAlerts ne dépend pas de l'envoi` (Task 2).
2. **Jeton** : jamais dans `GET`/`PATCH`/`test` — test `ne renvoie jamais le jeton` (Task 3).
3. **Règle désactivée pendant une alerte** : pas de « retour à la normale » — test `alerts: ignore les fins 'disabled'` (Task 1).
4. **Base fermée pendant un envoi en vol** (arrêt du serveur) : l'enregistrement du dernier envoi échoue en silence — test `publish: base fermée` (Task 1).
5. **Test d'envoi avec des changements non enregistrés** dans le formulaire : le test part avec ce qui est affiché — l'UI enregistre d'abord (Task 4, vérifié dans le navigateur).

---

## Fichiers

- Create `server/src/notify.ts`, `server/test/notify.test.ts`.
- Modify `server/src/db.ts` (migration 5), `server/src/types.ts`, `server/src/alerts.ts`, `server/src/events.ts` (exporter `span`), `server/src/app.ts`, `server/src/routes/app.ts`, `server/test/alerts.test.ts`, `server/test/api.test.ts`.
- Create `web/src/pages/alerts/NotifySection.tsx`, `web/src/pages/alerts/notify.ts`, `web/src/pages/alerts/notify.test.ts`.
- Modify `web/src/api.ts`, `web/src/pages/alerts/AlertsPage.tsx`, `web/src/styles.css`, `README.md`, `DEVELOPERS.md`.

---

### Task 1: Migration, messages et Notifier

**Files:** Create `server/src/notify.ts`, `server/test/notify.test.ts` ; Modify `server/src/db.ts`, `server/src/types.ts`, `server/src/events.ts`, `server/src/alerts.ts` (type `AlertEvent` seulement).

**Interfaces — Produces:**
```ts
// types.ts
export interface NotifyLast { at: number; ok: boolean; error: string | null }
export interface NotifySettings {
  enabled: boolean; server: string; topic: string; token_set: boolean; notify_close: boolean; last: NotifyLast | null;
}
// alerts.ts
export type AlertEvent =
  | { type: "opened"; device_name: string; kind: AlertKind; threshold: number | null;
      value: number | null; started_at: number; at: number }
  | { type: "closed"; device_name: string; kind: AlertKind; started_at: number; at: number;
      end_value: number | null; reason: "normal" | "disabled" };
// notify.ts
export interface NotifyMessage { title: string; message: string; priority: "low" | "default" | "high"; tags: string[]; click?: string }
export function openedMessage(e: Extract<AlertEvent, {type:"opened"}>, publicUrl: string): NotifyMessage;
export function closedMessage(e: Extract<AlertEvent, {type:"closed"}>, publicUrl: string): NotifyMessage;
export const TEST_MESSAGE: NotifyMessage;
export function readNotify(db: Db): NotifySettings;
export class Notifier {
  constructor(db: Db, opts: { publicUrl: string; log?: { warn(o: object, m: string): void };
                              fetch?: typeof fetch; timeoutMs?: number });
  publish(msg: NotifyMessage): Promise<NotifyLast>;   // ne lève jamais ; enregistre last_*
  alerts(events: AlertEvent[]): Promise<void>;        // applique enabled / notify_close / disabled
}
// events.ts : export function span(seconds: number): string
```

- [ ] **Step 1: Tests (rouges)** dans `server/test/notify.test.ts` :
  - `openedMessage: CO₂` → `{ title: "CO₂ élevé · Salon", priority: "high", tags: ["window"], click: "https://x.test/#/alertes" }`, `message` commence par `"1 340 ppm depuis 5 min (seuil 1 200 ppm)."` (séparateur de milliers = celui de `Intl.NumberFormat("fr-FR")`) et finit par le conseil de `CATALOG.co2_high`.
  - `openedMessage: warn` → `temp_low` à 18.44 : priorité `"default"`, `"18,4 °C"`, tag `cold_face`.
  - `openedMessage: hors ligne` → corps commence par `"Aucun contact depuis 6 min."` (`at − started_at = 360`).
  - `closedMessage` → titre `"Retour à la normale · Salon"`, priorité `"low"`, tags `["white_check_mark"]`, corps `"CO₂ élevé : terminé après 23 min, retour à 640 ppm."` ; hors ligne : `"Carte hors ligne : reconnectée après 12 min."`.
  - `migration: défauts` → `readNotify(openDb(":memory:"))` égale `{ enabled: false, server: "https://ntfy.sh", topic: "", token_set: false, notify_close: true, last: null }`.
  - `publish` contre un serveur `node:http` local : la requête arrive sur `POST /`, corps JSON `{ topic, title, message, priority: 4, tags, click }`, en-tête `authorization: Bearer tk_x` ; résultat `{ ok: true, error: null }` et `readNotify().last.ok === true`.
  - `publish: erreur HTTP` → le serveur répond 403 `{"error":"forbidden"}` → `last.error === "HTTP 403 : forbidden"`.
  - `publish: délai dépassé` → serveur qui ne répond pas, `timeoutMs: 100` → `ok: false`, `error` contient `"délai dépassé"`.
  - `publish: injoignable` → serveur `http://127.0.0.1:1` → `ok: false`, ne lève pas.
  - `publish: base fermée` → `db.close()` avant la réponse → la promesse se résout sans lever.
  - `alerts: désactivé` → aucun envoi ; `alerts: fin désactivée par le réglage` (`notify_close = 0`) → seule l'ouverture part ; `alerts: ignore les fins 'disabled'` → rien ; `alerts: sans sujet` → rien.
- [ ] **Step 2:** `npm test -w server -- notify` → FAIL (module absent).
- [ ] **Step 3:** Migration 5 (SQL de la spec), types, `span` exporté, `AlertEvent`, puis `notify.ts`. Tags par type (spec) dans une table `TAGS: Record<AlertKind, string>`. Décimales : 0 sauf `temp`/`hum` = 1. Erreurs : `HTTP <code> : <json.error ou texte tronqué à 120>`, `délai dépassé (<n> s)` sur `TimeoutError`, `injoignable : <cause.code ?? message>` sinon. `publish` lit le réglage à chaque appel ; écrit `last_*` dans un `try/catch` et logge en `warn` les échecs.
- [ ] **Step 4:** `npm test -w server` → PASS.
- [ ] **Step 5:** Commit `feat(notif): envoi ntfy et messages d'alerte`.

### Task 2: Événements d'alerte et branchement du minuteur

**Files:** Modify `server/src/alerts.ts`, `server/src/app.ts`, `server/test/alerts.test.ts`.

**Interfaces — Consumes:** `AlertEvent`, `Notifier` (Task 1). **Produces:** `checkAlerts(db, now, serverStart): AlertEvent[]` ; `openAlert(db, device, kind, threshold, d, value, out: AlertEvent[])`, `closeAlert(db, alert: {id, kind, started_at}, device, now, endValue, reason, out)` ; `Built.notifier: Notifier`.

- [ ] **Step 1: Tests (rouges)** dans `alerts.test.ts` :
  - `renvoie les événements` : CO₂ à 1300 → `checkAlerts` renvoie `[{ type: "opened", device_name: "Salon", kind: "co2_high", threshold: 1200, value: 1300, started_at: T - 300, at: T }]` ; puis retour à 600 → `[{ type: "closed", kind: "co2_high", end_value: 600, reason: "normal", started_at: T - 300, at: T + 150, device_name: "Salon" }]`.
  - `événement disabled` : règle désactivée → événement `reason: "disabled"`.
  - `rien de nouveau, aucun événement` : deuxième `checkAlerts` identique → `[]`.
  - `aucun événement si la transaction échoue` : non testable sans mock ; couvert par construction (retour après `tx`).
- [ ] **Step 2:** `npm test -w server -- alerts` → FAIL.
- [ ] **Step 3:** `checkAlerts` lit aussi `name` et `started_at` des alertes ouvertes, passe la dernière valeur des `samples` (ou `null` pour offline) et renvoie la liste après `tx`. Dans `buildApp` : `const notifier = new Notifier(db, { publicUrl: cfg.PUBLIC_URL, log: app.log })`, tick → `void notifier.alerts(checkAlerts(...))`, exposé dans `Built`.
- [ ] **Step 4:** `npm test -w server` → PASS (tests existants inchangés).
- [ ] **Step 5:** Commit `feat(notif): prévenir à l'ouverture et à la fin des alertes`.

### Task 3: Routes admin

**Files:** Modify `server/src/routes/app.ts` (signature `appRoutes(app, db, cfg, firmware, notifier)`), `server/src/app.ts`, `server/test/api.test.ts`.

**Interfaces — Produces:** `GET /api/v1/notify`, `PATCH /api/v1/notify`, `POST /api/v1/notify/test` → `NotifySettings`.

- [ ] **Step 1: Tests (rouges)** dans `api.test.ts`, `describe("notify")`, avec un serveur `node:http` local qui mémorise les requêtes :
  - `défauts` → `GET` = défauts de la spec.
  - `ne renvoie jamais le jeton` → `PATCH { token: "tk_secret" }` → réponse sans `"tk_secret"` dans `res.body`, `token_set: true` ; `PATCH { token: null }` → `token_set: false`.
  - `valide` → topic `"a b"` → 422 ; server `"ftp://x"` → 422 ; `{ enabled: true }` sans sujet → 422 ; clé inconnue → 422 ; server `"https://ntfy.example/"` → enregistré sans `/` final.
  - `envoie un test` → `PATCH { server: <local>, topic: "aqa-test" }` puis `POST /notify/test` → `last.ok === true`, le serveur local a reçu `title: "Test · AQA"` ; même si `enabled: false`.
  - `test sans sujet` → 422.
  - `exige la session` → `GET /api/v1/notify` sans cookie → 401.
- [ ] **Step 2:** `npm test -w server -- api` → FAIL.
- [ ] **Step 3:** Routes dans le scope admin, zod `.strict()`, `UPDATE notify SET … WHERE id = 1`.
- [ ] **Step 4:** `npm test -w server` → PASS.
- [ ] **Step 5:** Commit `feat(notif): routes de réglage et d'essai`.

### Task 4: Section « Notifications » (web)

**Files:** Create `web/src/pages/alerts/NotifySection.tsx`, `notify.ts`, `notify.test.ts` ; Modify `web/src/api.ts`, `AlertsPage.tsx`, `styles.css`.

**Interfaces — Consumes:** routes Task 3. **Produces:** `api.notify()`, `api.updateNotify(patch)`, `api.testNotify()` ; `lastSendText(last: NotifyLast | null, now: number): { tone: "good" | "bad" | null; text: string }` ; `randomTopic(rand?: () => number): string`.

- [ ] **Step 1: Tests (rouges)** `notify.test.ts` :
  - `lastSendText(null)` → `{ tone: null, text: "aucun envoi pour l'instant" }`.
  - succès → `{ tone: "good", text: "réussi · auj. 14:02" }` (via `alertDate`).
  - échec → `{ tone: "bad", text: "échec · auj. 14:02 · HTTP 403 : forbidden" }`.
  - `randomTopic()` correspond à `/^aqa-[a-z0-9]{10}$/`.
- [ ] **Step 2:** `npm test -w web` → FAIL.
- [ ] **Step 3:** Helpers, client API, composant (spec § Interface), placé sous `RuleList` dans une colonne `al-side`. Le test enregistre d'abord si le formulaire diffère du réglage enregistré. Styles réutilisant `.al-rules > h3`, `.field`, `.btn` ; glyphes `●`/`▲` en `aria-hidden`, état dans une région `aria-live="polite"`.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run build` → PASS.
- [ ] **Step 5:** Vérifier dans un navigateur (`npm run dev`, seed), envoyer un vrai test vers un sujet ntfy.sh jetable, déclencher une vraie alerte (CO₂ élevé) et sa fin.
- [ ] **Step 6:** Commit `feat(notif): section Notifications dans la page Alertes`.

### Task 5: Documentation

- [ ] `README.md` : paragraphe « Alerts on your phone » (ntfy). `DEVELOPERS.md` : routes `/api/v1/notify*`, note dans Configuration (réglé dans l'UI, pas d'env), `notify.ts` dans la structure si pertinent ; préciser dans « Privacy » que les notifications partent vers le serveur ntfy choisi.
- [ ] Commit `docs(notif): notifications ntfy`.
