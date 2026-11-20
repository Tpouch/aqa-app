# Version mobile

Date : 2026-11-21 · Portée : `web/` uniquement (aucun changement serveur)

## Intention

Sur téléphone, on ne fait pas la même chose que sur ordinateur. On veut **voir l'air d'un coup d'œil**, regarder une alerte, jeter un œil à un graphe. On ne veut pas piloter la carte ni régler des seuils. L'auteur veut donc des **pages différentes sur mobile**, et pas la version web compressée qu'on a aujourd'hui (colonne au-dessus du contenu, voir `docs/screenshots/phone.png`).

Maquette validée dans le compagnon visuel : `.superpowers/brainstorm/438044-1795216249/content/mobile-v1.html` (non commitée).

## Objectifs

- **Dashboard** à la place de Mesures : une jauge par mesure, sur **2 colonnes**. L'utilisateur **choisit l'ordre** des jauges en les glissant, pour avoir en haut celles qui l'intéressent.
- **Barre d'onglets en bas** avec icônes : Dashboard, Alertes, Infos, Graph.
- **Graph** : on choisit un capteur, son graphe s'ouvre en plein écran, pensé pour le **paysage**.
- **Alertes** : alertes en cours et journal.
- **Infos** : état de la carte en **lecture seule**.

## Non-objectifs

- Pas d'onglet **Carte** ni **Réglages** sur mobile : pas de commandes, pas d'OTA, pas de modification des règles d'alerte, pas de calibration.
- Pas d'app native, pas de PWA installable, pas de notifications push.
- Pas de grille multi-graphes, pas d'export CSV, pas de plage personnalisée sur mobile.
- Aucun changement serveur ni API.

## Anti-objectifs

- Une version mobile qui ressemble à un site web rétréci (boutons minuscules, scroll horizontal, menus de bureau).
- Casser la version ordinateur : la vue large doit rester identique.
- Un glisser-déposer qui gêne le défilement normal de la page.

## Approches considérées

1. **Détection du mobile**
   - **Retenue : A.** Un second cadre `MobileShell` dans la même app React, choisi selon la largeur d'écran (≤ 720 px, même seuil que le CSS actuel). Il réutilise l'API, `usePoll`, `useSeries`, `metrics.ts`, `ZoneChart` et le journal des alertes.
   - B, rejetée : une route séparée `#/m/...`. Il faudrait deux liens, et un téléphone qui ouvre le lien normal tomberait sur la version web.
   - CSS seul : impossible, puisque les pages diffèrent.
2. **Graphe en paysage**
   - **Retenue : A.** Plein écran, puis `screen.orientation.lock("landscape")` là où c'est permis (Android/Chrome, en plein écran). Ailleurs, en particulier sur iPhone où Safari ne permet pas de forcer l'orientation, on montre en portrait une indication « tourne ton téléphone » et le graphe reste utilisable. Une fois le téléphone tourné, le graphe occupe tout l'écran.
   - B, rejetée : faire pivoter le graphe de 90° en CSS. Le curseur et le toucher de uPlot seraient décalés, et c'est incohérent si l'utilisateur tourne vraiment le téléphone.
3. **Glisser-déposer des jauges**
   - **Retenue : A.** Code maison avec les Pointer Events, sans dépendance. Des boutons haut/bas en mode organiser servent au clavier et aux lecteurs d'écran.
   - B, rejetée : `dnd-kit`. Plus robuste, mais environ 40 ko et une dépendance en plus, alors que le projet n'en a que 4.

## Conception

### Bascule web / mobile

