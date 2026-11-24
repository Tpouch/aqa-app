# Comparer deux pièces sur un graphe (A3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En vue 1 graphe de Mesures (ordinateur), un bouton « comparer avec… » ajoute la courbe d'une autre pièce en pointillé, avec son nom au bout.

**Architecture:** Fonctions pures dans un nouveau `web/src/compare.ts` (pièces proposées, fusion de deux séries aux horodatages différents, valeur proche du curseur, placement des étiquettes). `ZoneChart` reçoit une prop `compare` optionnelle et dessine une 2e série uPlot. `MeasuresPage` appelle `useSeries` une 2e fois. La pièce comparée vit dans `Selection` (`sessionStorage`, clé `aqa-compare`).

**Tech Stack:** React 19, uPlot 1.6.32, Vitest (jsdom, `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-11-24-multicarte-design.md`, section A3 (direction visuelle : `2026-11-20-refonte-ui-design.md`).

## Global Constraints

- Vue 1 graphe seulement ; pas en grille, pas dans la vue mobile (`web/src/mobile/` non touché).
- Bouton visible seulement avec au moins deux cartes.
- Zones de fond inchangées (celles de la mesure) ; stats MIN / MOY / MAX = pièce affichée seulement ; CSV inchangé (pièce affichée).
- Son : une pièce n'est proposée que si **les deux** cartes sont calibrées.
- Infobulle : les deux valeurs, chacune nommée.
- Pièce comparée en `sessionStorage` (`aqa-compare`), lecture qui ne lève jamais.
- Anti-objectifs UI : pas de badge, d'ombre, d'icône ; la couleur n'est jamais le seul signal (le nom est écrit) ; focus visible.
- `package-lock.json` inchangé. Commits `feat(multicarte): …` en français.

## Review Focus

1. Horodatages différents entre cartes (trames brutes à 15 s, phases décalées) : les deux courbes restent continues (pas de pointillés « en miettes »), un vrai trou (carte hors ligne) reste un trou. → `mergeSeries` : `undefined` pour l'alignement (uPlot l'ignore), `null` gardé pour les trous.
2. La pièce affichée a un trou mais l'autre a des données : l'infobulle donne « — » pour la pièce affichée, la valeur de l'autre, jamais une valeur lointaine. → `valueNear` avec une tolérance d'un pas.
3. Pièce comparée supprimée, ou devenue la pièce affichée (on bascule sur elle) : pas de 2e courbe, pas d'erreur. → `compareTarget`.
4. Passage sur le Son avec une carte non calibrée : la comparaison disparaît sans rien perdre, et revient en repassant sur CO₂. → `compareTarget` + sélection gardée.
5. Deux courbes qui finissent au même endroit : la valeur actuelle et le nom ne se chevauchent pas. → `labelSides`.

---

### Task 1: Fonctions pures de comparaison

**Files:**
- Create: `web/src/compare.ts`
- Test: `web/src/compare.test.ts`

**Interfaces:**
- Produces:
  - `compareChoices(metric: Metric, here: DeviceSummary | null, others: DeviceSummary[]): DeviceSummary[]` — `others` filtré : pour `snd`, seulement si `here` et l'autre ont `sound_calibration`.
  - `compareTarget(id: string | null, metric: Metric, here: DeviceSummary | null, others: DeviceSummary[]): DeviceSummary | null` — l'élément de `compareChoices` dont l'id vaut `id`.
  - `type Cell = number | null | undefined`; `mergeSeries(xa: number[], ya: (number|null)[], xb: number[], yb: (number|null)[]): { xs: number[]; a: Cell[]; b: Cell[] }` — fusion triée, horodatages égaux partagés, `undefined` là où une série n'a pas de point.
  - `valueNear(xs: number[], ys: Cell[], idx: number, tolerance: number): number | null` — `ys[idx]` s'il n'est pas `undefined`, sinon le point défini le plus proche à moins de `tolerance` secondes, sinon `null`.
  - `labelSides(main: number, other: number | null, top: number, bottom = Infinity, room = 22): { main: "above" | "below"; other: "above" | "below" }` — positions en px canvas ; le plus haut des deux écrit au-dessus, l'autre en dessous ; « au-dessus » impossible à moins de `room` du haut ; contre le bas, la plus basse écrit aussi au-dessus si l'autre est à plus de `room` (ajouté après la vérification dans le navigateur).

