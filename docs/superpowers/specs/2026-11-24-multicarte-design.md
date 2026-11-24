# Plusieurs cartes

Date : 2026-11-24 · Portée : constat et propositions, `web/` surtout, un peu de `server/`

## Intention

L'utilisateur n'a qu'une carte aujourd'hui et va en ajouter une 2e, dans une autre pièce. L'app sait déjà enregistrer plusieurs cartes et affiche un sélecteur dès qu'il y en a plus d'une (colonne de gauche sur ordinateur, barre du haut sur téléphone). Mais elle a été pensée et testée avec une seule. Ce document dit ce qui casse ou trompe avec deux cartes, puis propose des corrections et des améliorations classées par utilité.

## Comment on a regardé

- `server/scripts/seed-demo.ts` prend un 2e argument : `seed-demo.ts <url> chambre` enregistre `aqa-DE0000000002` « Chambre » (CO₂ qui monte toute la nuit porte fermée, pièce plus fraîche et plus humide, calme). Sans argument, rien ne change : la carte « démo » du salon.
- App lancée en dev sur un port libre, avec « démo » et « Chambre », puis une 3e carte jetable « salon ». Une alerte CO₂ provoquée sur « démo » (1 480 ppm) pendant que « Chambre » était hors ligne. Une carte non enregistrée (`aqa-DE0000000003`) qui appelle l'API. Une fausse image firmware `2.1.0` envoyée.
- Parcouru sur ordinateur : onboarding, Mesures (1 graphe et grille), Alertes, Carte, Réglages, Infos, suppression, export CSV. Sur téléphone (vue mobile forcée) : Dashboard, barre du haut, onglets.

## Ce qui marche déjà

- Changer de carte garde l'onglet, la période et les mesures choisies. Les pages se rechargent proprement (`DevicePage` est rendu avec `key={device.id}`).
- La carte choisie est retenue (`aqa-device`) et partagée entre la vue web et la vue mobile.
- Alertes, Carte et Réglages affichent le nom de la carte en titre. L'onglet du navigateur aussi (« Mesures · Chambre · AQA »).
- Calibration du son, journal, commandes, alertes et bilan (branche `feat-bilan`) sont déjà par carte côté serveur.

## Bugs

Classés par gravité.

### B1. Impossible d'ajouter une 2e carte

L'écran « Ajoute ta carte » (`web/src/pages/Setup.tsx`) n'apparaît **que s'il n'y a aucune carte** (`App.tsx`, `WebShell`). Dès la première carte, il n'existe plus aucun bouton ni lien pour en ajouter une autre, et les cartes qui essaient déjà d'écrire (`unknown_devices`, renvoyées par `GET /devices`) ne sont plus montrées nulle part. Aujourd'hui, la seule façon d'enregistrer la 2e carte est un `curl`.

- **Correction** : une page « Ajouter une carte » (`#/ajouter`, ordinateur seulement) qui réutilise `Setup` avec un titre adapté (« Ajoute une carte ») et un lien retour. Accès par un lien « + ajouter une carte » sous le sélecteur de la colonne. Quand une carte inconnue écrit, la colonne le dit (« 1 carte inconnue essaie de se connecter ») avec un lien vers cette page.
- **Touche** : `web/src/routes.ts` (aussi modifié par `feat-bilan`, conflit petit), `App.tsx`, `Sidebar.tsx`, `Setup.tsx`, `styles.css`.
- **Taille** : S.

### B2. Une alerte sur l'autre pièce est invisible

Le point rouge de l'onglet Alertes compte **seulement la carte affichée** (`device.open_alerts`). Avec « Chambre » à l'écran, « démo » pouvait être à 1 480 ppm en alerte depuis 5 minutes : rien dans la colonne, rien dans le sélecteur (un `<select>` natif qui ne montre que des noms), rien sur téléphone. On ne le découvre qu'en changeant de carte par hasard. Les notifications ntfy (PR #13) couvriront le cas « app fermée », pas « app ouverte sur l'autre pièce ».

