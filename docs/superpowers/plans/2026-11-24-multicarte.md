# Plusieurs cartes : ajout, OTA sûr, liste des pièces — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'app utilisable avec deux cartes : en ajouter une depuis l'app (B1), ne jamais installer l'image d'une carte sur une autre (B3), voir toutes les pièces et leurs alertes dans la colonne et sur téléphone (A1, qui règle B2).

**Architecture:** Côté serveur, la propriétaire d'une image firmware se déduit de l'image elle-même (le `DEVICE_TOKEN` y est en clair ; on compare le SHA-256 de chaque fenêtre base64url de 43 caractères aux `token_hash` des cartes), à chaque lecture, avec un cache en mémoire par version : pas de migration, toujours à jour après un changement de jeton. Côté web, une route `#/ajouter` réutilise `Setup` dans le cadre normal ; une fonction pure `roomState` résume chaque carte (pire zone, hors ligne) pour une liste de pièces partagée par la colonne et une feuille mobile.

**Tech Stack:** Fastify 5 + `node:sqlite` + zod, React 19 + Vite, Vitest (`renderToStaticMarkup` pour les composants).

**Spec:** `docs/superpowers/specs/2026-11-24-multicarte-design.md` (B1, B3, A1 ; B4, B5, B6, A2, A3 restent à faire).

## Global Constraints