- [x] **Step 1: tests** (`describe("comparer")`)
  - `compareChoices("co2", here, [a, b])` → `[a, b]` ; `compareChoices("snd", hereCal, [aCal, bRaw])` → `[aCal]` ; `compareChoices("snd", hereRaw, [aCal])` → `[]`.
  - `compareTarget("aqa-B", "co2", here, [b])` → `b` ; id absent → `null` ; `null` → `null` ; `compareTarget("aqa-B", "snd", hereRaw, [bCal])` → `null`.
  - `mergeSeries([0, 15, 30], [1, 2, 3], [7, 22], [10, 20])` → `xs [0, 7, 15, 22, 30]`, `a [1, undefined, 2, undefined, 3]`, `b [undefined, 10, undefined, 20, undefined]`.
  - `mergeSeries([0, 60], [1, null], [0, 60], [5, 6])` → `xs [0, 60]`, `a [1, null]`, `b [5, 6]` (trou gardé, x partagés).
  - `valueNear(xs, a, 1, 15)` → `1` (plus proche à gauche, égalité → gauche) ; `valueNear([0, 100], [undefined, 5], 0, 15)` → `null` ; `valueNear([0, 7], [null, undefined], 1, 15)` → `null`.
  - `labelSides(100, null, 0)` → `main: "above"` ; `labelSides(100, 80, 0)` → `{ main: "below", other: "above" }` ; `labelSides(10, 50, 0)` → `main: "below"`.
- [x] **Step 2:** `npm test -w web -- compare` → FAIL (module absent).
- [x] **Step 3:** implémenter `web/src/compare.ts` (fusion à deux index).
- [x] **Step 4:** `npm test -w web -- compare` → PASS.
- [x] **Step 5:** commit `feat(multicarte): fonctions pures pour comparer deux pièces`.

### Task 2: Pièce comparée dans la sélection

**Files:**
- Modify: `web/src/selection.ts`, `web/src/selection.test.ts`

**Interfaces:**
- Produces: `Selection.compare: string | null`, clé `aqa-compare` (JSON). Toute valeur non chaîne → `null`.

- [x] **Step 1:** tests : `DEFAULTS` gagne `compare: null` ; « relit une sélection valide » avec `aqa-compare = "aqa-B"` → `compare: "aqa-B"` ; `aqa-compare = 42` → `null`.
- [x] **Step 2:** `npm test -w web -- selection` → FAIL.
- [x] **Step 3:** lire / écrire la clé dans `readSelection` et `save`.
- [x] **Step 4:** PASS, `npm run typecheck -w web` vert (les `{ ...selection }` existants restent valides).
- [x] **Step 5:** commit `feat(multicarte): retenir la pièce comparée pour l'onglet`.

### Task 3: Bouton « comparer avec… » dans le bandeau

**Files:**
- Modify: `web/src/pages/measures/Banner.tsx`, `web/src/styles.css` (section mesures)
- Test: `web/src/pages/measures/Banner.test.tsx`

**Interfaces:**
- Produces: `export interface CompareControl { choices: { id: string; name: string }[]; current: { id: string; name: string } | null; note: string | null; onPick: (id: string | null) => void }` ; prop `compare?: CompareControl` de `Banner` (absente = pas de bouton) ; `export function ComparePanel({ control, onDone }: { control: CompareControl; onDone: () => void })`.
- Un seul panneau ouvert à la fois : `panel: null | "range" | "compare"`.