- `App` → `Shell` choisit `MobileShell` **uniquement sur téléphone** : appareil tactile (`pointer: coarse`) dont le **petit côté** de l'écran fait ≤ 720 px, quelle que soit l'orientation (un téléphone tourné en paysage pour le graphe reste en mobile). Décision de l'auteur.
- **Un ordinateur reste toujours en version web**, même avec une fenêtre étroite. La mise en page compressée actuelle (`@media (max-width: 720px)`) reste en place pour ce cas. Redimensionner ne fait jamais basculer de vue. L'émulation mobile des DevTools de Chrome déclenche bien la version mobile, ce qui sert à tester.
- Le choix se fait au chargement et se réévalue sur changement de la requête média. En pratique, il ne bascule pas pendant l'utilisation.
- Les données (liste des cartes, carte choisie, `aqa-device` en stockage local) sont partagées avec `Shell` : changer de vue ne fait pas perdre la carte choisie.
- Routes mobiles dans le hash : `#/dashboard`, `#/alertes`, `#/infos`, `#/graph`, et `#/graph/<metric>` pour le plein écran. Le bouton retour du téléphone ferme le plein écran. Si on arrive sur mobile avec un hash web (`#/mesures`, `#/carte`, `#/reglages`), on bascule sur `#/dashboard`. L'inverse aussi : un hash mobile ouvert sur ordinateur bascule sur `#/mesures`.

### Barre du haut

- Nom de la carte, pastille en ligne / hors ligne, « il y a X ».
- Avec plusieurs cartes, toucher le nom ouvre un sélecteur de carte (un `<select>` natif suffit).

### Barre d'onglets du bas

- 4 onglets icône + libellé : Dashboard, Alertes, Infos, Graph. Zones de toucher ≥ 44 px, respect de `env(safe-area-inset-bottom)`.
- L'onglet Alertes porte le nombre d'alertes ouvertes (`device.open_alerts`), comme dans la colonne web.
- Icônes SVG en ligne, sans emoji (celles de la maquette conviennent).
- La barre est cachée dans le graphe plein écran.

### Dashboard

- Données : `device.latest` du poll des cartes (`api.devices`, toutes les 15 s). Pas besoin de série.
- Une jauge par mesure de `METRICS` : un arc de 270° découpé selon les bandes de `metricDef()`, en `good`/`warn`/`bad`, et un point à la valeur. Sous l'arc : la valeur (unité d'affichage, son en dB si calibré via `toDisplay`) et le mot de zone (`bandOf`), tous deux dans la couleur de la zone.
- Bornes des arcs : **à fixer par le constructeur** dans un module dédié. Pour la maquette : CO₂ 400–2000, PM2.5 0–75, Son 30–90 dB, Température 10–35, Humidité 0–100. La valeur est plafonnée aux bornes, mais le nombre affiché reste la vraie valeur.
- Son non calibré (`bands === null`) : arc neutre (`--rule-strong`) sans zones, valeur en amplitude, pas de mot.
- Valeur absente (`null`) : « — », arc sans point.
- Données périmées : jauges grisées si la carte est hors ligne (`device.online === false`) **ou** si la dernière mesure est marquée `latest.stale`. La barre du haut dit depuis quand. *(Choix de conception, pas une demande de l'auteur.)*
- Une jauge en zone `bad` a une bordure `--bad`.
- **Toucher une jauge** ouvre son graphe plein écran (`#/graph/<metric>`).

### Mode organiser

- On y entre par le bouton « organiser » ou par un appui long (~500 ms) sur une jauge. On en sort par « terminé ».
- L'appui long fait seulement entrer en mode organiser. On lève le doigt, puis un nouvel appui sur une jauge la fait glisser. Ainsi, `touch-action` n'a jamais à changer au milieu d'un toucher. *(Choix de conception.)*
- En mode organiser, on glisse une jauge pour la déplacer. La jauge soulevée suit le doigt et les autres se décalent. Le toucher d'une jauge n'ouvre plus le graphe.
- Le défilement de la page doit rester possible. Le glisser ne démarre que sur la jauge, en mode organiser (`touch-action: none` sur les jauges seulement dans ce mode).
- Chaque jauge a aussi des boutons « monter / descendre » accessibles (avec `aria-label`), visibles en mode organiser.
- L'ordre est enregistré dans le stockage local du téléphone (`storageSet`). Il est **le même pour toutes les cartes**. Si une mesure manque ou est inconnue dans l'ordre enregistré, on la complète avec l'ordre par défaut `METRICS`.
- Animation courte (≤ 200 ms) au déplacement, désactivée avec `prefers-reduced-motion`.

### Alertes

- Réutilise `AlertJournal` (en cours + journal + « plus ancien »), avec la logique de pagination de `AlertsPage`. Il faut en extraire un hook ou un composant commun plutôt que de la dupliquer.
- Pas de `RuleList`. Une phrase : « Les règles se modifient sur la version ordinateur. »

### Infos

- État de la carte en lecture seule, à partir de `DeviceSummary` / `DeviceStatus` : en ligne / hors ligne, dernier contact, dernière mesure, Wi-Fi (SSID et RSSI), allumée depuis, firmware, capteurs présents, son calibré ou non, identifiant de la carte.
- Pas de bouton « actualiser l'état » (c'est une commande).
- `status === null` : « état pas encore reçu ».
- En bas : bascule clair / sombre et déconnexion (`SessionTools`). La version mobile n'a pas d'autre endroit pour ça.

