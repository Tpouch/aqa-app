# Onglet Alertes

Date : 2026-11-20 · Portée : `server/` (règles, détection, journal, API) et `web/` (nouvel onglet)

## Intention

Aujourd'hui l'app montre l'air en continu, mais il faut la regarder pour savoir qu'il faut aérer. L'auteur veut un onglet **Alertes** :

- un **journal des alertes** (quand, quoi, combien de temps, comment ça s'est terminé) ;
- un **conseil concret** avec chaque alerte (« ouvre la fenêtre en grand 5 à 10 minutes ») ;
- des **règles proposées par l'app** que l'utilisateur peut régler.

Plus tard, les alertes partiront vers des **webhooks**. Ce n'est pas dans cette version, mais la conception doit leur laisser une place évidente.

Maquette validée dans le compagnon visuel : `.superpowers/brainstorm/381780-1795212962/content/alertes-layout.html`, **option B** (non commitée).

## Objectifs

- Une alerte se déclenche **même si personne n'a l'app ouverte** (détection côté serveur).
- Pas de spam : une alerte ne s'ouvre que si le dépassement **dure**, et se ferme quand la valeur revient à la normale. Une alerte = une ligne de journal avec un début et une fin.
- Chaque alerte affiche un conseil adapté à son type.
- L'utilisateur peut activer/désactiver chaque règle et changer son **seuil** et sa **durée**.

## Non-objectifs

- Webhooks, e-mail, notifications push : plus tard.
- Règles libres (créer une règle de zéro, plages horaires, jours de la semaine) : l'auteur a confirmé que le besoin est « changer le seuil ou la durée d'une règle proposée ».
- Règles différentes par carte.
- Accuser réception / « mettre en sourdine » une alerte.
- Toute modification du firmware.

## Anti-objectifs (échec même si « ça marche »)

- Une alerte toutes les 15 s quand la valeur oscille autour du seuil.
- Des alertes « fantômes » déclenchées par les mesures en retard qu'une carte renvoie après une coupure.
- Un conseil générique (« la qualité de l'air est dégradée ») au lieu d'une action concrète.
- Casser le style « instrument » de la refonte UI (voir `2026-11-20-refonte-ui-design.md` : une police mono, filets 1px, couleur réservée aux zones, chaque couleur doublée d'un mot).

## Contraintes

- Pile existante : Fastify + `node:sqlite` (migrations dans `server/src/db.ts`), React 19 + Vite, Vitest.
- UI en français.
- `server/src/types.ts` est importé par le client : il reste sans code d'exécution.
- `npm test` et le build web doivent passer.

## Approches envisagées

1. **Vérification périodique côté serveur, toutes les 30 s** (retenue par l'auteur). Un minuteur parcourt les cartes, regarde leurs mesures récentes et ouvre/ferme les alertes. Un seul mécanisme ; gère naturellement « carte hors ligne » (aucune mesure n'arrive pendant une coupure, donc rien à évaluer à la réception) et ignore les mesures en retard renvoyées après une coupure. Retard maximum 30 s, sans importance pour de l'aération. C'est aussi là que se brancheront les webhooks.
2. Vérification à chaque réception de mesures + minuteur séparé pour « hors ligne » : réaction immédiate, mais deux mécanismes et un tri à faire sur les mesures en retard. Écartée.
3. Vérification dans le navigateur : écartée, rien ne se passe sans app ouverte, incompatible avec les webhooks.

## Conception

### Règles

Liste **fixe**, une ligne par type, communes à toutes les cartes. Pas de bouton « nouvelle règle ».

| Type (`kind`) | Condition | Seuil par défaut | Durée par défaut | Active par défaut |
|---|---|---|---|---|
| `co2_high` | CO₂ > seuil | 1 200 ppm | 5 min | oui |
| `pm25_high` | PM2.5 > seuil | 35 µg/m³ | 5 min | oui |
| `temp_low` | Température < seuil | 19 °C | 30 min | oui |
| `temp_high` | Température > seuil | 24 °C | 30 min | oui |
| `hum_low` | Humidité < seuil | 40 % | 30 min | oui |
| `hum_high` | Humidité > seuil | 60 % | 30 min | oui |
| `snd_high` | Son (dB estimés) > seuil | 70 dB | 2 min | non |
| `offline` | Aucun contact depuis plus que la durée | — | 5 min | oui |

Les seuils par défaut sont les bornes des zones déjà affichées (`web/src/metrics.ts`, README) *(choix de Claude ; les durées aussi)*. `snd_high` est ignorée pour une carte sans calibration du son (impossible de parler en dB) ; l'UI le dit à côté de la règle.

Réglable par règle : actif oui/non, seuil, durée (bornes de saisie raisonnables : durée de 1 à 240 min). Un bouton « valeurs par défaut » remet toutes les règles d'origine (avec confirmation, comme les autres actions risquées).

Modifier une règle s'applique à la prochaine vérification. Les alertes déjà ouvertes gardent le seuil avec lequel elles ont été ouvertes (copié dans l'alerte).

### Détection (toutes les 30 s)

Un module `server/src/alerts.ts` exporte une fonction pure de décision (testable sans minuteur) et une fonction `checkAlerts(db, now)` appelée par un `setInterval(…, 30_000)` démarré dans `buildApp`, sur le modèle du minuteur de rétention existant (`timer.unref()`).

Pour chaque carte et chaque règle active :

- **Ouverture** (règles de mesure) : aucune alerte ouverte de ce type pour cette carte, **et** toutes les valeurs non nulles de la métrique sur la fenêtre `[now − durée, now]` sont au-delà du seuil, **et** la fenêtre est couverte : la mesure la plus récente a moins de 60 s et la plus ancienne de la fenêtre est à moins de 60 s de son début. La fenêtre se base sur `frames.ts`, donc des mesures renvoyées en retard (horodatées dans le passé) ne peuvent pas ouvrir une alerte « maintenant ».
- **Fermeture** (règles de mesure) : il y a des mesures sur les 2 dernières minutes et toutes sont revenues du bon côté du seuil **copié dans l'alerte** (pas celui de la règle actuelle). Une fenêtre vide ne ferme rien. Ce délai fixe de 2 min évite d'ouvrir/fermer en boucle.
- `peak_value` = la pire valeur : le maximum pour les règles `_high`, le minimum pour les `_low`.
- **Carte hors ligne pendant une alerte de mesure** : l'alerte reste ouverte ; elle se fermera quand les mesures reviendront.
- **`offline`** : s'ouvre quand `now − max(devices.last_seen, démarrage du serveur) > durée` ; se ferme au premier contact suivant (vérifiée au tick suivant, donc ≤ 30 s plus tard). Une carte jamais vue (`last_seen` nul) ne déclenche rien. `started_at` = `last_seen`.
  Pourquoi `démarrage du serveur` : après un arrêt du serveur (redéploiement, reboot), le firmware attend jusqu'à 5 min entre deux tentatives (`RETRY_MAX_MS`). Sans ce garde-fou, toutes les cartes passeraient « hors ligne » au redémarrage alors qu'elles allaient bien *(choix de Claude)*. L'heure de démarrage est gardée en mémoire et passée à la fonction de décision.
- Si une règle est **désactivée** pendant qu'une alerte de ce type est ouverte, l'alerte est fermée au tick suivant (fin notée « règle désactivée »).
- Son : la valeur brute `snd` est convertie en dB avec la calibration de la carte, comme côté client.

Ouverture et fermeture passent par deux fonctions uniques (`openAlert`, `closeAlert`) : c'est le point où les webhooks se brancheront.

### Données (nouvelle migration)

```sql
CREATE TABLE alert_rules (
  kind        TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL,
  threshold   REAL,              -- NULL pour offline
  duration_s  INTEGER NOT NULL
);
-- pré-remplie avec les valeurs par défaut

CREATE TABLE alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  threshold   REAL,              -- seuil au moment de l'ouverture
  started_at  INTEGER NOT NULL,  -- début du dépassement (début de la fenêtre), pas l'heure du tick
  ended_at    INTEGER,           -- NULL = en cours
  start_value REAL,
  peak_value  REAL,              -- pire valeur pendant l'alerte, mise à jour à chaque tick
  end_value   REAL,
  end_reason  TEXT               -- 'normal' | 'disabled'
);
CREATE INDEX alerts_device ON alerts(device_id, started_at);
```

Conservation : les alertes sont gardées indéfiniment (volume négligeable) *(choix de Claude)*.

### Conseils

Un texte fixe par type, en français, dans `server/src/alerts.ts`, renvoyé par l'API avec chaque alerte (`advice`). Le serveur le possède pour que les futurs webhooks envoient le même texte. Exemples :

- `co2_high` : « Ouvre une fenêtre en grand 5 à 10 minutes. Si plusieurs personnes sont dans la pièce, laisse aussi la porte ouverte. »
- `pm25_high` : « Cherche la source (cuisson, bougie, fumée) et aère. Si la pollution vient de dehors, garde plutôt les fenêtres fermées. »
- `temp_low` / `temp_high`, `hum_low` / `hum_high`, `snd_high`, `offline` (« Vérifie que la carte est branchée et que le Wi-Fi fonctionne ; la page Carte montre son dernier contact. ») : même ton, à rédiger à l'implémentation.

### API (admin, sous `/api/v1`, même garde que les routes existantes)

- `GET /alert-rules` → `{ rules: AlertRule[] }` (avec les valeurs par défaut pour l'affichage).
- `PATCH /alert-rules/:kind` → `{ enabled?, threshold?, duration_s? }`, validé par zod.
- `POST /alert-rules/reset` → remet les valeurs par défaut.
- `GET /devices/:id/alerts?limit=50&before=<ts>` → `{ open: AlertRow[], history: AlertRow[] }` : toutes les alertes en cours, puis l'historique paginé par date décroissante.
- `GET /devices` : chaque `DeviceSummary` gagne `open_alerts: number` (pour le point rouge sur l'onglet).

Types `AlertKind`, `AlertRule`, `AlertRow` ajoutés à `server/src/types.ts`.

### Interface (option B)

- Nouvel onglet **Alertes**, ordre : Mesures · Alertes · Carte · Réglages (`web/src/routes.ts`, hash `#/alertes`). Un point rouge (avec texte accessible « n alertes en cours ») quand la carte sélectionnée a des alertes ouvertes.
- **Colonne gauche, Règles** : une ligne par règle (case à cocher, libellé, seuil, durée, unité). Cliquer une ligne la déplie pour éditer seuil et durée ; enregistrement par ligne. Bouton « valeurs par défaut » en bas.
- **Colonne droite, Journal** de la carte sélectionnée : d'abord les alertes **en cours** en encadré coloré (zone mauvaise en rouge, à surveiller en ambre, « depuis X min », valeur actuelle tirée de `DeviceSummary.latest`, conseil). La maquette (dossier ignoré par git, comme pour la refonte UI) sert de référence visuelle pour la disposition et la densité. Puis l'historique : date, pastille + mot, libellé, durée, et une ligne discrète « comment ça s'est terminé » (« retour à 640 ppm »). Bouton « plus ancien » pour paginer.
- Couleur par type : `co2_high`, `pm25_high`, `snd_high`, `offline` → rouge ; température et humidité → ambre *(choix de Claude)*.
- Rafraîchissement par `usePoll` comme le reste de l'app (15 s).
- Téléphone : colonnes empilées, **journal d'abord**.
- Accessibilité : la couleur n'est jamais seule (mot + pastille), focus visible, contraste existant.

### Tests

- Serveur : la fonction de décision (ouverture après la durée, pas avant ; pas d'ouverture sur fenêtre trouée ou sur mesures en retard ; fermeture après 2 min de retour ; hors ligne ; règle désactivée) ; routes règles et journal dans `server/test/api.test.ts`.
- Web : routage `#/alertes`.

## Laissé au constructeur

- Rédaction finale des conseils pour chaque type.
- Détail visuel de l'édition d'une règle, dans le style existant (`Field`, `Button`).
- Bornes exactes de validation des seuils par métrique.
