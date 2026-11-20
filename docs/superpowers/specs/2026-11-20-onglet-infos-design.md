# Onglet Infos

Date : 2026-11-20 · Portée : `web/` uniquement

## Intention

On ouvre l'app sans forcément savoir ce que veut dire « 1 200 ppm » ou « PM2.5 ». L'auteur veut une page qui explique **chaque mesure** : ce qu'elle indique, ses **zones et leurs seuils**, et quoi faire quand ça sort du bon côté.

## Approches

- **Nouvel onglet « Infos »** (retenu par l'auteur) : une page lue d'une traite, une section par mesure.
- Aide contextuelle (« ? » à côté de chaque mesure) : écartée, plus dispersée et plus de fichiers touchés.

## Objectifs

- Un 4e onglet **Infos** (`#/infos`), en dernier dans la navigation.
- Une courte intro : chaque valeur tombe dans une zone, chaque zone a un mot et une couleur.
- Une section par mesure, dans l'ordre de la colonne de gauche (`METRICS`) :
  - ce que c'est et pourquoi ça compte (2-3 phrases, ton du README) ;
  - un tableau des zones : mot, plage (« moins de 800 ppm », « 800 à 1 200 ppm », « plus de 1 200 ppm »), couleur de zone doublée du mot ;
  - quoi faire quand ça sort de la bonne zone (action concrète : « ouvre la fenêtre 5 à 10 minutes ») ;
  - **à partir de quand ça devient dangereux, et pourquoi** (demande de l'auteur) : un paragraphe « Danger » qui distingue « inconfortable » (nos zones) de « mauvais pour la santé », avec des repères chiffrés et leur source. Repères retenus *(choix de Claude, sources reconnues uniquement)* :
    - CO₂ : dehors ≈ 420 ppm ; dès ≈ 1 000 ppm, fatigue, maux de tête, concentration en baisse (air mal renouvelé, qui accumule aussi virus et polluants) ; 5 000 ppm = valeur limite d'exposition professionnelle sur 8 h (INRS) ; au-delà de quelques % (dizaines de milliers de ppm), danger direct. Le CO₂ lui-même est surtout un indicateur d'air confiné aux niveaux d'une pièce.
    - PM2.5 : pas de seuil sans effet ; OMS 2021 : 15 µg/m³ en moyenne sur 24 h, 5 µg/m³ en moyenne annuelle. Elles pénètrent jusqu'aux alvéoles et au sang (maladies respiratoires et cardiovasculaires). Un pic bref (cuisson, bougie) compte moins qu'une exposition qui dure.
    - Température : OMS : au moins 18 °C chez soi par temps froid ; en dessous de 16 °C, risques respiratoires accrus ; au-dessus de ≈ 28 °C, sommeil perturbé et déshydratation, surtout pour personnes âgées, bébés, malades.
    - Humidité : sous 30 %, muqueuses et yeux irrités, virus qui circulent mieux ; au-dessus de 60 % de façon durable, acariens et moisissures (allergies, asthme).
    - Son : risque pour l'audition à partir de 80-85 dB(A) sur une journée de travail (directive européenne 2003/10/CE) ; chaque +3 dB divise par deux la durée supportable. Rappeler que nos dB sont **estimés**, pas ceux d'un sonomètre.
  - Ton : informer sans alarmer, aucune promesse médicale.
- Les seuils sont **générés depuis `metricDef` (`web/src/metrics.ts`)**, jamais recopiés à la main : ils ne peuvent pas diverger des graphiques.
- Son : expliquer la différence amplitude brute / dB estimés. Les zones affichées sont celles en dB ; si la carte sélectionnée n'est pas calibrée, une ligne le dit et renvoie vers Réglages.

## Non-objectifs

- Rendre les zones réglables.
- Expliquer les alertes (onglet Alertes en cours sur une autre branche) ; au plus une phrase disant que les zones de couleur sont fixes et distinctes des seuils d'alerte, à ajouter quand l'onglet Alertes existera.
- Mesures en direct sur cette page.

## Anti-objectifs

- Des seuils écrits en dur dans la page qui divergent de `metrics.ts`.
- Casser le style « instrument » (une police mono, filets 1px, couleur réservée aux zones, chaque couleur doublée d'un mot).
- Du jargon non expliqué (ppm, µg/m³, dB).

## Comment (choix de Claude)

- `web/src/routes.ts` : ajout de `infos` à `Tab`, `TAB_LABEL`, `TAB_ORDER`, `ALIASES` ; test de route ajouté.
- `web/src/pages/infos/InfosPage.tsx` : la page. Textes par mesure dans un objet `METRIC_INFO` à côté.
- Fonction pure `bandRanges(def)` dans `metrics.ts` qui produit les libellés de plage (bornes inclusives gérées, nombres au format français), testée.
- La page s'affiche aussi quand aucune carte n'est sélectionnée (elle n'en dépend pas, sauf pour la note de calibration du son).
- Conflit attendu avec la branche Alertes sur `routes.ts` et la navigation : petit, à résoudre à la fusion.

## Laissé au builder

- Mise en page exacte des sections (réutiliser les classes existantes : `label-caps`, `muted`, `tone-*`).