- **Correction** : voir A1, qui remplace le `<select>` par une liste de pièces portant chacune son nombre d'alertes. En version minimale : une ligne sous le sélecteur, « ▲ démo : 1 alerte », qui bascule sur cette carte.
- **Touche** : `Sidebar.tsx`, `mobile/MobileShell.tsx` (barre du haut ; `feat-bilan` y ajoute 2 lignes ailleurs).
- **Taille** : S.

### B3. OTA : une carte peut recevoir l'image de l'autre, et devenir injoignable

L'image firmware contient le `DEVICE_TOKEN` de la carte pour laquelle elle a été compilée (DEVELOPERS.md : « build one image per board »). Mais les firmwares sont une **liste unique** (`server/src/firmware.ts`, `data/firmware/<version>/`) :

1. La page Carte de **chaque** carte propose **toutes** les versions, sans dire pour quelle carte chacune a été compilée. Vérifié : `2.1.0` est proposée à « Chambre » comme à « démo ».
2. Installer sur « Chambre » l'image de « démo » : la carte redémarre avec le jeton de « démo », le serveur répond 401 (« token refused » dans le firmware) et la carte ne peut plus rien recevoir, **même pas la commande « revenir au firmware précédent »**. Il faut la rebrancher et la reflasher au câble.
3. Deux cartes avec le même numéro de version (`2.1.0` pour chacune) : le 2e envoi **écrase** l'image du premier sans prévenir (`save` réécrit le dossier).

- **Correction** : à l'envoi, le serveur cherche dans l'image une chaîne de 43 caractères base64url dont le SHA-256 égale le `token_hash` d'une carte (le jeton est une constante en clair dans l'image, `src/utils/secrets.h` du firmware). Il connaît ainsi la carte propriétaire, rangée à côté de l'image (`meta.json` dans le dossier de la version : pas de migration SQLite, donc pas de conflit avec celle de `feat-ntfy`). Ensuite :
  - la liste des firmwares (Réglages) affiche « pour Chambre », ou « aucune carte » en couleur d'alerte (jeton changé depuis la compilation, ou image sans jeton) ;
  - la page Carte ne propose que les images de cette carte ;
  - `POST /devices/:id/commands` refuse un `ota` vers une image d'une autre carte ou sans propriétaire (422, message clair) ;
  - envoyer une version qui existe déjà pour **une autre** carte est refusé (409, « 2.1.0 existe déjà pour démo, choisis un autre numéro, par ex. 2.1.0-chambre »). Réenvoyer la même version pour la même carte reste possible, comme aujourd'hui.
  Les images déjà envoyées n'ont pas de `meta.json` : le serveur les analyse à la lecture la première fois.
- **Touche** : `server/src/firmware.ts`, `server/src/routes/app.ts` (aussi modifié par `feat-ntfy` et `feat-bilan`, dans d'autres sections), `server/src/types.ts` (`FirmwareRow.device_id`, aussi modifié par les deux branches, ajout d'un champ), tests serveur, `components/FirmwareSection.tsx`, `pages/card/CardPage.tsx`, DEVELOPERS.md.
- **Taille** : M. C'est le seul bug qui peut coûter un démontage de carte.

### B4. Suppression : message faux, et on atterrit ailleurs sans le savoir

La confirmation dit « tu reviendras à l'écran d'ajout ». Avec deux cartes, c'est faux : on arrive sur la première carte de la liste, sans que rien ne le signale à part un toast « salon supprimée ».

- **Correction** : texte selon le nombre de cartes (« tu passeras sur Chambre »), et toast « salon supprimée. Tu vois maintenant Chambre. ».
- **Touche** : `pages/settings/SettingsPage.tsx`, `App.tsx` (`onDeleted`).
- **Taille** : XS.

### B5. L'ordre des cartes dépend de la casse

`GET /devices` trie par `ORDER BY name`, en binaire : les majuscules passent avant les minuscules et les accents à la fin. « Chambre » avant « démo » avant « salon », mais « Étage » après « salon ». Renommer une carte la fait sauter dans la liste.

- **Correction** : trier côté web avec `Intl.Collator("fr", { sensitivity: "base" })`. Un ordre choisi à la main est l'amélioration A5.
- **Touche** : `App.tsx` (ou `server/src/routes/app.ts`, une ligne).
- **Taille** : XS.