- UI en français, ton des specs existantes ; style « instrument » : une police mono, filets 1 px, pas d'ombre, couleur réservée aux zones et toujours doublée d'un mot.
- `server/src/types.ts` reste sans code d'exécution (importé par le client).
- Pas de nouvelle dépendance ; `package-lock.json` identique à `main` (le remettre si `npm install` retire les champs `libc`).
- Pas de migration SQLite (celle de ntfy vient d'arriver ; rien à ajouter).
- Ne pas toucher `web/src/mobile/gaugeGeometry.ts` ni le README (sauf une ligne sur les pièces).
- Commits en français : `feat(multicarte): …` / `fix(multicarte): …`. Pas de push, pas de PR.
- Vérifications : `npm test`, `npm run typecheck`, `npm run build` verts à chaque commit.

## Review Focus

1. **Jeton changé après la compilation** : l'image ne correspond plus à aucune carte → affichée « aucune carte », OTA refusée (test Task 2).
2. **Image envoyée avant l'enregistrement de sa carte** (ou carte enregistrée après) : la propriété est recalculée à la lecture, pas figée à l'envoi (test Task 1 : cache invalidé seulement par `save`/`remove`, propriétaire calculé contre les hachages du moment).
3. **Jeton au milieu d'une longue suite de caractères base64url** (chaînes collées dans `.rodata`) : trouvé quand même grâce aux fenêtres glissantes (test Task 1).
4. **Une seule carte** : la colonne et la barre mobile restent comme aujourd'hui, avec juste le lien « + ajouter une carte » (test Task 5).
5. **`#/ajouter` ouvert sur téléphone** : retombe sur `#/dashboard` (déjà le comportement de `parseMobileRoute` ; test Task 4).

---

### Task 1: Retrouver la carte d'une image firmware

**Files:**
- Modify: `server/src/firmware.ts`
- Test: `server/test/firmware.test.ts` (nouveau)

**Interfaces:**
- Produces:
  - `export const TOKEN_LENGTH = 43;`
  - `export function tokenCandidates(bin: Buffer): Set<string>` : SHA-256 hex de chaque fenêtre de `TOKEN_LENGTH` octets consécutifs de l'alphabet `[A-Za-z0-9_-]`.
  - `FirmwareStore.tokenHashes(version: string): Set<string>` : `tokenCandidates` du `firmware.bin` de la version, gardé en mémoire ; `save` et `remove` vident l'entrée de la version.

- [ ] **Step 1: Tests**
  - `tokenCandidates` d'une image `0xe9` + octets nuls + `"<jeton>\0"` contient `sha256Hex(jeton)` (jeton = `newDeviceToken()`).
  - Un jeton collé entre deux chaînes base64url (`"abcDEF" + jeton + "xyz"`, sans séparateur) est trouvé.
  - Une suite de 42 caractères seulement ne donne rien (`size === 0`).
  - `FirmwareStore` (dossier `fs.mkdtempSync`) : après `save("1.0", binAvecJetonA, sig)`, `tokenHashes("1.0")` contient le hachage de A ; après un nouveau `save("1.0", binAvecJetonB, sig)`, il contient B et plus A.
- [ ] **Step 2:** `npm test -w server -- firmware` → échec (fonctions absentes).
- [ ] **Step 3:** Implémenter. Parcours linéaire de l'image : repérer les suites de l'alphabet, et pour chaque suite de longueur ≥ 43 hacher toutes ses fenêtres.
- [ ] **Step 4:** `npm test -w server -- firmware` → vert.
- [ ] **Step 5:** Commit `feat(multicarte): retrouver le jeton d'une carte dans une image firmware`.

### Task 2: Firmwares rattachés à leur carte (API)

**Files:**
- Modify: `server/src/types.ts` (`FirmwareRow`), `server/src/routes/app.ts` (section firmware et commande `ota`)
- Test: `server/test/api.test.ts` (bloc `describe("firmware and OTA")`)

**Interfaces:**
- Consumes: `FirmwareStore.tokenHashes`.
- Produces:
  - `FirmwareRow` gagne `device_id: string | null; device_name: string | null` (carte dont le jeton est dans l'image, `null` = aucune).
  - `POST /api/v1/firmware` → 201 `{ version, size, device_id, device_name }` ; 409 si la version existe déjà **et** appartient à une autre carte (non nulle) que la nouvelle image : `« 2.1.0 existe déjà pour démo : choisis un autre numéro (par ex. 2.1.0-chambre). »` (suffixe = nom de la nouvelle carte en minuscules, espaces → `-` ; sans carte : `2.1.0-2`).
  - `POST /devices/:id/commands` `ota` → 422 si l'image n'est pas pour cette carte : `« 2.1.0 a été compilée pour démo, pas pour Chambre. »` ; ou si elle n'a pas de carte : `« 2.1.0 ne contient le jeton d'aucune carte (jeton changé depuis la compilation ?). »`

- [ ] **Step 1: Tests** (dans le bloc existant ; l'image de test contient désormais `token` de `DEVICE`)
  - L'envoi renvoie `device_id: DEVICE` ; `GET /firmware` aussi, avec `device_name`.
  - Une 2e carte enregistrée (`aqa-24A160B3C8F1`) : OTA de la version de `DEVICE` vers elle → 422 avec « pas pour » ; envoyer la même version avec le jeton de la 2e carte → 409 avec « existe déjà pour ».
  - Image sans jeton (`Buffer.alloc(4096, 1)` + `0xe9`) en version `9.9.9` → 201 `device_id: null` ; OTA → 422 « aucune carte ».
  - Après `POST /devices/${DEVICE}/token` (nouveau jeton), `GET /firmware` montre `device_id: null` pour l'image de `DEVICE`. Placer ce test en dernier du bloc et remettre `token` ensuite, ou utiliser une carte dédiée, pour ne pas casser les tests qui suivent.
  - Le test existant « turns an ota command into signed links » reste vert.
- [ ] **Step 2:** `npm test -w server -- api` → échecs attendus.
- [ ] **Step 3:** Implémenter un helper local `ownerOf(version): { id: string; name: string } | null` (requête `SELECT id, name, token_hash FROM devices`, première carte dont le hachage est dans `firmware.tokenHashes(version)`), utilisé par la liste, l'envoi (en calculant d'abord sur le buffer reçu avec `tokenCandidates`) et la commande `ota`.
- [ ] **Step 4:** `npm test -w server` et `npm run typecheck` → verts.
- [ ] **Step 5:** Commit `fix(multicarte): une image firmware ne s'installe que sur sa carte`.

### Task 3: Firmwares par carte dans l'interface

**Files:**
- Modify: `web/src/components/FirmwareSection.tsx`, `web/src/pages/card/CardPage.tsx`, `DEVELOPERS.md` (section OTA)
- Create: `web/src/firmware.ts`, `web/src/firmware.test.ts`

**Interfaces:**
- Consumes: `FirmwareRow.device_id`, `device_name`.
- Produces: `export function firmwareFor(list: FirmwareRow[], deviceId: string): FirmwareRow[]` (les images de cette carte, ordre conservé).

- [ ] **Step 1: Test** `firmwareFor` : garde les images de la carte, écarte celles d'une autre carte et celles sans carte.
- [ ] **Step 2:** `npm test -w web -- firmware` → échec.
- [ ] **Step 3:** Implémenter, puis :
  - Carte : le sélecteur « Mettre à jour » ne propose que `firmwareFor(…, id)` ; vide → « Aucun firmware pour cette carte ». Si d'autres images existent, une ligne `muted small` : « n image(s) pour d'autres cartes, envoyée(s) depuis Réglages. » (pluriel correct).
  - Réglages → Firmwares : colonne « Carte » : nom de la carte, ou `▲ aucune carte` en `tone-bad` avec `title` « Le jeton de l'image ne correspond à aucune carte : jeton changé depuis la compilation ? ». Le texte d'aide dit que l'app reconnaît la carte grâce au jeton contenu dans l'image.
  - DEVELOPERS.md, « OTA updates » : une phrase sur ce rattachement et le refus d'une image d'une autre carte.
- [ ] **Step 4:** `npm test -w web`, `npm run typecheck` → verts.
- [ ] **Step 5:** Commit `feat(multicarte): la page Carte ne propose que les firmwares de cette carte`.

### Task 4: Ajouter une carte quand il y en a déjà une (B1)

**Files:**
- Modify: `web/src/routes.ts`, `web/src/routes.test.ts`, `web/src/pages/Setup.tsx`, `web/src/App.tsx`, `web/src/components/Sidebar.tsx`, `web/src/styles.css`, `web/src/mobile/routes.test.ts`, `DEVELOPERS.md` (« Adding a board »)
- Create: `web/src/pages/Setup.test.tsx`

**Interfaces:**
- Produces:
  - `Tab` gagne `"ajouter"`, `TAB_LABEL.ajouter = "Ajouter une carte"`, **absent** de `TAB_ORDER`.
  - `Setup({ unknown, first, onDone }: { unknown: UnknownDevice[]; first: boolean; onDone: (id: string | null) => void })` : `first` choisit le titre « Ajoute ta carte » / « Ajoute une carte » ; `onDone(id)` après fermeture du jeton (l'id ajouté).
  - `Sidebar` gagne `unknown: number` (cartes inconnues qui écrivent).

- [ ] **Step 1: Tests**
  - `parseRoute("#/ajouter")` → `{ tab: "ajouter", redirect: null }` ; `TAB_ORDER` ne contient pas `"ajouter"`.
  - `parseMobileRoute("#/ajouter").redirect` → `"#/dashboard"`.
  - `Setup` rendu (dans `ToastProvider`) avec `first={false}` contient « Ajoute une carte » et un lien `href="#/mesures"` « ← retour » ; avec `first` : « Ajoute ta carte » et pas de lien retour.
- [ ] **Step 2:** `npm test -w web` → échecs attendus.
- [ ] **Step 3:** Implémenter :
  - `App`/`WebShell` : avec au moins une carte et `tab === "ajouter"`, `main` affiche `Setup first={false}` au lieu de `DevicePage` ; `onDone(id)` → `devices.reload()`, `onDevice(id)` si id, hash `#/mesures`. `document.title` utilise `TAB_LABEL`.
  - `Sidebar` : lien `+ ajouter une carte` (`sb-link`, `href="#/ajouter"`) sous la carte ; si `unknown > 0`, ligne `tone-warn` « ▲ n carte(s) inconnue(s) essaie(nt) de se connecter » qui pointe vers `#/ajouter`.
  - DEVELOPERS.md : où se trouve l'écran d'ajout.
- [ ] **Step 4:** `npm test -w web`, `npm run typecheck` → verts.
- [ ] **Step 5:** Commit `fix(multicarte): pouvoir ajouter une carte quand il y en a déjà une`.

### Task 5: Liste des pièces dans la colonne (A1, B2)

**Files:**
- Create: `web/src/rooms.ts`, `web/src/rooms.test.ts`, `web/src/components/RoomList.tsx`, `web/src/components/RoomList.test.tsx`
- Modify: `web/src/components/Sidebar.tsx`, `web/src/styles.css`

**Interfaces:**
- Produces:
  - `export interface RoomState { tone: Tone | "off"; word: string }` dans `rooms.ts`.
  - `export function roomState(d: DeviceSummary): RoomState` :
    - `!d.online` → `{ tone: "off", word: "hors ligne" }` ;
    - `!d.latest` → `{ tone: "off", word: "aucune mesure" }` ;
    - sinon la pire zone parmi `METRICS` (via `metricDef`, `toDisplay`, `bandOf` ; le son non calibré n'a pas de zone et ne compte pas) : `bad` > `warn` > `good`, à égalité l'ordre de `METRICS`. Pire `good` → `{ tone: "good", word: "bon" }` ; sinon `word = "<label> <mot>"`, ex. `"CO₂ mauvais"`, `"Température chaud"`.
  - `export function otherAlerts(devices: DeviceSummary[], currentId: string): number` (somme des `open_alerts` des autres cartes).
  - `RoomList({ devices, current, onPick }: { devices: DeviceSummary[]; current: string; onPick: (id: string) => void })` : `<ul class="rooms">`, un `<button>` par carte avec `aria-current="true"` sur la carte affichée ; contenu : `▸` (affichée), nom, mot de `roomState` dans `tone-<tone>` (ou `muted` pour `off`), et si `open_alerts > 0` : `▲ n` en `tone-bad` avec texte accessible « n alerte(s) en cours ».

- [ ] **Step 1: Tests**
  - `roomState` : CO₂ 1 480 → `{ tone: "bad", word: "CO₂ mauvais" }` ; CO₂ 900 + température 26 → `warn` « CO₂ aérer » (CO₂ avant la température) ; tout bon → `{ tone: "good", word: "bon" }` ; hors ligne avec CO₂ 1 480 → `off` « hors ligne » ; `latest: null` → « aucune mesure » ; son brut énorme sans calibration ignoré.
  - `otherAlerts` : `[a(2), b(1), c(0)]` vu de `b` → 2.
  - `RoomList` : deux cartes, la 2e avec `open_alerts: 1` → le HTML contient les deux noms, `aria-current="true"` une seule fois, `▲ 1` et « 1 alerte en cours ».
- [ ] **Step 2:** `npm test -w web` → échecs attendus.
- [ ] **Step 3:** Implémenter ; dans `Sidebar`, avec au moins deux cartes, `RoomList` remplace le `<select>` (choisir une carte depuis `#/ajouter` ramène à `#/mesures`). Avec une carte, l'affichage actuel ne change pas. Styles `rooms` : lignes à filet 1 px, nom affiché en `--text` et plus grand, les autres en `--muted`, focus visible.
- [ ] **Step 4:** `npm test -w web`, `npm run typecheck` → verts.
- [ ] **Step 5:** Commit `feat(multicarte): les pièces et leurs alertes dans la colonne`.

### Task 6: Pièces sur téléphone

**Files:**
- Modify: `web/src/mobile/MobileShell.tsx` (barre du haut), `web/src/styles.css` (section mobile `.mb-`)
- Test: `web/src/mobile/MobileShell.test.tsx` (nouveau)

**Interfaces:**
- Consumes: `RoomList`, `otherAlerts`, `roomState`.

- [ ] **Step 1: Tests** (`TopBar` exporté) : deux cartes dont l'autre a 1 alerte → le HTML contient un bouton nommé « Changer de pièce, Chambre affichée » (`aria-haspopup="dialog"`) et `▲ 1` avec « 1 alerte dans une autre pièce » ; une seule carte → pas de bouton, juste le nom.
- [ ] **Step 2:** `npm test -w web -- MobileShell` → échec.
- [ ] **Step 3:** Implémenter : le bouton remplace le `<select>` et ouvre une feuille plein écran (`role="dialog"`, `aria-modal`, titre « Pièces », bouton ✕ « Fermer », Échap ferme) avec `RoomList` ; choisir une pièce ferme la feuille. Zones de toucher ≥ 44 px, texte ≥ 16 px, `env(safe-area-inset-*)`.
- [ ] **Step 4:** `npm test -w web`, `npm run typecheck`, `npm run build` → verts.
- [ ] **Step 5:** Commit `feat(multicarte): choisir sa pièce sur téléphone et voir les alertes des autres`.

### Task 7: Vérification réelle et documentation

- [ ] Deux cartes de démo (`seed-demo.ts <url>` puis `… chambre`), une alerte provoquée sur l'une, une carte inconnue qui écrit, un firmware par carte. Dans le navigateur, sur ordinateur et en vue mobile : ajout d'une carte depuis la colonne, liste des pièces, alerte de l'autre pièce visible, page Carte filtrée, refus d'une OTA croisée.
- [ ] Spec : marquer B1, B2, B3 et A1 « fait ». README : une ligne sur les pièces si utile. En-tête de `seed-demo.ts` : mentionner l'argument `chambre`.
- [ ] `npm test`, `npm run typecheck`, `npm run build` ; `git diff main -- package-lock.json` vide.
- [ ] Commit `docs(multicarte): …`.

---

## Suite : B4, B5, B6, A2

Même cadre (contraintes globales ci-dessus). `App` trie la liste une fois ; `DevicePage` reçoit `others: DeviceSummary[]` (les autres cartes, dans l'ordre) pour B4 et A2.

### Task 8: Ordre des cartes (B5)
- `web/src/rooms.ts` : `sortDevices(list: DeviceSummary[]): DeviceSummary[]`, copie triée par nom avec `Intl.Collator("fr", { sensitivity: "base", numeric: true })`, puis par id.
- Test : `["salon", "Chambre", "Étage", "bureau 10", "bureau 9"]` → `["bureau 9", "bureau 10", "Chambre", "Étage", "salon"]`.
- `App` : `list = sortDevices(devices.data?.devices ?? [])` (colonne, feuille mobile, carte par défaut).
- Commit `fix(multicarte): cartes triées par nom, sans tenir compte de la casse ni des accents`.

### Task 9: Suppression (B4)
- `web/src/pages/settings/deleteText.ts` : `deleteBody(next: string | null): string` et `deletedToast(name: string, next: string | null): string`.
  - `next === null` : corps actuel (« …tu reviendras à l'écran d'ajout… »), toast « salon supprimée. ».
  - sinon : « …tu passeras sur Chambre… », toast « salon supprimée. Tu vois maintenant Chambre. ».
- `SettingsPage`/`DangerZone` reçoivent `next: string | null` = `others[0]?.name ?? null` (la carte que `App` affichera, liste triée).
- Commit `fix(multicarte): la suppression dit sur quelle carte on arrive`.

### Task 10: Carte jamais connectée (B6)
- `rooms.ts` : `neverSeen(d) = d.last_seen === null` ; `roomState` → `{ tone: "off", word: "en attente du 1er contact" }` avant « hors ligne ».
- Colonne (une carte) et barre mobile : « en attente du premier contact » au lieu de « hors ligne ».
- Page Carte : en-tête « en attente du premier contact » et, à la place de « Aucun rapport d'état reçu », les étapes : jeton dans `DEVICE_TOKEN` du `.env`, recompiler et flasher, mesures en moins d'une minute ; jeton perdu → Réglages → Nouveau jeton.
- Tests : `roomState` ; `TopBar` rendu ; `CardPage` rendu (contient « en attente du premier contact » et `DEVICE_TOKEN`).
- Commit `fix(multicarte): une carte jamais connectée n'a plus l'air en panne`.

### Task 11: Nom de la pièce dans Mesures (A2)
- `web/src/measures.ts` : `csvFileName(room: string, id: string, what: string, day: string): string` (nom sans accents, minuscules, `[^a-z0-9]+` → `-` ; vide → id) ; `bannerSubtitle(room: string | null, period: string, step: string | null): string`.
- Tests : `csvFileName("Chambre d'Élise", "aqa-…", "co2", "2026-11-24")` → `"chambre-d-elise-co2-2026-11-24.csv"` ; `csvFileName("!!", "aqa-X", "grille", d)` → `"aqa-X-grille-….csv"` ; `bannerSubtitle("Chambre", "24 h glissantes", "1 min")` → `"Chambre · 24 h glissantes · moyennes sur 1 min"` ; sans pièce → comme avant.
- `MeasuresPage` : pièce dans le sous-titre seulement si `others.length > 0`.
- Commit `feat(multicarte): le nom de la pièce dans Mesures et dans le nom du CSV`.
