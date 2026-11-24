# Notifications ntfy

Date : 2026-11-24 · Portée : `server/` (réglage, envoi, branchement sur les alertes, API) et `web/` (section dans la page Alertes desktop)

## Intention

Les alertes sont détectées côté serveur toutes les 30 s, mais on ne les voit qu'en ouvrant l'app. L'auteur veut les **recevoir sur son téléphone** avec [ntfy](https://ntfy.sh) : une notification quand une alerte s'ouvre (« CO₂ élevé · Salon »), une autre quand elle se termine.

Il n'a qu'une carte pour l'instant, une deuxième arrivera peut-être : **le nom de la carte figure dans chaque notification**.

La spec des alertes (`2026-11-20-alertes-design.md`) avait prévu ce branchement : `openAlert` / `closeAlert` sont les seuls points d'ouverture et de fermeture.

## Objectifs

- Une notification ntfy à chaque **ouverture** d'alerte, avec la valeur, le seuil et le conseil.
- Une notification discrète à chaque **fin** d'alerte (désactivable), avec sa durée.
- Réglage **dans l'interface** (pas de variable d'environnement) : serveur, sujet, jeton facultatif, activé oui/non, prévenir à la fin oui/non.
- Un bouton **« envoyer un test »** et l'affichage du **dernier envoi** (réussi ou en échec, à quelle heure, pourquoi).
- Un **point d'envoi unique** côté serveur, réutilisable par un futur webhook générique ou un résumé hebdomadaire.

## Non-objectifs

