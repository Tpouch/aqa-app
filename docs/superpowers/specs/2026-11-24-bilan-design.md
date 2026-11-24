# Onglet « Bilan »

Date : 2026-11-24 · Portée : `server/` (calcul et route) et `web/` (ordinateur et mobile)

## Intention

Les pages Mesures et Graph répondent à « comment est l'air maintenant, et sur les dernières heures ». Il manque la réponse à « **est-ce que ma semaine a été bonne, et qu'est-ce que je dois changer ?** ». L'auteur veut un bilan « assez beau et simple à lire » : quelqu'un qui ne connaît rien aux ppm doit comprendre en 5 secondes si sa semaine a été bonne et quoi changer.

L'auteur a renoncé à la séance de questions ; les décisions ci-dessous ont été prises par l'agent principal (« vas-y ») et complétées ici. Maquette : `.superpowers/bilan-maquette.html` (non commitée).

## Objectifs

- Un onglet **Bilan** sur ordinateur (après Mesures) et sur téléphone (même contenu, en une colonne).
- Une **phrase-verdict** lisible d'un coup d'œil, puis le détail par mesure, les habitudes heure par heure, et 2 ou 3 constats concrets.
- Le calcul vit **côté serveur**, dans une fonction pure testée : le même calcul servira plus tard au résumé hebdo par ntfy, et à une vue qui compare les pièces.
- Une **seule source** pour les seuils de zones, partagée par le serveur et le web.

## Non-objectifs

- Envoi du bilan par ntfy ou e-mail (après fusion avec la branche `feat-ntfy`).
- Comparaison de plusieurs cartes, export PDF, zones réglables.
- Aucune migration de base : le bilan se calcule à partir des mesures (`frames`) et des alertes existantes.

## Anti-objectifs

- Un tableau de chiffres qu'il faut savoir lire. La première ligne doit suffire.
- Le look générique (cartes arrondies à ombre, dégradés, badges-pilules, emoji, icône devant chaque titre), voir la spec de refonte.
- Une couleur seule pour dire bon / mauvais : chaque couleur a son mot.
- Compter une carte hors ligne comme du « bon air » : le temps sans mesure est montré à part et n'entre jamais dans les pourcentages.
- Des seuils copiés à deux endroits.

## Décisions

### Période

- **Semaine calendaire** (lundi 00:00 → lundi suivant 00:00, heure locale) par défaut, bascule **Semaine / Mois** (mois calendaire). Flèches ‹ › pour la période précédente / suivante ; › est désactivée sur la période en cours, ‹ sur la période qui contient la création de la carte.
- La période en cours est marquée « en cours ». Ses chiffres portent sur le temps écoulé (du lundi à maintenant), et le verdict dit « pour l'instant ».
- Le choix semaine / mois est gardé pour l'onglet du navigateur (`sessionStorage`, `aqa-report-kind`). La position (‹ ›) revient à la période en cours à chaque ouverture.
- Les bornes sont calculées par le client (heure locale) et envoyées au serveur avec le fuseau (`tz`, nom IANA du navigateur). La période précédente est la semaine ou le mois calendaire d'avant, calculée elle aussi par le client (`prev_from`) : un mois de 31 jours se compare au mois de 30 jours qui le précède.

### Contenu, de haut en bas

1. **En-tête** : « Bilan » + nom de la carte ; à droite Semaine | Mois, ‹ « 17 – 23 nov. » › et la mention « en cours ».
2. **Verdict** en gros, une phrase : « **Bonne semaine** : l'air a été bon 86 % du temps. » Le début est coloré selon le ton. Dessous, en gris : la période en toutes lettres et « mesuré 6 j 20 h sur 7 j » quand il manque des mesures.
3. **Une ligne par mesure** (CO₂, PM2.5, son, température, humidité) : nom et unité, **barre horizontale empilée** du temps passé dans chaque zone (couleurs des zones, sur le seul temps mesuré), les mots de zone avec leur pourcentage sous la barre, la **moyenne** colorée selon sa zone, et la **comparaison** avec la période précédente. Son non calibré : pas de barre, une ligne sobre « pas de zones tant que le son n'est pas calibré » (avec le lien « Calibrer » sur ordinateur) et la moyenne en amplitude.
4. **CO₂ heure par heure** : carte de chaleur 7 lignes (lundi → dimanche) × 24 colonnes (0 h → 23 h). Chaque case prend la couleur de la zone de la moyenne horaire ; une case sans mesure est vide (simple contour). Semaine : une ligne par jour réel (« lun. 17 »). Mois : une ligne par jour de la semaine, moyenne de tous les lundis, etc. (« lun. »), pour faire ressortir les habitudes. Légende avec les mots. Survol / toucher : « mar. 18, 22 h : 1 340 ppm (mauvais) » en `title` et en texte pour les lecteurs d'écran (tableau avec en-têtes).
5. **À retenir** : 2 ou 3 constats en phrases, numérotés, générés par des règles simples (ci-dessous).

