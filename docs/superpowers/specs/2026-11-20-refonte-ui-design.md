# Refonte de l'UI du dashboard AQA

Date : 2026-11-20 · Portée : `web/`, plus une petite extension du serveur pour la calibration du son

## Intention

Le dashboard actuel (React + Vite, `web/`) « se voit fait par une IA » : style minimal générique (ardoise, Fira Sans, cartes arrondies à ombre, icônes Phosphor partout, badges). L'auteur veut refaire **toute l'UI** avec une identité propre, et surtout que **les graphiques soient extrêmement faciles à lire et à comprendre**.

Maquettes validées dans le compagnon visuel : `.superpowers/brainstorm/174572-1795199890/content/` (non commité) — `mesures-page-v3.html` (vue 1 graphe), `mesures-grille.html` (vue grille), `carte-reglages.html`.

## Objectifs

- Direction visuelle « instrument de mesure » : comme la face avant d'un appareil de labo, pas un SaaS.
- **Mode sombre par défaut**, avec un bouton pour passer en clair (choix mémorisé).
- Graphiques lisibles d'un coup d'œil : zones colorées en fond (bon / aérer / mauvais) avec leur nom écrit, valeur actuelle au bout de la courbe.
- Pouvoir voir une mesure en grand **ou** plusieurs à la fois en grille, sans faire défiler sur un écran de portable.

## Non-objectifs

- Aucune modification du firmware. Côté serveur, seul ajout : la calibration du son par carte (voir « Son en dB »). Rien d'autre ne change dans l'API ni le modèle de données.
- Pas de nouvelles fonctionnalités métier : toutes les actions existantes sont conservées, rien n'est ajouté côté données (sauf calculs d'affichage côté client : min/moy/max, temps en zone).

## Anti-objectifs (échec même si « ça marche »)

- Retomber dans le look générique : cartes arrondies avec ombre, dégradés, badges-pilules colorés, une icône devant chaque titre, emoji, Tailwind/shadcn par défaut.
- Un graphique qui demande de lire l'axe pour savoir si l'air est bon.
- Perdre une fonction existante (export CSV, navigation jour par jour, plage libre, OTA, rollback, Wi-Fi distant, géohash, paramètres, firmwares, jeton, suppression, journal filtré, toasts de fin de commande, confirmation avant action risquée, anciens liens `#/device/<id>/<tab>`).
- Régression d'accessibilité : focus visible, contraste ≥ 4.5:1 sur le texte, la couleur n'est jamais le seul signal (chaque zone a un mot).

## Contraintes

- Pile existante conservée : React 19, Vite, TypeScript, **uPlot** (curseur synchronisé déjà en place via `cursor.sync.key = "aqa"`).
- Langue de l'UI : français.
- Routage hash existant (`useHashRoute`) ; `tsc --noEmit && vite build` doit passer.

## Approches envisagées

1. **Garder la pile, refaire la couche visuelle** (retenue). On réécrit `styles.css` à zéro, on restructure pages et composants, on conserve `api.ts`, `usePoll`, `useSeries`, `useCommands`, la logique des formulaires, et uPlot avec des hooks de dessin pour les zones.
2. Passer à Tailwind/shadcn : écarté, c'est précisément le look qu'on quitte et ça ajoute des dépendances.
3. Changer de lib de graphiques (Recharts, ECharts) : écarté, uPlot fait déjà le curseur partagé et le dessin libre, en bien plus léger.

L'auteur a laissé le choix technique ; l'approche 1 est le choix de Claude.

## Décisions de l'auteur

### Direction visuelle (choix « A · Instrument »)
- Chiffres en monospace, filets fins (1 px) à la place des cartes, pas d'ombres ni de coins arrondis marqués.
- Une seule couleur vive réservée aux alertes ; le reste est neutre.

### Mise en page (choix « A2 · colonne à gauche »)
- **Colonne fixe à gauche, sur toutes les pages** : marque « AQA », sélecteur de carte (si plusieurs), point en ligne + « mesuré il y a … », puis les 5 relevés actuels (libellé · unité · mot de zone · valeur), puis la navigation en bas, le bouton clair/sombre et la déconnexion.
- Sur téléphone, la colonne passe au-dessus du contenu.

