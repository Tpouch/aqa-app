# Refonte UI du dashboard AQA — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refaire toute l'UI de `web/` dans le style « instrument » (sombre par défaut, colonne de relevés à gauche, 3 onglets, graphiques à zones), et ajouter la calibration du son en dB stockée par carte sur le serveur.

**Architecture:** On garde React 19 + Vite + uPlot, `api.ts`, `usePoll`, `useSeries`, `useCommands` et la logique des formulaires. Toute la logique de zones, de stats et de conversion dB va dans un module pur `web/src/metrics.ts` testé avec Vitest. `styles.css` est réécrit à zéro, les pages sont restructurées en Mesures / Carte / Réglages autour d'une colonne fixe. Côté serveur : deux colonnes nullables sur `devices` et le `PATCH` existant étendu.

**Tech Stack:** React 19, TypeScript ~6.0, Vite 8, uPlot 1.6, Vitest 5 (déjà côté serveur, ajouté côté web), Fastify 5 + zod 4 + `node:sqlite`, `@fontsource/ibm-plex-mono`.

**Spec:** `docs/superpowers/specs/2026-11-20-refonte-ui-design.md` (à lire en entier avant chaque tâche). Maquettes de référence : `.superpowers/brainstorm/174572-1795199890/content/mesures-page-v3.html`, `mesures-grille.html`, `carte-reglages.html`.

## Global Constraints

- UI entièrement en français ; texte copié de la spec quand elle le fixe.
- Mode sombre par défaut, quel que soit le réglage système ; clé `localStorage` `aqa-theme` (`"dark"` | `"light"`), appliquée via `data-theme` sur `<html>` avant le premier rendu.
- Palette sombre : fond `#121311`, surface sélectionnée `#1d1e1b`, texte `#e9e5dc`, secondaire `#8d887d`, filets `#2a2a26` / `#3a3934`. Zones : bon `#7fbf8a`, aérer `#e3b341`, mauvais/alerte `#ff6a3d`, bandes de fond à 7–14 % d'opacité.
- Palette claire : papier `#f4f1ea`, texte `#1c1b19`, secondaire `#6b665c`, filets `#cfc9bc` ; teintes de zone assombries pour ≥ 4.5:1 sur `#f4f1ea`.
- Police unique IBM Plex Mono (400/500/600), chiffres tabulaires. Fira Sans/Fira Code et `@phosphor-icons/react` retirés à la fin.
- Pas de cartes à ombre, coins ≤ 2 px, pas de dégradés, pas d'emoji, pas d'icône devant les titres. Glyphes texte (● ▾ ‹ › ↓ ↻ ✓ ✗ →) toujours en `aria-hidden`, chaque bouton garde un libellé texte.
- Contraste texte ≥ 4.5:1, focus visible, la couleur n'est jamais le seul signal (chaque zone a un mot).
- Aucune fonction existante perdue (liste dans la spec, section « Anti-objectifs ») ; anciens liens `#/overview`, `#/sensor`, `#/commands`, `#/options`, `#/device/<id>/<tab>` redirigés.
- Firmware intouché. Serveur : seul ajout = calibration du son.
- `npm test` (serveur), `npm test -w web`, `npm run typecheck` et `npm run build` passent à la fin de chaque tâche.

## Review Focus