### Calcul (serveur, fonction pure)

- `server/src/zones.ts` : **les bandes de zones** (CO₂, PM2.5, température, humidité, son en dB) et `bandOf`. `web/src/metrics.ts` les importe au lieu de les définir, comme `sound.ts` est déjà partagé. Le fichier n'importe que des types.
- `server/src/report.ts` : `buildReport(input)` pure, sans base ni horloge. Entrées : bornes, période précédente, fuseau, maintenant, calibration du son, moyennes par minute des deux périodes, alertes ouvertes dans chaque période.
- **Granularité** : moyennes par tranche de 60 s (même requête que `frames/aggregate`). Une tranche mesurée vaut jusqu'à la tranche mesurée suivante si celle-ci arrive dans les 10 minutes (une carte réglée pour envoyer moins souvent reste « mesurée » en continu) ; au-delà, c'est une coupure et la tranche ne vaut que ses 60 s. Le temps restant compte comme « pas de mesure ». Un mois et le mois précédent font ~90 000 tranches, calculées en quelques dizaines de ms.
- **Temps par zone** : pour chaque mesure, secondes passées dans chaque bande (`bandOf` sur la moyenne de la tranche). Le son est converti en dB avec la calibration de la carte (`soundDb`) ; sans calibration, pas de zones.
- **« Air bon »** (verdict) : par tranche, la pire zone entre CO₂ et PM2.5 (ceux qui sont mesurés). Température, humidité et son sont du confort, pas de la qualité de l'air : ils ne comptent pas dans le verdict mais ont leur ligne et peuvent donner un constat.
- **Heure locale** : jour de la semaine et heure de chaque tranche dans le fuseau demandé (`Intl.DateTimeFormat`, décalage mis en cache par heure, donc juste lors des changements d'heure : une semaine d'octobre a bien 169 heures).
- **Seuils du verdict** (% du temps mesuré) : *mauvais* si mauvais ≥ 15 % ou bon < 50 % ; *moyen* si mauvais ≥ 3 % ou bon < 80 % ; sinon *bon*.
  - bon : « Bonne semaine : l'air a été bon 86 % du temps. »
  - moyen : « Semaine moyenne : l'air a été bon 72 % du temps, et mauvais 4 %. » (la fin seulement si mauvais ≥ 1 %)
  - mauvais : « Mauvaise semaine : l'air a été mauvais 22 % du temps. » ou, si le mauvais reste faible, « … : l'air n'a été bon que 41 % du temps. »
  - Mois : « Bon mois / Mois moyen / Mauvais mois ». Période en cours : « Bonne semaine pour l'instant : … ».
  - Aucune mesure : « Pas de mesure cette semaine : la carte était peut-être hors ligne. » (sans couleur).
- **Comparaison** par mesure : part du temps mesuré passée dans la zone à éviter (« en zone mauvaise » pour CO₂/PM2.5, « hors confort » pour température/humidité, « son fort »), arrondie au pour cent, comparée à la période précédente :
  - « Mieux que la semaine dernière : 4 % du temps en zone mauvaise, contre 11 %. »
  - « Moins bien que la semaine dernière : 11 % du temps hors confort, contre 4 %. »
  - « Comme la semaine dernière : jamais en zone mauvaise. » (ou « 4 % du temps en zone mauvaise »)
  - « Pas assez de mesures la semaine dernière pour comparer. » si la période précédente est mesurée à moins de 10 %.
  - Pourquoi des pourcentages et pas « 2 h de moins » : la semaine en cours n'est pas finie, et une carte débranchée deux jours ferait croire à une amélioration. Les heures restent visibles au survol de la barre.