### Navigation : 3 onglets
- **Mesures** (fusion de « Tableau de bord » et « Capteur »), **Carte** (état + actions + en cours + journal, ex-« Commandes » + carte d'état), **Réglages** (ex-« Options »).
- L'onglet Carte affiche le nombre de commandes en cours.

### Page Mesures
- Les relevés de la colonne servent de **sélecteur de mesure**.
- **Grand bandeau** au-dessus du graphique : titre de la mesure + unité + pas de moyenne ; boutons de période 1h / 6h / 24h / 7j / 30j ; navigation jour ‹ jour › ; « plage… » (plage libre) ; « csv ↓ » ; interrupteur **1 graphe / grille**.
- **Ligne de stats** sous le bandeau : MIN (avec l'heure), MOYENNE (avec sa zone), MAX (avec l'heure), TEMPS EN ZONE MAUVAISE (pour les mesures qui ont des zones).
- **Vue 1 graphe** : graphique d'environ 310 px de haut (la v1 à ~330 était trop grande, la v2 à 230 trop petite).
- **Vue grille** : en mode grille, chaque relevé de la colonne a une case à cocher ; les mesures cochées s'affichent en grille. 1–2 mesures → 1 colonne, graphiques plus hauts ; ≥ 3 → 2 colonnes ; nombre impair → la case vide montre un résumé de la période (temps en zone mauvaise par mesure). Les 5 mesures doivent tenir sans défilement sur un écran de portable (~768 px de haut utile). Curseur partagé entre tous les graphiques. Un clic sur un graphique de la grille l'ouvre en vue 1 graphe. Sur téléphone : 1 colonne.

### Graphiques (choix « G3 + zones de G1 »)
- Fond découpé en **bandes de zone** colorées et transparentes, avec le **nom de la zone écrit à droite** (bon / aérer / mauvais, ou confort).
- Courbe neutre (couleur du texte), **valeur actuelle** marquée par un point de la couleur de sa zone, avec le nombre écrit à côté.
- Infobulle au survol : date/heure + valeur colorée selon la zone ; ligne verticale pointillée.

### Zones
| Mesure | Zones |
|---|---|
| CO₂ (ppm) | bon < 800 · aérer 800–1200 · mauvais ≥ 1200 (existant) |
| PM2.5 (µg/m³) | bon < 15 · aérer 15–35 · mauvais ≥ 35 (existant) |
| Température (°C) | confort 19–24 · hors confort en dessous (« froid ») et au-dessus (« chaud ») |
| Humidité (%) | confort 40–60 · hors confort en dessous (« sec ») et au-dessus (« humide ») |
| Son (dB estimés, après calibration) | calme < 55 · bruyant 55–70 · fort ≥ 70 |
| Son (non calibré, amplitude brute) | aucune zone, unité « amplitude », lien « Calibrer » vers Réglages |

**Hors confort = alerte (décision de l'auteur, 1a).** Pour la température et l'humidité, les bandes hors confort sont dessinées en couleur d'alerte (orange), la valeur et le mot (« chaud », « sec »…) prennent cette couleur, et le temps passé hors confort est compté. La 4ᵉ stat s'appelle donc « EN ZONE MAUVAISE » pour CO₂/PM2.5, « HORS CONFORT » pour température/humidité, « SON FORT » pour le son calibré ; absente pour le son non calibré.

Modèle de niveaux : chaque mesure décrit ses bandes (bornes, mot, ton bon/aérer/mauvais). Ça remplace `thresholds: [warn, bad]` dans `util.ts`, car la température et l'humidité ont des bandes des deux côtés.

Mots de zone dans la colonne : CO₂/PM2.5 → « bon » / « aérer » / « mauvais » ; température → « froid » / « confort » / « chaud » ; humidité → « sec » / « confort » / « humide » ; son → « calme » / « bruyant » / « fort ».

### Échelle verticale (décision de l'auteur, 2c)
L'axe s'ajuste aux données, mais inclut toujours **la limite de la zone suivante** pour qu'on voie où elle commence. CO₂ entre 450 et 600 → l'axe monte au moins jusqu'à 800 (début de « aérer »). Température et humidité → la bande de confort entière est toujours visible. Son calibré → au moins jusqu'à 55 dB. Si la courbe entre dans une zone plus haute, l'axe l'englobe normalement.

### Son en dB (décision de l'auteur, option a)
- Le firmware envoie `snd` = amplitude crête-à-crête ADC (0–4095), moyennée sur 15 s (`EPITECH_ESP32/src/hal/sensors/sound_sensor.cpp`, `docs/api.md`). Il ne change pas.
- **Calibration par carte, stockée sur le serveur** : deux valeurs, `snd_ref` (amplitude de référence) et `db_ref` (dB lus sur un sonomètre au même moment). Nouvelles colonnes nullables sur `devices` (migration douce comme le reste de `db.ts`), exposées dans le résumé de la carte et modifiables via le `PATCH /api/v1/devices/:id` existant (corps étendu : `name` devient optionnel, ajout d'un objet `sound_calibration` ou `null` pour effacer). Tests serveur ajoutés dans `server/test/api.test.ts`.
- **Conversion à l'affichage** dans le dashboard : `dB = db_ref + 20·log10(snd / snd_ref)`, avec `snd ≤ 0` → pas de valeur. S'applique à l'historique comme aux valeurs actuelles et à l'export CSV (colonne `snd_db` ajoutée, `snd` brut conservé).
- **Réglages → ligne « Calibrer le son »** : aide « Mesure le niveau de la pièce avec une appli sonomètre, puis saisis-le » ; champ dB + bouton « Calibrer maintenant » qui prend comme `snd_ref` la dernière valeur `snd` reçue (refusé si la dernière mesure date de plus de 2 min ou si `snd` est nul) ; affiche la calibration actuelle et un bouton « Effacer ».
- Libellé partout : « Son · dB (estimé) ».

### Bandeau en mode grille (choix de Claude)
Le bandeau reste identique en grille (périodes, ‹ jour ›, plage…, csv). La ligne de stats MIN/MOY/MAX n'apparaît qu'en vue 1 graphe ; en grille, chaque graphique affiche seulement la valeur sous le curseur. « csv ↓ » exporte les mesures affichées (la mesure choisie en vue 1 graphe, les mesures cochées en grille).

### Page Carte
- En-tête : nom, identifiant, état en ligne + dernier contact, bouton « actualiser l'état ».
- Ligne de 4 blocs : FIRMWARE (version + matériel), ALLUMÉE DEPUIS (durée + n° de démarrage), WI-FI (dBm + qualité, SSID, IP), FILE D'ATTENTE (en attente, perdues, mémoire libre).
- Ligne capteurs : ✓/✗ par capteur détecté, géohash à droite.
- Deux colonnes : **Actions** (redémarrer ; mettre à jour = sélecteur de version + Installer ; revenir au firmware précédent en couleur d'alerte) puis **En cours** (barre de progression fine) | **Journal** (tableau heure · point de niveau · message, filtres tout / commandes / problèmes).
- Si aucun rapport d'état : message à la place des blocs.

### Page Réglages
- Une ligne par réglage : libellé + aide courte à gauche (~220 px), champ(s) + bouton à droite. Ordre : Nom, Calibrer le son, Wi-Fi, Position, Paramètres, Firmwares.
- **Zone sensible** en bas, séparée par un filet de couleur d'alerte : Nouveau jeton, Supprimer la carte.

### Connexion et ajout de carte
- Même style, sans maquette dédiée (validé par l'auteur).

## Choix de Claude (à vérifier en relisant)

- **Typo** : IBM Plex Mono partout (`@fontsource/ibm-plex-mono`, graisses 400/500/600), remplace Fira Sans/Fira Code. Chiffres tabulaires.
- **Palette sombre (défaut)** : fond `#121311`, surface sélectionnée `#1d1e1b`, texte `#e9e5dc`, texte secondaire `#8d887d`, filets `#2a2a26` / `#3a3934` ; zones : bon `#7fbf8a`, aérer `#e3b341`, mauvais/alerte `#ff6a3d` (bandes de fond à 7–14 % d'opacité).
- **Palette claire** : papier `#f4f1ea`, texte `#1c1b19`, secondaire `#6b665c`, filets `#cfc9bc` ; mêmes teintes de zone, assombries pour garder 4.5:1 sur papier.
- **Thème** : sombre par défaut quoi qu'en dise le système ; bouton « ◐ clair / sombre » en bas de la colonne ; choix stocké dans `localStorage` (`aqa-theme`), appliqué via `data-theme` sur `<html>` avant le premier rendu (script inline dans `index.html`) pour éviter un flash.
- **Icônes** : on retire `@phosphor-icons/react`. Glyphes texte (● ▾ ‹ › ↓ ↻ ✓ ✗ →) en `aria-hidden`, chaque bouton garde un libellé texte.
- Composants communs (toasts, modale de confirmation, champ, bouton) gardés côté logique, restylés : coins ≤ 2 px, filets, pas d'ombre (sauf modale : fond assombri).
- Les clés `sessionStorage` existantes (période, mesure choisie) sont conservées ; on ajoute `aqa-view` (1 graphe / grille) et `aqa-grid-metrics`.
- Routes : `#/mesures`, `#/carte`, `#/reglages`. Les anciennes (`#/overview`, `#/sensor`, `#/commands`, `#/options`, `#/device/<id>/<tab>`) redirigent.

## Laissé au builder

- Découpage exact des composants et fichiers.
- Hauteur des graphiques en grille (doit respecter « 5 mesures sans défilement à ~768 px »).
- Calcul du temps en zone mauvaise à partir des lignes agrégées (somme des pas dont la moyenne dépasse le seuil).
- Comportement responsive détaillé entre téléphone et bureau.
- États vides / chargement (squelettes plats, sans shimmer).