- [x] **Step 1:** tests (`renderToStaticMarkup`) :
  - `Banner` sans `compare` → pas de « comparer avec » ; avec `compare` (current `null`) → bouton `comparer avec…` avec `aria-expanded="false"` ; avec current Chambre → bouton `avec Chambre…` (classe `active`).
  - `ComparePanel` : un bouton par choix, `aria-pressed="true"` sur la pièce courante, « ne plus comparer » seulement si `current` ; `note` affichée ; aucun choix → seulement la note.
- [x] **Step 2:** `npm test -w web -- Banner` → FAIL.
- [x] **Step 3:** implémenter ; panneau `id="ms-compare"` sous la barre, même style que `.ms-range` (filet en haut), choix dans un `.seg` `role="group" aria-label="Pièce à comparer"` ; choisir ou « ne plus comparer » ferme le panneau.
- [x] **Step 4:** PASS.
- [x] **Step 5:** commit `feat(multicarte): bouton « comparer avec… » dans le bandeau`.

### Task 4: 2e courbe dans `ZoneChart`, branchement dans Mesures

**Files:**
- Modify: `web/src/components/ZoneChart.tsx`, `web/src/pages/device/shared.tsx` (`useSeries` accepte `id: string | null` : pas d'appel réseau, lignes vides), `web/src/pages/measures/MeasuresPage.tsx`, `web/src/pages/device/DevicePage.tsx` (passe `others`), `web/src/styles.css` (`.zc-tip-row`)

**Interfaces:**
- Consumes: Task 1 (`mergeSeries`, `valueNear`, `labelSides`, `compareChoices`, `compareTarget`), Task 2 (`selection.compare`), Task 3 (`CompareControl`).
- Produces: prop `ZoneChart.compare?: { here: string; name: string; xs: number[]; ys: (number | null)[]; tolerance: number }`.

- [x] **Step 1:** `ZoneChart` : données fusionnées (`useMemo`) utilisées partout (dessin, `last`, infobulle) ; `lastIndex` teste `!= null` ; série 2 `stroke: --muted`, `width: 1.5`, `dash: [6·px, 4·px]` ; nom de l'autre pièce au bout de sa courbe (anneau + nom en `--muted`), côtés donnés par `labelSides` ; points du curseur sur `u.cursor.idxs[si]` ; infobulle : heure, puis « here valeur » et « name valeur » (via `valueNear`), chaque valeur colorée par sa zone ; `aria-label` qui nomme les deux valeurs ; recréé quand `compare` apparaît/disparaît ou change de nom.
- [x] **Step 2:** `MeasuresPage` : prop `others: DeviceSummary[]` (remplace `multi`, `multi = others.length > 0`) ; `target = grid ? null : compareTarget(selection.compare, selection.metric, device, others)` ; `useSeries(target?.id ?? null, …)` ; ys convertis avec `toDisplay(metric, v, target.sound_calibration)` ; `Banner.compare` seulement si `!grid && others.length > 0`, `note` = « Le son ne se compare qu'entre cartes calibrées. » quand la mesure est `snd` et qu'une pièce est écartée.
- [x] **Step 3:** `npm test`, `npm run typecheck`, `npm run build` verts.
- [x] **Step 4:** commit `feat(multicarte): comparer deux pièces sur le graphe de Mesures`.

### Task 5: Docs et vérification réelle

**Files:**
- Modify: `docs/superpowers/specs/2026-11-24-multicarte-design.md` (A3 fait, tableau d'état), `README.md` (une phrase), `DEVELOPERS.md` (`compare.ts`, `aqa-compare`)

- [x] **Step 1:** `npm run dev` sur un port libre, `seed-demo.ts <url>` puis `seed-demo.ts <url> chambre` ; vérifier en clair et sombre : bouton, courbe pointillée, nom au bout, infobulle à deux valeurs, stats inchangées, grille sans bouton, son non calibré, rechargement de l'onglet (pièce retenue).
- [x] **Step 2:** docs ; `git diff origin/DEV -- package-lock.json` vide.
- [x] **Step 3:** commit `docs(multicarte): A3 fait`.