- **À retenir** : règles, dans cet ordre de priorité ; on garde les 3 premières qui s'appliquent.
  1. *Habitude CO₂* : pour chaque heure de la journée, nombre de jours où la moyenne de cette heure est en zone mauvaise (≥ 1 200 ppm). L'heure qui revient le plus, si elle revient au moins 3 jours et au moins un jour mesuré sur deux : « Le CO₂ dépasse 1 200 ppm presque chaque soir vers 22 h : aère avant de dormir. » (« presque chaque » si ≥ 80 % des jours, sinon « souvent … le soir »). Moment : nuit 0–5 h, matin 6–11 h, après-midi 12–17 h, soir 18–23 h. Conseil : 21 h–5 h « aère avant de dormir », 6–9 h « aère dès le réveil », sinon « aère un peu avant ». Sans habitude en zone mauvaise, même règle avec la zone « aérer » (800 ppm) et le conseil « pense à aérer un peu avant ».
  2. *Confort* : la pire des quatre sorties de confort (froid, chaud, sec, humide) si elle dépasse 25 % du temps mesuré : « Il a fait trop froid 32 % du temps (moins de 19 °C) : monte un peu le chauffage. » ; « … trop chaud … (plus de 24 °C) : baisse le chauffage ou ferme les volets côté soleil. » ; « L'air a été trop sec … (moins de 40 %) : aère moins longtemps ou utilise un humidificateur. » ; « … trop humide … (plus de 60 %) : aère 10 minutes après la douche ou la cuisine. » Les nombres viennent des bandes partagées.
  3. *Pire moment* : la tranche la plus haute en CO₂ ou PM2.5 si elle est hors zone bonne (la mesure qui a passé le plus de temps en zone mauvaise, à défaut la plus haute par rapport à son seuil) : « Pire moment : 1 850 ppm de CO₂ le jeudi 20 novembre vers 22 h. »
  4. *Trous* : s'il manque au moins 2 h et plus de 10 % de la période : « Pas de mesure pendant 1 j 4 h : vérifie que la carte reste branchée et connectée. »
  5. *Alertes* : « 3 alertes cette semaine (CO₂ élevé ×2, Air trop sec), contre 5 la semaine dernière. » ou « Aucune alerte cette semaine. »
  - S'il reste une seule phrase et que l'air a été bon : on ajoute « Rien d'autre à signaler : continue comme ça. »
  - Tutoiement, phrases courtes, même ton que les `advice` de `server/src/alerts.ts`.

### API

`GET /api/v1/devices/:id/report?from&to[&prev_from][&kind][&tz]` (session admin).

- `from`, `to` : secondes, période [from, to). `to - from` ≤ 32 jours.
- `prev_from` : début de la période précédente, qui va de `prev_from` à `from`. Défaut : `from - (to - from)`.
- `kind` : `week` | `month` | `custom` (défaut), ne change que les mots (« semaine », « mois », « période »).
- `tz` : fuseau IANA ; défaut : celui du serveur. Un fuseau inconnu → 400.
- Réponse `DeviceReport` (types dans `server/src/types.ts`) : bornes, `in_progress`, temps écoulé et mesuré, `verdict { tone, head, rest }`, `air` (temps bon / aérer / mauvais, période et précédente), `metrics[]` (par mesure : temps par zone, moyenne, min, max, mêmes chiffres pour la période précédente, `comparison { trend, text }`), `heatmap` (CO₂, 7 × 24, `by: "day" | "weekday"`), `alerts` (nombre et détail par type, période et précédente), `takeaways[]`.
- Pour comparer les pièces plus tard : il suffira d'appeler la même route par carte (ou d'ajouter une route qui boucle sur les cartes avec `buildReport`), sans toucher au calcul.

### Web

- Ordinateur : onglet `#/bilan` entre Mesures et Alertes (`routes.ts`, colonne de gauche). Page `web/src/pages/report/`.
- Téléphone : 5ᵉ onglet « Bilan » dans la barre du bas (icône en ligne, même style), route `#/bilan` (la même des deux côtés, comme `#/infos`). Même composant, en une colonne ; la carte de chaleur garde ses 24 colonnes (cases d'environ 12 px), les heures sont marquées toutes les 6 h.
- La période en cours se recharge toutes les 5 minutes ; une période passée une seule fois.
- Le calcul des bornes (lundi local, mois, décalages ‹ ›, libellés) est dans un module pur testé (`web/src/pages/report/period.ts`).

### Style

- Même direction « instrument » : filets 1 px, police mono, pas de cartes ni d'ombre. Barres plates à angles droits, hauteur ~14 px, les segments séparés par 1 px de fond.
- Carte de chaleur : cases pleines, « mauvais » en couleur pleine, « aérer » un peu atténué, « bon » nettement atténué (`color-mix` avec le fond) : les heures à problème ressortent d'elles-mêmes, un mur de vert ne crie pas. Case sans mesure = contour `--rule` ; heure à venir (période en cours) = rien du tout. Vu dans la maquette : des cases toutes en couleur pleine donnaient un bloc illisible.
- Verdict ~28 px sur ordinateur, ~22 px sur téléphone, en graisse 400 ; seul le début (« Bonne semaine ») est en couleur et en 500.
- Les textes générés mettent une espace insécable avant « % », « h », « ppm », etc. (sinon « 21 / h » se coupe sur téléphone).
- Sur grand écran, la carte de chaleur et « À retenir » sont côte à côte (≈ 3/5 – 2/5) ; en dessous de ~1100 px, l'un sous l'autre.
- Les comparaisons portent un signe en plus de la couleur : « ▼ mieux », « ▲ moins bien », « = pareil ».

## Laissé au constructeur

- Disposition exacte sur grand écran (carte de chaleur et « À retenir » côte à côte au-delà d'une largeur).
- États de chargement (squelette plat) et d'erreur.
- Allongement du script de démo pour avoir plusieurs semaines de mesures (le bilan de la semaine précédente serait vide sinon).