### B6. Une carte juste ajoutée a l'air en panne

Une carte enregistrée mais jamais connectée s'affiche « ○ hors ligne », valeurs vides, exactement comme une carte tombée. C'est le cas de la 2e carte entre l'ajout et le premier flash.

- **Correction** : « en attente du premier contact » quand `last_seen` est nul (colonne, page Carte, barre du haut mobile), avec un rappel des étapes (jeton → `.env` → flash).
- **Touche** : `Sidebar.tsx`, `pages/card/CardPage.tsx`, `mobile/MobileShell.tsx`.
- **Taille** : XS.

### Déjà corrigé ailleurs : la vue mobile est une page blanche sur `main` (macOS)

`web/src/mobile/gauge.ts` masque `Gauge.tsx` sur un disque insensible à la casse : `import { Gauge } from "./Gauge"` charge `gauge.ts` et la vue mobile plante (« does not provide an export named 'Gauge' »). `feat-bilan` et `feat-ntfy` renomment tous deux le fichier en `gaugeGeometry.ts`. Rien à faire ici, à part ne pas toucher ce fichier.

## Améliorations

Classées par utilité.

### A1. Les pièces dans la colonne, à la place du sélecteur (recommandée)

Avec plusieurs cartes, le haut de la colonne devient une courte liste, une ligne par pièce :

```
AQA
▸ Chambre        ○ hors ligne
  démo   CO₂ mauvais  ▲ 1
  + ajouter une carte
mesuré il y a 6 min
```

- La pièce affichée est en tête de ligne (▸, texte plein, nom en plus grand qu'aujourd'hui). Les autres affichent leur **pire zone du moment** (mot coloré, jamais la couleur seule) et leur nombre d'alertes en cours. Un clic bascule sur la pièce.
- Avec une seule carte : rien ne change par rapport à aujourd'hui (juste le nom, et le lien « + ajouter une carte » discret).
- Sur téléphone : toucher le nom dans la barre du haut ouvre la même liste en feuille plein écran (au lieu du `<select>` natif), et la barre du haut montre « ▲ » quand une autre pièce a une alerte.
- Règle B2, rend le nom de la pièce bien visible partout, et donne un premier « coup d'œil sur toutes les pièces » sans nouvelle page. Toutes les données sont déjà dans `GET /devices` (`latest`, `open_alerts`, `online`).
- **Touche** : `Sidebar.tsx`, `mobile/MobileShell.tsx`, `styles.css`, une fonction pure « pire zone d'une carte » dans `metrics.ts` (aussi modifié par `feat-bilan` : ajout en fin de fichier, conflit faible) ou dans un nouveau fichier.
- **Taille** : S à M.

### A2. Le nom de la pièce dans la page Mesures

La page Mesures est la seule dont le titre ne dit pas quelle pièce on regarde (« CO₂ ppm », « 5 mesures »). Ajouter la pièce au sous-titre du bandeau : « Chambre · 24 h glissantes · moyennes sur 1 min », seulement s'il y a plusieurs cartes. Même chose pour le nom du CSV, qui utilise aujourd'hui l'identifiant (`aqa-DE0000000002-co2-2026-11-24.csv` → `chambre-co2-2026-11-24.csv`).

- **Touche** : `pages/measures/MeasuresPage.tsx`, `DevicePage.tsx` (passe le nom).
- **Taille** : XS.

### A3. Comparer deux pièces sur un graphe

En vue 1 graphe, un bouton « comparer avec… » dans le bandeau. La courbe de l'autre pièce s'ajoute, en pointillé, avec son nom au bout comme la valeur actuelle. Les zones de fond restent celles de la mesure (identiques pour les deux pièces). L'infobulle donne les deux valeurs. Les stats MIN / MOY / MAX restent celles de la pièce affichée. Le son n'est comparable que si les deux cartes sont calibrées (sinon le bouton propose les autres pièces seulement pour les autres mesures).