1. **Carte sans données ou capteur absent** (ex. `pm25` toujours `null`) : relevé « — » sans mot de zone, graphique vide avec message « Aucune mesure sur cette période », stats absentes, axe Y calculé quand même. → tests `periodStats` / `yRange` sans données (Task 2) + vérif visuelle (Task 6).
2. **Son calibré mais `snd` à 0 ou `null`** : la valeur dB est `null` (trou dans la courbe), jamais `-Infinity`/`NaN`. → test `soundDb` (Task 2).
3. **Trous dans la série (carte hors ligne)** : les `null` insérés par `useSeries` ne comptent ni dans min/moy/max ni dans le temps en zone. → test `periodStats` avec `null` (Task 2).
4. **`localStorage` indisponible** (navigation privée, exception à l'accès) : thème sombre, pas de plantage, le bouton bascule quand même pour la session. → test `theme` avec stockage qui lève (Task 3).
5. **Écran de téléphone (375 px)** : colonne au-dessus, grille sur 1 colonne, aucun défilement horizontal, noms de carte longs tronqués. → étape de vérification à 375 px (Tasks 4 et 6).

---

## File Structure

| Fichier | Rôle |
|---|---|
| `server/src/db.ts` | + migration 3 : `snd_ref`, `db_ref` sur `devices` |
| `server/src/types.ts` | + `SoundCalibration`, `DeviceSummary.sound_calibration` |
| `server/src/routes/app.ts` | `summary()` expose la calibration ; `PATCH /devices/:id` étendu |
| `server/test/api.test.ts` | tests calibration |
| `server/scripts/seed-demo.ts` | **nouveau** : remplit une carte de démo (7 j de mesures) pour vérifier l'UI |
| `web/src/metrics.ts` | **nouveau** : zones, niveau, conversion dB, axe Y, stats (pur) |
| `web/src/range.ts` | **nouveau** : types et calcul de période (repris de `SensorTab.tsx`, pur) |
| `web/src/routes.ts` | **nouveau** : parsing du hash + redirections (pur) |
| `web/src/theme.ts` | **nouveau** : lecture/écriture/bascule du thème |
| `web/src/*.test.ts` | tests Vitest des modules purs |
| `web/src/styles.css` | réécrit à zéro |
| `web/index.html` | script inline de thème |
| `web/src/App.tsx` | Gate + Shell (colonne + contenu) |
| `web/src/components/Sidebar.tsx` | **nouveau** : marque, carte, relevés-sélecteurs, nav, thème, déconnexion |
| `web/src/components/ZoneChart.tsx` | **nouveau** : remplace `Chart.tsx` |
| `web/src/components/ui.tsx` | mêmes exports, restylés, sans Phosphor |
| `web/src/pages/measures/MeasuresPage.tsx`, `Banner.tsx`, `StatsRow.tsx`, `Grid.tsx` | **nouveaux** |
| `web/src/pages/card/CardPage.tsx` | **nouveau** : état + actions + en cours + journal |
| `web/src/pages/settings/SettingsPage.tsx` | **nouveau** : lignes de réglage + calibration + zone sensible |
| `web/src/pages/Login.tsx`, `Setup.tsx`, `components/FirmwareSection.tsx`, `TokenReveal.tsx` | restylés |
| supprimés à la fin | `Chart.tsx`, `pages/device/Overview.tsx`, `SensorTab.tsx`, `CommandsTab.tsx`, `OptionsTab.tsx` |

`pages/device/DevicePage.tsx` et `shared.tsx` restent (hooks `useSeries`, `useCommands`, envoi de commandes, toasts de fin de commande) mais perdent leur JSX de mise en page.

---

### Task 1: Calibration du son côté serveur + script de démo

**Files:**
- Modify: `server/src/db.ts` (tableau `MIGRATIONS`), `server/src/types.ts`, `server/src/routes/app.ts` (`DeviceDbRow`, `summary`, `findDevice`, liste des devices, route `PATCH`)
- Modify: `web/src/api.ts` (remplace `renameDevice`)
- Test: `server/test/api.test.ts`
- Create: `server/scripts/seed-demo.ts`

**Interfaces:**
- Produces:
  - `export interface SoundCalibration { snd_ref: number; db_ref: number }` dans `server/src/types.ts`
  - `DeviceSummary.sound_calibration: SoundCalibration | null`
  - `PATCH /api/v1/devices/:id` corps `{ name?: string; sound_calibration?: SoundCalibration | null }`, au moins une clé ; `snd_ref` entier 1–4095, `db_ref` nombre 20–130 ; réponse = `DeviceSummary`
  - `api.updateDevice(id: string, patch: { name?: string; sound_calibration?: SoundCalibration | null }): Promise<DeviceSummary>` (les appels à `renameDevice` passent à `updateDevice(id, { name })`)

- [ ] **Step 1: Écrire les tests qui échouent** dans un nouveau `describe("sound calibration")` placé après « device API » (la carte `DEVICE` est enregistrée) :

```ts
it("starts uncalibrated", async () => {
  expect((await admin("GET", `/api/v1/devices/${DEVICE}`)).json().sound_calibration).toBeNull();
});
it("stores a calibration and keeps the name", async () => {
  const res = await admin("PATCH", `/api/v1/devices/${DEVICE}`, { sound_calibration: { snd_ref: 31, db_ref: 45 } });
  expect(res.statusCode).toBe(200);
  expect(res.json().sound_calibration).toEqual({ snd_ref: 31, db_ref: 45 });
  expect(res.json().name).toBe("Chambre");
});
it("rejects out-of-range values and an empty body", async () => {
  for (const sound_calibration of [{ snd_ref: 0, db_ref: 45 }, { snd_ref: 31, db_ref: 10 }, { snd_ref: 5000, db_ref: 45 }]) {
    expect((await admin("PATCH", `/api/v1/devices/${DEVICE}`, { sound_calibration })).statusCode).toBe(422);
  }
  expect((await admin("PATCH", `/api/v1/devices/${DEVICE}`, {})).statusCode).toBe(422);
});
it("clears the calibration with null", async () => {
  const res = await admin("PATCH", `/api/v1/devices/${DEVICE}`, { sound_calibration: null });
  expect(res.json().sound_calibration).toBeNull();
});
it("still renames with name only", async () => {
  expect((await admin("PATCH", `/api/v1/devices/${DEVICE}`, { name: "Chambre" })).json().name).toBe("Chambre");
});
```

- [ ] **Step 2: Lancer** `npm test -w server` → les 4 premiers échouent (`sound_calibration` absent / 422 sur `{}` déjà vrai pour le mauvais motif).
- [ ] **Step 3: Implémenter.** Migration 3 : `ALTER TABLE devices ADD COLUMN snd_ref INTEGER; ALTER TABLE devices ADD COLUMN db_ref REAL;`. Lire les deux colonnes dans toutes les requêtes `SELECT … FROM devices` de `app.ts`, exposer `sound_calibration` (`null` si l'une des deux est `null`). `PATCH` : schéma zod `.strict()` avec les deux clés optionnelles + `.refine(au moins une clé)` ; un seul `UPDATE` construit selon les clés présentes. `api.ts` : `updateDevice`.
- [ ] **Step 4: Lancer** `npm test -w server` et `npm run typecheck` → PASS.
- [ ] **Step 5: Script de démo** `server/scripts/seed-demo.ts`, lancé par `npx tsx --env-file=.env server/scripts/seed-demo.ts [baseUrl]` (défaut : le port par défaut de `server/src/config.ts`). Il se connecte avec `ADMIN_PASSWORD`, enregistre `aqa-DE0000000001` nommé « démo » (ou fait une rotation de jeton si elle existe déjà), envoie un `/status` (capteur de son présent) puis 7 jours de trames espacées de 5 min et les dernières 24 h espacées de 1 min, par lots de 100, avec `t` en epoch. Profils : CO₂ 450–1300 avec deux pics par jour au-dessus de 1200 ; PM2.5 3–40 ; température 17–26 ; humidité 35–65 ; `snd` 10–400 ; quelques trous d'une heure ; `pm25` à `null` sur une journée entière.
- [ ] **Step 6: Vérifier** : `npm run dev`, puis le script → il affiche le nombre de trames envoyées, et l'ancienne UI montre la carte « démo » avec des courbes.
- [ ] **Step 7: Commit** `feat(server): calibration du son par carte + script de démo`.

---

### Task 2: Module `metrics.ts` (zones, dB, axe, stats) + Vitest côté web

**Files:**
- Modify: `web/package.json` (devDependency `vitest` à la même version que le serveur, script `"test": "vitest run"`), racine `package.json` (`"test": "npm test -w server && npm test -w web"`)
- Create: `web/src/metrics.ts`, `web/src/metrics.test.ts`

**Interfaces:**
- Consumes: `Metric`, `SoundCalibration` (Task 1).
- Produces:
```ts
export type Tone = "good" | "warn" | "bad";
export interface Band { to: number | null; inclusive?: boolean; word: string; tone: Tone } // bandes triées ; v appartient à la 1re bande où v < to (ou v <= to si inclusive) ; to null = +∞
export interface MetricDef {
  metric: Metric; label: string; unit: string; decimals: number;
  bands: Band[] | null;            // null = pas de zones
  alertLabel: string | null;       // libellé de la 4e stat
  nonNegative: boolean;            // axe Y plancher à 0
}
export function metricDef(metric: Metric, cal: SoundCalibration | null): MetricDef;
export function bandOf(def: MetricDef, v: number | null): Band | null;
export function soundDb(snd: number | null, cal: SoundCalibration): number | null;
export function toDisplay(metric: Metric, raw: number | null, cal: SoundCalibration | null): number | null;
export function yRange(def: MetricDef, min: number | null, max: number | null): [number, number];
export interface PeriodStats { min: { v: number; ts: number }; max: { v: number; ts: number }; avg: number; alertSeconds: number | null }
export function periodStats(def: MetricDef, xs: number[], ys: (number | null)[], period: number): PeriodStats | null;
```

Valeurs (spec, section « Zones ») :

| metric | label · unit · decimals | bandes | alertLabel |
|---|---|---|---|
| co2 | `CO₂` · `ppm` · 0 | `<800` bon/good · `<1200` aérer/warn · mauvais/bad | `EN ZONE MAUVAISE` |
| pm25 | `PM2.5` · `µg/m³` · 0 | `<15` bon · `<35` aérer · mauvais | `EN ZONE MAUVAISE` |
| temp | `Température` · `°C` · 1 | `<19` froid/bad · `≤24` confort/good · chaud/bad | `HORS CONFORT` |
| hum | `Humidité` · `%` · 0 | `<40` sec/bad · `≤60` confort/good · humide/bad | `HORS CONFORT` |
| snd calibré | `Son` · `dB (estimé)` · 0 | `<55` calme/good · `<70` bruyant/warn · fort/bad | `SON FORT` |
| snd non calibré | `Son` · `amplitude` · 0 | `null` | `null` |

`nonNegative` est vrai pour tout sauf `temp`.

- [ ] **Step 1: Écrire les tests** `web/src/metrics.test.ts` :

```ts
const cal = { snd_ref: 31, db_ref: 45 };
it("classe le CO₂", () => {
  const d = metricDef("co2", null);
  expect([799, 800, 1199, 1200].map((v) => bandOf(d, v)?.word)).toEqual(["bon", "aérer", "aérer", "mauvais"]);
  expect(bandOf(d, null)).toBeNull();
});
it("inclut 24 °C et 60 % dans le confort", () => {
  expect(bandOf(metricDef("temp", null), 24)?.word).toBe("confort");
  expect(bandOf(metricDef("temp", null), 24.1)?.word).toBe("chaud");
  expect(bandOf(metricDef("temp", null), 18.9)?.tone).toBe("bad");
  expect(bandOf(metricDef("hum", null), 60)?.word).toBe("confort");
});
it("convertit le son", () => {
  expect(soundDb(31, cal)).toBeCloseTo(45);
  expect(soundDb(310, cal)).toBeCloseTo(65);
  expect(soundDb(0, cal)).toBeNull();
  expect(soundDb(null, cal)).toBeNull();
  expect(toDisplay("snd", 310, null)).toBe(310);
  expect(toDisplay("co2", 612, cal)).toBe(612);
});
it("change le son selon la calibration", () => {
  expect(metricDef("snd", null).bands).toBeNull();
  expect(metricDef("snd", cal).unit).toBe("dB (estimé)");
});
it("montre toujours la zone suivante (2c)", () => {
  const [lo, hi] = yRange(metricDef("co2", null), 450, 600);
  expect(hi).toBeGreaterThanOrEqual(800);
  expect(lo).toBeLessThanOrEqual(450);
  expect(lo).toBeGreaterThanOrEqual(0);
  expect(yRange(metricDef("co2", null), 450, 1000)[1]).toBeGreaterThanOrEqual(1200);
  const [tlo, thi] = yRange(metricDef("temp", null), 20, 21);
  expect(tlo).toBeLessThanOrEqual(19); expect(thi).toBeGreaterThanOrEqual(24);
});
it("calcule un axe sans données", () => {
  const [lo, hi] = yRange(metricDef("pm25", null), null, null);
  expect(lo).toBe(0); expect(hi).toBeGreaterThanOrEqual(15);
});
it("calcule les stats en ignorant les trous", () => {
  const d = metricDef("co2", null);
  const s = periodStats(d, [0, 60, 120, 180, 240], [700, null, 1300, 1250, 900], 60)!;
  expect(s.min).toEqual({ v: 700, ts: 0 });
  expect(s.max).toEqual({ v: 1300, ts: 120 });
  expect(s.avg).toBeCloseTo(1037.5);
  expect(s.alertSeconds).toBe(120);
  expect(periodStats(d, [0, 60], [null, null], 60)).toBeNull();
  expect(periodStats(metricDef("snd", null), [0], [12], 60)!.alertSeconds).toBeNull();
});
```

- [ ] **Step 2: Lancer** `npm install && npm test -w web` → FAIL (module absent).
- [ ] **Step 3: Implémenter `web/src/metrics.ts`.** `soundDb` = `db_ref + 20·log10(snd / snd_ref)`, `null` si `snd` est `null` ou ≤ 0. `alertSeconds` = nombre de points non nuls dans une bande `bad` × `period` (`null` si `bands` est `null`). `yRange` : part de `[min, max]` des données. Pour une mesure à confort sur deux côtés (temp, hum), on y ajoute la bande de confort entière. Sinon on ajoute la première borne `to` strictement supérieure à `max`. Sans données, on prend `[0, première borne]` (temp : la bande de confort ; pas de bandes : `[0, 1]`). Puis 5 % de marge de chaque côté, et un plancher à 0 si `nonNegative`.
- [ ] **Step 4: Lancer** `npm test -w web` → PASS ; `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): modèle de zones, conversion dB et stats`.

---

### Task 3: Thème, police et nouvelle base CSS

**Files:**
- Create: `web/src/theme.ts`, `web/src/theme.test.ts`
- Modify: `web/index.html` (script inline dans `<head>`), `web/src/main.tsx` (imports police), `web/package.json` (+ `@fontsource/ibm-plex-mono`), `web/src/styles.css` (réécrit), `web/src/components/ui.tsx` (restylé, Phosphor retiré de ce fichier)

**Interfaces:**
- Produces:
  - `export type Theme = "dark" | "light"`
  - `export function readTheme(storage?: Pick<Storage, "getItem">): Theme`. Défaut `"dark"` ; si l'accès lève, renvoie `"dark"`.
  - `export function applyTheme(t: Theme, storage?: Pick<Storage, "setItem">): void`. Pose `document.documentElement.dataset.theme` et ignore les exceptions du stockage.
  - Variables CSS utilisées par toutes les tâches suivantes : `--bg --surface-sel --text --muted --rule --rule-strong --good --warn --bad --good-band --warn-band --bad-band --mono`, sur `:root[data-theme="dark"]` et `:root[data-theme="light"]`.
  - Classes de base : `.btn` (variantes `.primary` = fond texte/texte fond, `.danger` = bord + texte alerte, `.quiet`), `.input`, `.seg` (groupe de boutons à filets, `aria-pressed`), `.field`, `.label-caps` (petites capitales espacées, couleur `--muted`), `.rule` (filet), `.tone-good/.tone-warn/.tone-bad` (couleur de texte), `.sr-only`, `.skeleton` (aplat sans animation).

- [ ] **Step 1: Écrire les tests** (`theme.test.ts`, environnement `jsdom` via `// @vitest-environment jsdom`, ajouter `jsdom` en devDependency web) :

```ts
it("vaut sombre par défaut", () => expect(readTheme({ getItem: () => null })).toBe("dark"));
it("relit le choix", () => expect(readTheme({ getItem: () => "light" })).toBe("light"));
it("ignore une valeur inconnue", () => expect(readTheme({ getItem: () => "blue" })).toBe("dark"));
it("survit à un stockage qui lève", () => {
  expect(readTheme({ getItem: () => { throw new Error("denied"); } })).toBe("dark");
  expect(() => applyTheme("light", { setItem: () => { throw new Error("denied"); } })).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe("light");
});
```

- [ ] **Step 2: Lancer** `npm test -w web` → FAIL.
- [ ] **Step 3: Implémenter** `theme.ts`, le script inline de `index.html` (même logique que `readTheme`, try/catch, pose `data-theme` avant le chargement du bundle), les imports `@fontsource/ibm-plex-mono/400.css`, `500.css`, `600.css`. Réécrire `styles.css` à partir de zéro : tokens (Global Constraints), reset, base (`body` en `--mono`, 15 px, `font-variant-numeric: tabular-nums`), focus visible `2px solid var(--text)`, contrôles ci-dessus, toasts (bandeau filet en bas à droite) et modale (fond assombri, panneau à filets). `ui.tsx` garde ses exports et leurs signatures. On retire seulement les icônes Phosphor (le spinner devient un « … » animé en opacité, désactivé sous `prefers-reduced-motion`).
- [ ] **Step 4: Vérifier le contraste.** Un script ponctuel (non commité) calcule les ratios WCAG de `--text`, `--muted`, `--good`, `--warn`, `--bad` sur `--bg` dans les deux thèmes. Tous doivent être ≥ 4.5. Si une teinte claire échoue, on l'assombrit et on relance.
- [ ] **Step 5: Lancer** `npm test -w web`, `npm run typecheck`, `npm run build` → PASS.
- [ ] **Step 6: Commit** `feat(web): thème instrument sombre par défaut, IBM Plex Mono, base CSS`.

---

### Task 4: Routage 3 onglets + Shell avec colonne de relevés

**Files:**
- Create: `web/src/routes.ts`, `web/src/routes.test.ts`, `web/src/components/Sidebar.tsx`, `web/src/selection.ts`
- Modify: `web/src/App.tsx`, `web/src/pages/device/DevicePage.tsx` (aiguille vers les nouvelles pages, garde `send`, toasts et décompte des commandes)

**Interfaces:**
- Consumes: `metricDef`, `bandOf`, `toDisplay` (Task 2) ; `readTheme`, `applyTheme` (Task 3).
- Produces:
  - `export type Tab = "mesures" | "carte" | "reglages"`
  - `export function parseRoute(hash: string): { tab: Tab; redirect: string | null; device: string | null }`. Correspondances : `""`, `"#/"`, `"#/overview"`, `"#/sensor"` → mesures ; `"#/commands"` → carte ; `"#/options"` → reglages ; `"#/device/<id>/<ancien onglet>"` → même correspondance, avec `device = <id>`. `redirect` contient le hash canonique quand l'entrée n'en est pas un, sinon `null`.
  - `selection.ts` : `export interface Selection { view: "single" | "grid"; metric: Metric; grid: Metric[] }`, `export function useSelection(): [Selection, (s: Selection) => void]`. Persisté en `sessionStorage` (clés `aqa-view`, `aqa-sensor-metric` (existante), `aqa-grid-metrics`). Défaut : `{ view: "single", metric: "co2", grid: METRICS }`.
  - `<Sidebar devices device tab selection onSelection pending onLogout now />`. Chaque relevé est un `<button aria-pressed>`. En vue grille, c'est une case à cocher (`role="checkbox"`, `aria-checked`). Hors de la page Mesures, un clic ouvre `#/mesures` sur cette mesure.

- [ ] **Step 1: Écrire les tests** `routes.test.ts` :

```ts
it.each([
  ["", "mesures", "#/mesures"], ["#/overview", "mesures", "#/mesures"], ["#/sensor", "mesures", "#/mesures"],
  ["#/commands", "carte", "#/carte"], ["#/options", "reglages", "#/reglages"],
  ["#/mesures", "mesures", null], ["#/carte", "carte", null], ["#/nimporte", "mesures", "#/mesures"],
])("%s → %s", (h, tab, redirect) => expect(parseRoute(h)).toMatchObject({ tab, redirect }));
it("reprend la carte des anciens liens", () =>
  expect(parseRoute("#/device/aqa-24A160B3C8F0/commands")).toEqual({ tab: "carte", redirect: "#/carte", device: "aqa-24A160B3C8F0" }));
```

- [ ] **Step 2: Lancer** → FAIL.
- [ ] **Step 3: Implémenter** `routes.ts`, `selection.ts`, `Sidebar.tsx` et le nouveau Shell. Mise en page : grille `200px 1fr` sur bureau ; sous 720 px, la colonne passe au-dessus (relevés en ligne défilante si besoin, navigation en ligne). Contenu de la colonne, dans l'ordre de la spec (« Mise en page ») : « AQA », sélecteur de carte si plus d'une, point en ligne + `mesuré il y a …`, 5 relevés (libellé · unité, mot de zone coloré, valeur, bord gauche de la couleur de zone quand sélectionné), nav `Mesures` / `Carte` + nombre en cours / `Réglages`, `◐ clair` ou `◐ sombre`, `déconnexion`. Le titre du document reste `<onglet> · <carte> · AQA`. Les pages Mesures, Carte et Réglages sont des composants temporaires qui affichent l'ancien contenu (Overview / CommandsTab / OptionsTab) en attendant les Tasks 6 à 8.
- [ ] **Step 4: Lancer** `npm test -w web`, `npm run typecheck`, `npm run build` → PASS.
- [ ] **Step 5: Vérifier dans le navigateur** (carte démo, `npm run dev`) à 1366×768 puis à 375×812 : la colonne est conforme à la maquette, le thème se bascule et tient après un rechargement sans flash, les anciens liens redirigent, il n'y a pas de défilement horizontal à 375 px et un long nom de carte est tronqué avec `…`.
- [ ] **Step 6: Commit** `feat(web): colonne de relevés, 3 onglets et redirections`.

---

### Task 5: Graphique à zones `ZoneChart`

**Files:**
- Create: `web/src/components/ZoneChart.tsx`
- Delete (en fin de tâche, une fois remplacé partout) : `web/src/components/Chart.tsx`

**Interfaces:**
- Consumes: `MetricDef`, `bandOf`, `yRange` (Task 2), variables CSS (Task 3).
- Produces: `export function ZoneChart(props: { def: MetricDef; xs: number[]; ys: (number | null)[]; range: [number, number]; height: number; compact?: boolean; onOpen?: () => void }): JSX.Element`. Les `ys` sont **déjà convertis** (dB pour le son). Le curseur est synchronisé par la clé `"aqa"`.

- [ ] **Step 1: Implémenter.** On garde le cycle de vie uPlot de l'ancien `Chart.tsx` (création selon métrique/fenêtre/hauteur, `setData` pour les données, `ResizeObserver`), avec :
  - **Bandes de fond.** Un hook `drawClear` remplit chaque bande entre ses bornes, avec `--good-band`, `--warn-band` ou `--bad-band` selon le ton.
  - **Nom des zones.** Il est écrit à droite de la zone de tracé, dans la couleur pleine du ton, sauf en mode `compact`. On réserve `axes[1]` à gauche et une marge droite d'environ 64 px.
  - **Courbe.** Couleur `--text`, épaisseur 2, sans remplissage.
  - **Valeur actuelle.** Le dernier point non nul est marqué d'un cercle de rayon 4 dans la couleur de sa zone, avec la valeur formatée à côté. Ce marqueur est dessiné dans le hook `draw`.
  - **Échelle Y.** `scales.y.range` appelle `yRange(def, min, max)`.
  - **Survol.** Une ligne verticale pointillée et une infobulle « jour. HH:MM » + valeur colorée selon la zone (`aria-live="polite"`).
  - **Aucune donnée.** Le texte « Aucune mesure sur cette période » est centré sur le graphique.
  - **Mode compact.** L'en-tête montre seulement le libellé et la valeur sous le curseur. Le graphique entier est un bouton (`onOpen`) dont l'`aria-label` vaut « Ouvrir <libellé> en grand ».
  - Les couleurs sont relues depuis les variables CSS. Quand `data-theme` change, le graphique est recréé grâce à un `MutationObserver` sur `<html>`.
- [ ] **Step 2: Vérifier.** On branche temporairement `ZoneChart` dans la page Mesures temporaire. Sur la carte démo, on contrôle les points suivants :
  - Le CO₂ sur 24 h montre les 3 bandes nommées et la valeur actuelle au bout de la courbe.
  - Une journée calme où le CO₂ reste sous 800 affiche l'axe jusqu'à 800 au moins.
  - La température montre toujours la bande de confort entière.
  - Le jour où PM2.5 vaut `null` affiche le message vide.
  - Le curseur reste synchronisé entre deux graphiques.
  - Le graphique se recrée correctement après une bascule clair/sombre.
- [ ] **Step 3: Lancer** `npm run typecheck`, `npm run build` → PASS.
- [ ] **Step 4: Commit** `feat(web): graphique à zones nommées`.

---

### Task 6: Page Mesures (bandeau, stats, vue 1 graphe, grille)

**Files:**
- Create: `web/src/range.ts`, `web/src/range.test.ts`, `web/src/pages/measures/MeasuresPage.tsx`, `Banner.tsx`, `StatsRow.tsx`, `Grid.tsx`
- Delete: `web/src/pages/device/Overview.tsx`, `web/src/pages/device/SensorTab.tsx`
- Modify: `web/src/util.ts` (`downloadCsv` inchangé ; `METRIC_INFO` et `level` supprimés une fois plus utilisés nulle part)

**Interfaces:**
- Consumes: `useSeries` (`shared.tsx`), `useSelection` (Task 4), `ZoneChart` (Task 5), `metricDef`, `toDisplay`, `periodStats` (Task 2), `DeviceSummary.sound_calibration` (Task 1).
- Produces:
  - `range.ts` : `export type Range = { kind: "preset"; seconds: number } | { kind: "day"; date: string } | { kind: "custom"; from: number; to: number }`, `export const PRESETS` (1h, 6h, 24h, 7j, 30j), `export function resolveRange(r: Range, today: string): { from: number; to: number; live: boolean; refresh: boolean; title: string }`, `shiftDay`, `isoDay`. Toutes ces fonctions sont reprises telles quelles de `SensorTab.tsx` et rendues pures. Persistance sous la clé `aqa-sensor-range`, qui existe déjà.
  - `export function gridColumns(n: number): 1 | 2`. Renvoie 1 si `n ≤ 2`, sinon 2.
  - `export function csvColumns(metrics: Metric[], cal: SoundCalibration | null): string[]`. Renvoie `["time", ...metrics]` ; quand `snd` est présent et calibré, ajoute `snd_db` juste après `snd`.

- [ ] **Step 1: Écrire les tests** `range.test.ts` :

```ts
it("donne une fenêtre glissante pour un raccourci", () =>
  expect(resolveRange({ kind: "preset", seconds: 86400 }, "2026-11-20")).toMatchObject({ from: 0, to: 86400, live: true, title: "24 h glissantes" }));
it("donne la journée entière", () => {
  const r = resolveRange({ kind: "day", date: "2026-11-19" }, "2026-11-20");
  expect(r.to - r.from).toBe(86399); expect(r.live).toBe(false); expect(r.refresh).toBe(false);
});
it("rafraîchit la journée en cours", () => expect(resolveRange({ kind: "day", date: "2026-11-20" }, "2026-11-20").refresh).toBe(true));
it("passe d'un mois à l'autre", () => expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01"));
it.each([[1, 1], [2, 1], [3, 2], [5, 2]])("grille de %i mesures → %i colonne(s)", (n, c) => expect(gridColumns(n)).toBe(c));
it("ajoute la colonne dB au CSV", () => {
  expect(csvColumns(["co2", "snd"], { snd_ref: 31, db_ref: 45 })).toEqual(["time", "co2", "snd", "snd_db"]);
  expect(csvColumns(["snd"], null)).toEqual(["time", "snd"]);
});
```

- [ ] **Step 2: Lancer** → FAIL.
- [ ] **Step 3: Implémenter** (maquettes `mesures-page-v3.html` et `mesures-grille.html`).
  - **Bandeau.** Titre de la mesure, ou « N mesures » en grille, avec l'unité. Sous-titre : `resolveRange().title` · `moyennes sur <stepLabel>` quand le pas est supérieur à 0. Ensuite, dans l'ordre :
    - les boutons `.seg` 1h / 6h / 24h / 7j / 30j ;
    - le groupe ‹ jour › ;
    - « plage… », qui ouvre les deux champs `datetime-local` de l'ancien `RangePicker` dans un panneau sous le bandeau ;
    - « csv ↓ » ;
    - l'interrupteur `.seg` « 1 graphe » / « grille ».
  - **Stats** (vue 1 graphe seulement). 4 colonnes séparées par des filets :
    - MIN avec `à HH:MM` ;
    - MOYENNE avec le mot de sa zone en couleur ;
    - MAX avec `à HH:MM`, la valeur prenant la couleur de sa zone ;
    - `def.alertLabel` avec la durée formatée (`1 h 20`, `0 min`) suivie de `sur <période>`. Cette colonne est omise si `alertLabel` vaut `null`.
  - **Vue 1 graphe.** `ZoneChart` de 310 px de haut.
  - **Grille.**
    - Les mesures cochées sont rangées selon `gridColumns(n)`, en `compact`.
    - Hauteur des graphiques : `clamp(140px, (hauteur visible − haut du bandeau − espacements) / lignes − 28px, 260px)`, recalculée au redimensionnement.
    - Avec un nombre impair (≥ 3), la case vide reçoit le résumé « Sur <période> » : une ligne par mesure à zones, avec `alertLabel` en minuscules et sa durée, puis « Tout le reste dans le confort » si toutes les durées sont nulles.
    - Si aucune mesure n'est cochée, le message est « Coche au moins une mesure dans la colonne ».
    - Sous 720 px, la grille passe à 1 colonne.
  - **Conversion.** Les colonnes `snd` passent par `toDisplay` avant `ZoneChart` et `periodStats`.
  - **Liens.** Le relevé du son non calibré affiche le lien « Calibrer » vers `#/reglages`.
- [ ] **Step 4: Lancer** `npm test -w web`, `npm run typecheck`, `npm run build` → PASS.
- [ ] **Step 5: Vérifier dans le navigateur** (carte démo) :
  - À 1366×768 avec les 5 mesures en grille : aucun défilement vertical.
  - Un clic sur un graphique de la grille l'ouvre en vue 1 graphe.
  - Les stats correspondent à la courbe.
  - ‹ jour › et plage… fonctionnent dans les deux vues.
  - Le CSV contient les bonnes colonnes.
  - Son calibré (Task 8, ou via `curl PATCH`) : la courbe est en dB avec les zones calme / bruyant / fort.
  - À 375 px : 1 colonne et pas de défilement horizontal.
- [ ] **Step 6: Commit** `feat(web): page Mesures avec vue 1 graphe et grille`.

---

### Task 7: Page Carte

**Files:**
- Create: `web/src/pages/card/CardPage.tsx`
- Delete: `web/src/pages/device/CommandsTab.tsx` ; `StatusCard`, `SignalBadge`, `COMMAND_ICON` retirés de `shared.tsx`

**Interfaces:**
- Consumes: `useCommands`, `COMMAND_STATE`, `COMMAND_LABEL` (`shared.tsx`), `Send` (`DevicePage.tsx`), `api.events`, `api.firmware*`, `useConfirm`.
- Produces: `<CardPage device={DeviceSummary | null} commands={…} send={Send} now={number} />`.

- [ ] **Step 1: Implémenter** (maquette `carte-reglages.html`, spec « Page Carte »), dans cet ordre :
  - **En-tête.**
    - Nom, avec l'identifiant en dessous.
    - État : `● en ligne` en couleur good, ou `● hors ligne` en couleur `--muted`, suivi de `contact <ago>`.
    - Bouton « ↻ actualiser l'état ».
  - **4 blocs.**
    - FIRMWARE : `v<firmware_version>` et `matériel <hardware_version>`.
    - ALLUMÉE DEPUIS : `duration` et `démarrage n°<boot_count>`.
    - WI-FI : `<rssi> dBm` + mot faible / moyen / bon (seuils actuels : `< -80` et `< -70`), puis `<ssid> · <ip>`.
    - FILE D'ATTENTE : `<pending> mesure(s)`, `<dropped> perdue(s)` (couleur warn si > 0) et `<free_heap/1024> Ko libres`.
  - **Ligne capteurs.** `✓` ou `✗` coloré + nom pour chaque capteur (modèle de CO₂ s'il est connu), `position <geohash>` à droite.
  - **Sans rapport d'état.** On garde le texte actuel (« Aucun rapport d'état reçu… ») à la place des blocs et de la ligne capteurs.
  - **Colonne gauche « ACTIONS ».**
    - Lignes Redémarrer et Mettre à jour (sélecteur + Installer).
    - Revenir au firmware précédent, en couleur alerte.
    - Les confirmations et textes d'aide sont repris tels quels de `CommandsTab.tsx`.
    - Ensuite « EN COURS » : une carte à filet par commande active, avec libellé, pourcentage, barre de 4 px (`role="progressbar"`), état, ancienneté et bouton « annuler » si l'état est `pending`.
  - **Colonne droite « JOURNAL ».**
    - Filtres `.seg` tout / commandes / problèmes.
    - Tableau heure · `●` coloré selon le niveau (avec un texte `sr-only` du niveau) · message.
    - On garde le `title` avec la date complète et le texte d'aide sur l'origine du journal.
  - **Téléphone.** Les deux colonnes s'empilent sous 720 px.
- [ ] **Step 2: Lancer** `npm run typecheck`, `npm run build` → PASS.
- [ ] **Step 3: Vérifier dans le navigateur** (carte démo) :
  - « actualiser l'état » envoie la commande, qui apparaît dans EN COURS et peut être annulée.
  - Le toast de fin de commande s'affiche toujours, depuis n'importe quel onglet.
  - Les filtres du journal fonctionnent.
  - La mise en page est conforme à la maquette, à 1366 et à 375 px.
- [ ] **Step 4: Commit** `feat(web): page Carte (état, actions, journal)`.

---

### Task 8: Page Réglages + calibration du son

**Files:**
- Create: `web/src/pages/settings/SettingsPage.tsx`, `web/src/pages/settings/calibration.ts`, `web/src/pages/settings/calibration.test.ts`
- Delete: `web/src/pages/device/OptionsTab.tsx`
- Modify: `web/src/components/FirmwareSection.tsx`, `web/src/components/TokenReveal.tsx` (restylés en lignes, sans Phosphor)

**Interfaces:**
- Consumes: `api.updateDevice` (Task 1), `Send`, `useConfirm`, `useToast`.
- Produces: `export function calibrationFrom(latest: FrameRow | null, now: number, dbInput: string): { ok: true; value: SoundCalibration } | { ok: false; error: string }`.

- [ ] **Step 1: Écrire les tests** `calibration.test.ts` :

```ts
const f = (snd: number | null, ts: number) => ({ ts, snd } as FrameRow);
it("prend la dernière amplitude", () => expect(calibrationFrom(f(31, 1000), 1060, "45")).toEqual({ ok: true, value: { snd_ref: 31, db_ref: 45 } }));
it("accepte la virgule", () => expect(calibrationFrom(f(31, 1000), 1060, "45,5")).toMatchObject({ value: { db_ref: 45.5 } }));
it("refuse une mesure de plus de 2 min", () =>
  expect(calibrationFrom(f(31, 1000), 1121, "45")).toEqual({ ok: false, error: "Dernière mesure trop ancienne (plus de 2 min) : attends que la carte envoie une mesure." }));
it("refuse un son nul ou absent", () => {
  expect(calibrationFrom(f(0, 1000), 1010, "45").ok).toBe(false);
  expect(calibrationFrom(f(null, 1000), 1010, "45").ok).toBe(false);
  expect(calibrationFrom(null, 1010, "45").ok).toBe(false);
});
it("refuse un niveau hors 20–130 dB", () => {
  expect(calibrationFrom(f(31, 1000), 1010, "12")).toEqual({ ok: false, error: "Saisis un niveau entre 20 et 130 dB." });
  expect(calibrationFrom(f(31, 1000), 1010, "abc").ok).toBe(false);
});
```

Messages d'erreur pour son nul ou absent : « Aucune mesure de son récente : vérifie que le micro est détecté. »

- [ ] **Step 2: Lancer** → FAIL.
- [ ] **Step 3: Implémenter.**
  - **`calibration.ts`.**
  - **`SettingsPage`.**
    - Titre « Réglages · <nom> ».
    - Une ligne `.setting` par réglage, en grille `220px 1fr` : libellé et aide à gauche, contrôles à droite. Sous 720 px, une seule colonne.
    - Ordre des lignes : Nom, Calibrer le son, Wi-Fi, Position, Paramètres, Firmwares.
    - Toute la logique, les validations, les confirmations et les textes sont repris tels quels de `OptionsTab.tsx`, y compris le retour au Wi-Fi du firmware et l'oubli de mot de passe.
  - **Ligne « Calibrer le son ».**
    - Aide : « Mesure le niveau de la pièce avec une appli sonomètre, puis saisis-le ».
    - Calibration actuelle (`45 dB pour une amplitude de 31`) ou « non calibré ».
    - Champ `dB` (`inputMode="decimal"`) et bouton « Calibrer maintenant », qui passe par `calibrationFrom` puis `api.updateDevice(id, { sound_calibration })`. Erreur affichée sous le champ, toast en cas de succès.
    - Bouton « Effacer » quand une calibration existe, qui envoie `sound_calibration: null` après confirmation.
  - **Zone sensible.** Filet en couleur alerte, libellé « Zone sensible », boutons « Nouveau jeton » et « Supprimer la carte » (`.danger`), confirmations reprises telles quelles.
- [ ] **Step 4: Lancer** `npm test -w web`, `npm run typecheck`, `npm run build` → PASS.
- [ ] **Step 5: Vérifier dans le navigateur** (carte démo, script relancé juste avant pour avoir une mesure récente) :
  - La calibration s'enregistre, et la page Mesures passe le son en dB avec ses zones.
  - « Effacer » rétablit l'amplitude.
  - Le renommage met à jour la colonne.
  - Toutes les sections d'avant sont présentes.
  - La mise en page est vérifiée à 375 px.
- [ ] **Step 6: Commit** `feat(web): page Réglages et calibration du son`.

---

### Task 9: Connexion, ajout de carte et nettoyage final

**Files:**
- Modify: `web/src/pages/Login.tsx`, `web/src/pages/Setup.tsx`, `web/package.json` (retirer `@phosphor-icons/react`, `@fontsource/fira-sans`, `@fontsource/fira-code`), `web/src/main.tsx`, `web/src/util.ts`, `web/src/pages/device/shared.tsx`
- Delete: tout reste devenu inutilisé (classes CSS orphelines comprises)

- [ ] **Step 1: Restyler `Login`.**
  - Panneau centré, sans cadre à ombre : « AQA » en petites capitales.
  - Champ « Mot de passe » avec bouton afficher/masquer texte, bouton « Se connecter » en `.primary`.
  - Erreurs sous le champ.
  - Logique inchangée.
- [ ] **Step 2: Restyler `Setup`** (aucune carte enregistrée).
  - Liste des cartes inconnues en tableau à filets : identifiant, vue il y a…, IP, « Ajouter » et « Oublier ».
  - Formulaire identifiant + nom.
  - Affichage du jeton via `TokenReveal`.
  - Logique inchangée. On s'affiche plein écran, sans colonne, puisqu'il n'y a aucun relevé.
- [ ] **Step 3: Retirer les dépendances et le code mort.** `npm uninstall -w web @phosphor-icons/react @fontsource/fira-sans @fontsource/fira-code`. Ensuite, `grep -rn "phosphor\|Fira\|METRIC_INFO\|card-head" web/src` ne doit rien renvoyer.
- [ ] **Step 4: Lancer** `npm test`, `npm run typecheck`, `npm run build` → PASS.
- [ ] **Step 5: Vérification finale dans le navigateur.**
  - Parcours complet : connexion → Mesures (1 graphe + grille) → Carte → Réglages → déconnexion, en sombre puis en clair, à 1366×768 et 375×812.
  - Navigation au clavier seul : focus toujours visible, relevés et cases de la grille actionnables avec Entrée et Espace.
  - Cocher la liste « Anti-objectifs » de la spec ligne par ligne.
- [ ] **Step 6: Commit** `feat(web): connexion et ajout de carte, retrait de Phosphor et Fira`.