### Graph

- Liste des 5 capteurs avec leur valeur actuelle et sa couleur de zone. Toucher un capteur ouvre `#/graph/<metric>`.
- Plein écran : titre (mesure, unité, période), plages **1h, 6h, 24h, 7j, 30j** (24h par défaut), bouton ✕ qui revient à l'écran précédent (Dashboard ou liste Graph). Le graphe est `ZoneChart` avec `useSeries`, qui remplit la hauteur disponible.
- **C'est la route qui fait foi** : `#/graph/<metric>` affiche le graphe sur toute la page de l'app (barres masquées). Le plein écran du navigateur et le verrouillage en paysage sont un **bonus**, tenté seulement quand on ouvre le graphe par un toucher (le navigateur exige un geste). Ouvrir le lien directement, recharger ou faire « suivant » donne le graphe sur toute la page, sans plein écran système. *(Choix de conception.)*
- Sortir du plein écran du navigateur (retour Android, geste système) **ne ferme pas** le graphe, qui reste affiché sur toute la page. ✕ ou un second retour le ferme : `history.back()` si on est arrivé depuis l'app, sinon remplacement par `#/graph`.
- À l'ouverture par un toucher, on tente le plein écran et le verrouillage en paysage. En cas d'échec, on ignore l'erreur. En portrait, on affiche une indication « tourne ton téléphone pour un graphe plus large », sans bloquer l'écran.
- À la fermeture, on sort du plein écran et on libère l'orientation.
- La période choisie sur mobile n'a pas besoin d'être partagée avec `useRange` du web.

### Aucune carte

- Si aucune carte n'est enregistrée, le mobile affiche « Aucune carte. Ajoute ta première carte depuis la version ordinateur. » avec la déconnexion. Pas d'écran de configuration.

### Style

- Mêmes tokens et même police que le web (`styles.css`, IBM Plex Mono, clair/sombre). Le CSS mobile va dans une section ou un fichier à part, préfixé (par ex. `.mb-`).
- Respecter `env(safe-area-inset-*)`, `100dvh` pour le plein écran, pas de zoom sur les champs (taille ≥ 16 px sur le `<select>`).

## Laissé au constructeur

- Requête média exacte de la bascule (voir la règle plus haut).
- Bornes précises des arcs de jauge.
- Découpage en fichiers (proposé : `web/src/mobile/…`).
- Détails de l'animation du glisser.
- Tests : au minimum, l'ordre des jauges (lecture/écriture, complétion d'un ordre incomplet), le parsing des routes mobiles et le calcul d'angle de la jauge, en tests unitaires comme le reste du projet.