- Utile pour savoir quelle pièce aérer en premier ou comprendre un écart de température. Pas en grille, pas sur téléphone (la vue mobile n'a déjà qu'un graphe à la fois ; on pourra l'ajouter plus tard).
- **Touche** : `components/ZoneChart.tsx` (une 2e série ; `feat-bilan` y change 2 lignes), `pages/measures/MeasuresPage.tsx`, `Banner.tsx`, `useSeries` appelé deux fois, `selection.ts` (pièce comparée, en `sessionStorage`).
- **Taille** : M.

### A4. Une page « Pièces » : toutes les valeurs côte à côte

Une page `#/pieces` (visible s'il y a au moins deux cartes) : un tableau, une ligne par pièce, une colonne par mesure avec valeur et mot de zone, état, dernière mesure, alertes en cours. Un clic sur une case ouvre cette pièce sur cette mesure. Sur téléphone, le même tableau en cartes empilées.

- Plus complet que A1, mais A1 couvre déjà le besoin principal (« quelle pièce va mal ? »). À faire si l'utilisateur veut vraiment voir les cinq mesures de chaque pièce d'un coup.
- **Touche** : `routes.ts` (conflit avec `feat-bilan`, qui ajoute aussi un onglet), nouvelle page, `mobile/routes.ts` (même remarque).
- **Taille** : M.

### A5. Ordre des pièces choisi par l'utilisateur

Glisser les pièces dans la liste de A1 pour fixer leur ordre. En `localStorage`, comme l'ordre des jauges sur téléphone (`mobile/order.ts`) : pas de migration serveur.

- **Taille** : S. Peu utile à deux cartes ; B5 suffit pour l'instant.

### A6. Commandes envoyées à l'autre pièce

Le compteur « en cours » de l'onglet Carte et les toasts « terminé / échec » ne suivent que la carte affichée (`DevicePage`). Lancer une mise à jour sur « démo » puis passer sur « Chambre » : on ne saura jamais si elle a réussi, sauf en revenant sur « démo ». Correction : `App` suit les commandes de toutes les cartes (un poll par carte, ou une route qui les renvoie toutes) et préfixe le toast du nom de la pièce.

- **Touche** : `App.tsx`, `pages/device/DevicePage.tsx`, `pages/device/shared.tsx`.
- **Taille** : S.

## Non-objectifs

- Règles d'alerte différentes par carte : exclu par la spec Alertes, et `feat-ntfy` garde les règles globales. La page Alertes pourrait juste dire « Ces règles valent pour toutes les cartes ».
- Ajouter une carte depuis le téléphone (spec mobile : c'est une tâche d'ordinateur).
- Bilan comparé entre pièces (`feat-bilan` reste par carte).
- Plusieurs comptes ou des droits par carte.

## Recommandation

Dans l'ordre : **B1** (sans lui, la 2e carte ne s'ajoute pas), **B3** (le seul risque matériel), **A1** (qui règle B2 et la visibilité du nom), puis les petits **B4, B5, B6, A2**. A3 ensuite si l'envie de comparer se confirme ; A4, A5 et A6 peuvent attendre.

## Décision de l'auteur

- **À faire maintenant** : B1, B3 et A1 (qui règle B2).
- **Restent à faire** : B4, B5, B6, A2 (petits), A3 (comparer deux pièces), puis A4, A5, A6.

## Fichiers partagés avec les autres branches

| Fichier | `feat-ntfy` (PR #13) | `feat-bilan` | Touché par |
|---|---|---|---|
| `server/src/routes/app.ts` | oui | oui | B3 (section firmware et commande `ota`) |
| `server/src/types.ts` | oui | oui | B3 (un champ dans `FirmwareRow`) |
| `web/src/routes.ts` | non | oui | B1, A4 |
| `web/src/mobile/MobileShell.tsx` | non | oui (2 lignes) | A1, B2, B6 |
| `web/src/components/ZoneChart.tsx` | non | oui (2 lignes) | A3 |
| `web/src/metrics.ts` | non | oui (gros changement) | A1 : à éviter, mettre la fonction ailleurs |
| `web/src/styles.css` | oui | oui | A1, B1 : ajouts en fin de section |
| `server/scripts/seed-demo.ts` | non | oui | fait : argument `chambre`, lignes à l'écart des leurs |
| `web/src/mobile/gauge.ts` | renommé | renommé | à ne pas toucher |
