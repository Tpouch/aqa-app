# Onglet Infos — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un 4e onglet « Infos » qui explique chaque mesure, ses zones (générées depuis `metrics.ts`) et à partir de quand c'est dangereux.

**Architecture:** une fonction pure `bandRanges` dans `web/src/metrics.ts` transforme les bandes en libellés de plage ; une page React statique `InfosPage` les affiche avec des textes rédigés dans `infoText.ts`. L'onglet s'ajoute à `routes.ts` et `DevicePage.tsx`.

**Tech Stack:** React 19, TypeScript, Vitest (`npm test -w web`).

**Spec:** `docs/superpowers/specs/2026-11-20-onglet-infos-design.md`

## Global Constraints

- `web/` uniquement ; aucun changement serveur.
- Aucun seuil écrit en dur dans la page : tout vient de `metricDef` / `SOUND_DB_BANDS`.
- Style instrument : police mono, filets 1px, couleur réservée aux zones, chaque couleur doublée d'un mot (classes `tone-good|warn|bad`).
- Textes en français, ton « informer sans alarmer », sources citées (OMS 2021, INRS, directive 2003/10/CE), aucune promesse médicale.
- Nombres au format `fr-FR` (via `fmt` de `web/src/util.ts`).

## Review Focus

- Son sans calibration : la page montre quand même les zones en dB et dit que la carte n'est pas calibrée (lien `#/reglages`).
- Bornes inclusives (température, humidité) : « 19 à 24 °C » puis « plus de 24 °C », jamais « 24 °C et plus ».
- Milliers : « 1 200 » (espace fine insécable de `toLocaleString("fr-FR")`), pas « 1200 ».
- Anciens liens : `#/infos` ne doit pas être redirigé vers `#/mesures`.
- Petit écran : tableaux de zones lisibles à 360 px sans scroll horizontal.

---

### Task 1: `bandRanges` et `SOUND_DB_BANDS`

**Files:**
- Modify: `web/src/metrics.ts`
- Test: `web/src/metrics.test.ts`

**Interfaces:**
- Produces: `export const SOUND_DB_BANDS: Band[]` (les bandes calme/bruyant/fort, utilisées par `metricDef("snd", cal)` à la place du littéral) ; `export function bandRanges(bands: Band[], unit: string): string[]` — un libellé par bande, même ordre.