- E-mail, Web Push, webhooks génériques.
- Réglage par carte, mise en sourdine, plages horaires.
- Résumé hebdomadaire par ntfy (viendra après la fusion avec l'onglet Bilan).
- Réglage depuis le téléphone : la page Alertes mobile reste en lecture seule.

## Anti-objectifs (échec même si « ça marche »)

- Un ntfy lent ou injoignable qui **retarde ou casse la détection** des alertes, ou fait échouer la transaction SQLite du tick.
- Une notification pour une alerte qui n'a finalement **pas été enregistrée** (transaction annulée).
- Le jeton d'accès renvoyé en clair au navigateur.
- Une rafale de notifications au redémarrage du serveur sur des données anciennes.
- Une notification « retour à la normale » quand c'est l'utilisateur qui a **désactivé la règle** : rien n'est revenu à la normale.
- Une section bavarde ou colorée qui casse le style « instrument » (`2026-11-20-refonte-ui-design.md`).

## Contraintes

- Pile existante : Fastify 5, `node:sqlite` (migrations dans `server/src/db.ts`), zod, React 19, Vitest. Node ≥ 24 : `fetch` et `AbortSignal.timeout` sont natifs, aucune dépendance ajoutée.
- `server/src/types.ts` reste sans code d'exécution.
- Textes en français, tutoiement.

## Conception

### Données (nouvelle migration)

Une table à une seule ligne, plutôt qu'une table clé/valeur : les champs sont typés et connus *(choix de Claude)*.

```sql
CREATE TABLE notify (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  enabled       INTEGER NOT NULL DEFAULT 0,
  server        TEXT NOT NULL DEFAULT 'https://ntfy.sh',
  topic         TEXT NOT NULL DEFAULT '',
  token         TEXT,                     -- NULL = pas de jeton ; jamais renvoyé par l'API
  notify_close  INTEGER NOT NULL DEFAULT 1,
  last_at       INTEGER,                  -- dernier envoi (alerte ou test)
  last_ok       INTEGER,
  last_error    TEXT
);
INSERT INTO notify (id) VALUES (1);
```

Le jeton est stocké en clair : le serveur doit pouvoir l'envoyer, et la base contient déjà de quoi piloter les cartes. Il ne quitte jamais le serveur autrement que vers ntfy.

### Envoi (`server/src/notify.ts`)

- Un `Notifier` (créé dans `buildApp`) expose **`publish(msg)`**, le point d'envoi unique : `POST <serveur>/` avec le message en JSON (format « publish as JSON » de ntfy : `topic`, `title`, `message`, `priority` 1-5, `tags`, `click`), en-tête `Authorization: Bearer <jeton>` si un jeton est défini.
- Délai maximal **5 s** (`AbortSignal.timeout`). Jamais d'exception vers l'appelant : le résultat (`ok` ou message d'erreur court : `HTTP 403 : forbidden`, `délai dépassé (5 s)`, `injoignable : ENOTFOUND`) est loggé et enregistré comme **dernier envoi**.
- `publish` envoie même si les notifications sont désactivées (c'est ce qui sert au test). **`alerts(events)`** applique le réglage : rien si désactivé ou sans sujet, pas de fin si « prévenir à la fin » est décoché, jamais de fin pour une règle désactivée (`end_reason = 'disabled'`).

### Branchement sur les alertes

- `openAlert` et `closeAlert` ajoutent un **événement** (`opened` / `closed`, carte, type, valeurs, dates) à une liste ; `checkAlerts` la **renvoie après le `COMMIT`**. Le minuteur de `buildApp` passe ces événements à `notifier.alerts()` **sans attendre** la réponse. Ainsi : aucun réseau dans la transaction, aucune notification pour une transaction annulée, aucun retard sur le tick.
- La décision (ouverture, fermeture) ne change pas.

### Contenu des notifications

À l'**ouverture** :

| Champ | Valeur |
|---|---|
| Titre | `<libellé> · <nom de la carte>`, ex. `CO₂ élevé · Salon` |
| Corps | valeur actuelle et seuil, puis le conseil : `1 340 ppm depuis 5 min (seuil 1 200 ppm).` ⏎ `Ouvre une fenêtre en grand…` ; hors ligne : `Aucun contact depuis 6 min.` ⏎ conseil |
| Priorité | `high` (4) si le type est « mauvais » (`tone: bad`), `default` (3) s'il est « à surveiller » (`warn`) |
| Tags | un emoji par type : `window` (CO₂), `fog` (particules), `cold_face` / `hot_face` (température), `desert` / `droplet` (humidité), `loud_sound` (son), `electric_plug` (hors ligne) |
| Click | `PUBLIC_URL/#/alertes` |

« Valeur actuelle » = la dernière mesure de la fenêtre ; la durée = `now − started_at`.

À la **fin** (raison `normal` uniquement) :

| Champ | Valeur |
|---|---|
| Titre | `Retour à la normale · <nom de la carte>` |
| Corps | `CO₂ élevé : terminé après 23 min, retour à 640 ppm.` ; hors ligne : `Carte hors ligne : reconnectée après 12 min.` |
| Priorité | `low` (2) |
| Tags | `white_check_mark` |
| Click | `PUBLIC_URL/#/alertes` |

Le **test** : titre `Test · AQA`, corps `Les notifications fonctionnent. Tes alertes arriveront ici.`, priorité `default`, tag `white_check_mark`.

Nombres au format français, même nombre de décimales que l'app (0 pour CO₂, PM2.5, son ; 1 pour température et humidité). Durées au format du journal de la carte (`23 min`, `1 h 5 min`, `2 j 3 h`). Pas d'heure absolue dans les textes : le fuseau du serveur (souvent UTC en Docker) ne serait pas celui du téléphone.

### Rattrapage au démarrage

Vérifié dans `alerts.ts` : le cas n'existe pas, **rien n'est ajouté**.

- Une alerte de mesure ne s'ouvre que si la mesure la plus récente a **moins de 60 s** : des données anciennes n'ouvrent rien, même après un long arrêt du serveur.
- `offline` compte depuis `max(last_seen, démarrage du serveur)` : un redémarrage ne fait passer aucune carte hors ligne.
- Après une coupure, une carte qui renvoie son retard peut ouvrir plusieurs alertes d'un coup (CO₂ et humidité, par exemple) : elles décrivent l'air **actuel**, les notifier est voulu.

### API (admin, sous `/api/v1`)

- `GET /notify` → `NotifySettings` : `{ enabled, server, topic, token_set, notify_close, last: { at, ok, error } | null }`.
- `PATCH /notify` ← `{ enabled?, server?, topic?, token?, notify_close? }` (zod, strict). `token` : chaîne = remplacer, `null` = retirer, absent = garder. `server` : URL `http(s)`, barre finale retirée. `topic` : `[-_A-Za-z0-9]{1,64}` (règle ntfy) ou vide. Activer sans sujet → 422. Renvoie `NotifySettings`.
- `POST /notify/test` → envoie le message de test avec le réglage enregistré (même désactivé), attend le résultat (≤ 5 s) et renvoie `NotifySettings` (dont `last`). Sans sujet → 422.

Types `NotifySettings` et `NotifyLast` dans `server/src/types.ts`.

### Interface

Dans la page Alertes desktop, colonne de gauche, **sous les règles** : une section **« Notifications »** avec le même titre en capitales et le même filet que « Règles ».

- Case **« Envoyer les alertes sur ntfy »**.
- Champs **Serveur** (`https://ntfy.sh` par défaut), **Sujet** (avec un petit bouton « au hasard » qui propose `aqa-` + 10 caractères), **Jeton d'accès** (facultatif, champ mot de passe ; s'il est défini, le champ est vide avec « jeton enregistré » et un bouton « retirer »).
- Case **« Prévenir aussi quand l'alerte se termine »**.
- Aide courte : abonne-toi au même sujet dans l'app ntfy ; sur `ntfy.sh`, un sujet est public, choisis un nom difficile à deviner.
- Boutons **enregistrer** et **envoyer un test** (le test enregistre d'abord les changements en cours).
- Ligne d'état : `dernier envoi : ● réussi · auj. 14:02` ou `dernier envoi : ▲ échec · auj. 14:02 · HTTP 403 : forbidden` (couleur doublée d'un mot et d'un glyphe), ou `aucun envoi pour l'instant`.

Rien sur mobile.

### Tests

- Serveur (`server/test/notify.test.ts`) : construction des messages (ouverture bad/warn, hors ligne, fin, nom de la carte) ; `publish` contre un vrai petit serveur HTTP local (JSON reçu à la racine, en-tête Bearer, erreur HTTP, délai dépassé) ; `alerts()` respecte activé / fin / `disabled` ; `checkAlerts` renvoie les événements ; un échec d'envoi ne lève rien.
- Routes (`server/test/api.test.ts`) : lecture, mise à jour, jeton jamais renvoyé, validation, test d'envoi.
- Web : formatage de la ligne « dernier envoi » et génération du sujet (Vitest).

## Laissé au constructeur

- Disposition exacte des champs dans la colonne, dans le style de `RuleList`.
- Message d'erreur exact selon les cas réseau.