Règle des libellés (bande i, `lo` = `to` de la bande précédente) :
- première : `moins de {to} {unit}` si non inclusive, `jusqu'à {to} {unit}` si inclusive ;
- milieu : `{lo} à {to} {unit}` ;
- dernière (`to === null`) : `plus de {lo} {unit}` si la précédente est inclusive, sinon `{lo} {unit} et plus`.
Nombres via `fmt(n)` (0 décimale ; utiliser des décimales seulement si `n` n'est pas entier).

- [ ] **Step 1: Tests**

```ts
describe("bandRanges", () => {
  const nb = (s: string) => s.replace(/ | /g, " ");
  it("CO₂", () => expect(bandRanges(metricDef("co2", null).bands!, "ppm").map(nb))
    .toEqual(["moins de 800 ppm", "800 à 1 200 ppm", "1 200 ppm et plus"]));
  it("température, borne inclusive", () => expect(bandRanges(metricDef("temp", null).bands!, "°C"))
    .toEqual(["moins de 19 °C", "19 à 24 °C", "plus de 24 °C"]));
  it("son en dB", () => expect(bandRanges(SOUND_DB_BANDS, "dB"))
    .toEqual(["moins de 55 dB", "55 à 70 dB", "70 dB et plus"]));
});
```

- [ ] **Step 2:** `npm test -w web -- metrics` → FAIL (`bandRanges` non exporté).
- [ ] **Step 3:** implémenter dans `metrics.ts` ; `metricDef("snd", cal)` utilise `SOUND_DB_BANDS`.
- [ ] **Step 4:** `npm test -w web` → PASS (tous les tests existants inclus).
- [ ] **Step 5:** commit `feat(web): libellés de plage des zones`.

### Task 2: route `infos`

**Files:**
- Modify: `web/src/routes.ts`, `web/src/routes.test.ts`

**Interfaces:**
- Produces: `Tab` inclut `"infos"` ; `TAB_LABEL.infos = "Infos"` ; `TAB_ORDER` se termine par `"infos"` ; alias `infos`.

- [ ] **Step 1:** ajouter au `it.each` de `routes.test.ts` : `["#/infos", "infos", null]`.
- [ ] **Step 2:** `npm test -w web -- routes` → FAIL.
- [ ] **Step 3:** modifier `routes.ts`. `npm run typecheck -w web` signalera `DevicePage` si un `Record<Tab, …>` manque une clé : corriger dans la Task 3.
- [ ] **Step 4:** `npm test -w web -- routes` → PASS.
- [ ] **Step 5:** commit avec la Task 3 (le typecheck doit passer à chaque commit).

### Task 3: page Infos

**Files:**
- Create: `web/src/pages/infos/infoText.ts`, `web/src/pages/infos/InfosPage.tsx`
- Modify: `web/src/pages/device/DevicePage.tsx` (rendu de l'onglet), `web/src/styles.css` (classes `.inf-*` si besoin, sur le modèle `.st-*`)

**Interfaces:**
- Consumes: `metricDef`, `bandRanges`, `SOUND_DB_BANDS` (Task 1) ; `Tab` (Task 2) ; `METRICS` de `server/src/types`.
- Produces: `export function InfosPage({ device }: { device: DeviceSummary | null }): JSX.Element` ; `export const METRIC_INFO: Record<Metric, { what: string; why: string; todo: string; danger: string; unitHelp: string }>`.

Contenu de `METRIC_INFO` : rédiger à partir de la spec (section « Objectifs », repères de danger chiffrés et sources). `unitHelp` explique l'unité (ppm = parties par million, µg/m³, dB). Pour `snd`, `what` explique amplitude brute vs dB estimés.

Structure de la page (dans `<div className="st">` comme Réglages) :
1. `h2.st-title` « Comprendre les mesures » + intro 2 phrases (zones, mot + couleur).
2. Pour chaque métrique de `METRICS` : `h3` libellé + unité ; `what`/`why` ; `unitHelp` en `.muted` ; tableau zones (`bands = metricDef(m, null).bands ?? SOUND_DB_BANDS`, unité « dB » pour le son), une ligne par bande : mot en `tone-{tone}` + plage de `bandRanges` ; paragraphe « Quoi faire » (`todo`) ; paragraphe « Quand ça devient dangereux » (`danger`).
3. Pour `snd`, si `!device?.sound_calibration` : ligne « Cette carte n'est pas calibrée : le son s'affiche en amplitude brute, sans zones. » + lien `#/reglages`.
4. Pied de page `.muted.small` : sources (OMS 2021 qualité de l'air et logement, INRS, directive 2003/10/CE) et « Ces repères informent, ils ne remplacent pas un avis médical. »

- [ ] **Step 1:** test `web/src/pages/infos/infoText.test.ts` : chaque `Metric` de `METRICS` a les 5 champs non vides ; `METRIC_INFO.co2.danger` contient « 5 000 » ; `METRIC_INFO.pm25.danger` contient « 15 ».
- [ ] **Step 2:** `npm test -w web -- infoText` → FAIL.
- [ ] **Step 3:** écrire `infoText.ts`, `InfosPage.tsx`, brancher `{tab === "infos" && <InfosPage device={d} />}` dans `DevicePage.tsx`.
- [ ] **Step 4:** `npm test -w web && npm run typecheck -w web && npm run build -w web` → tout passe.
- [ ] **Step 5:** vérifier dans le navigateur (`npm run dev`) : onglet visible dans la colonne, `#/infos` reste sur Infos, sections lisibles à 360 px, thèmes clair et sombre.
- [ ] **Step 6:** commit `feat(web): onglet Infos qui explique mesures, zones et seuils de danger`.
