# Accès pour un agent IA (Hermes)

Date : 2026-11-24 · Portée : `server/` (clés d'API, webhook sortant, serveur MCP) et `web/` (deux sections de réglage) · Trois PR, une branche chacune

## Intention

L'auteur fait tourner chez lui un **agent [Hermes](https://hermes-agent.nousresearch.com/docs)** (Nous Research) et veut le brancher sur AQA pour deux usages :

1. **Être prévenu** : quand une règle d'alerte se déclenche (ou se termine), AQA prévient l'agent, qui peut le dire à sa façon (message, résumé, réaction).
2. **Faire un rapport le soir** : l'agent récupère les données de la journée et en tire un compte rendu.

L'agent doit aussi pouvoir **régler lui-même le webhook** qui le prévient.

Ce qu'Hermes sait faire, et sur quoi on s'appuie :

- **Webhooks entrants** : chaque route est servie sur `/webhooks/<nom>` par sa gateway (port 8644 par défaut), avec un secret HMAC par route et un gabarit de prompt qui pioche dans le JSON reçu (`{alert.label}`).
- **Client MCP** : il se connecte à un serveur MCP HTTP et expose ses outils à l'agent.
- **Cron intégré** : `hermes cron create "0 21 * * *" …` pour la tâche du soir.

**Déploiement** : AQA et Hermes tournent dans **deux conteneurs LXC Proxmox** chez l'auteur. Les deux passent par l'extérieur : AQA est publié derrière Cloudflare (`PUBLIC_URL`, voir `DEVELOPERS.md`), et le webhook vers Hermes **sort sur Internet puis revient** par l'adresse publique d'Hermes. De même, Hermes joint MCP par `<PUBLIC_URL>/mcp`. Conséquence : les deux points d'entrée (`/webhooks/…` côté Hermes, `/mcp` côté AQA) sont publics et doivent être authentifiés.

Aujourd'hui, l'API d'AQA n'accepte que le cookie de session de l'admin (`requireAdmin`, JWT) : un agent n'a pas de moyen propre de s'authentifier. `Notifier.publish()` (`server/src/notify.ts`) a été conçu comme point d'envoi unique « réutilisable par un futur webhook générique », et les événements d'alerte (`AlertEvent`) sont remis après le `COMMIT` du tick : le webhook s'y branche au même endroit que ntfy.

## Objectifs

- **Clés d'API** : créer, nommer, lister et révoquer des clés depuis l'interface ; une clé ne s'affiche qu'une fois.
- Une clé donne accès en **lecture** à tout ce que l'interface montre (pièces, mesures, historique, bilan, alertes, règles) et au **réglage du webhook**.
- **Webhook sortant** : un POST JSON signé à chaque ouverture d'alerte et (si voulu) à chaque fin, au format attendu par une route webhook Hermes.
- **Serveur MCP** dans AQA (`/mcp`), protégé par clé, avec quelques outils typés qui couvrent les deux usages sans que l'agent ait à connaître l'API REST.
- Une courte doc « brancher Hermes » (MCP, route webhook, cron du soir).

## Non-objectifs

- Plusieurs webhooks, abonnement par type d'alerte ou par pièce : un seul webhook, comme ntfy.
- File d'attente, renvois, rattrapage des webhooks manqués : si Hermes est éteint, l'événement est perdu ; l'agent peut relire le journal via MCP.
- Rapport du soir **poussé** par AQA (planificateur côté serveur) : c'est le cron d'Hermes qui vient le chercher.
- OAuth pour MCP, droits par clé (toutes les clés ont le même périmètre).
- Pilotage des cartes par l'agent : commandes, OTA, Wi-Fi, firmware, ajout ou suppression de carte, renommage, calibration.
- Modification des règles d'alerte par l'agent (seuils, activation).
- Réglage depuis le téléphone : les deux nouvelles sections sont sur ordinateur seulement, comme ntfy.

## Anti-objectifs (échec même si « ça marche »)

- Un webhook lent ou injoignable qui **retarde ou casse la détection** des alertes, ou ntfy (et inversement).
- Une clé d'agent qui permet d'envoyer une commande à une carte, de pousser un firmware ou de créer d'autres clés.
- Une clé stockée en clair, ou réaffichée après sa création ; une clé fuitée qu'on ne peut pas révoquer.
- Le secret du webhook renvoyé au navigateur ou à l'agent.
- Une clé fuitée qui sert à **sonder le réseau** de l'hôte AQA (quels hôtes et ports répondent) via les résultats du webhook.
- Un webhook envoyé sans signature vers une route Hermes publique.
- Un outil MCP qui renvoie des milliers de mesures brutes et noie le contexte de l'agent.
- Un webhook « retour à la normale » quand c'est l'utilisateur qui a **désactivé la règle**.
- Une réponse du serveur distant (URL libre) recopiée telle quelle dans l'interface.

## Contraintes

- Pile existante : Fastify 5, `node:sqlite` (migrations dans `server/src/db.ts`), zod 4, React 19, Vitest, Node ≥ 24 (`fetch`, `AbortSignal.timeout`, `crypto` natifs).
- Seule dépendance ajoutée : **`@modelcontextprotocol/sdk`** (PR 3).
- `server/src/types.ts` reste sans code d'exécution.
- Textes de l'interface et des messages en français, tutoiement. Style « instrument » (`2026-11-20-refonte-ui-design.md`).
- Une PR = une chose, une branche par PR, PR de code vers `DEV`.

## Approches envisagées

| | Ce que c'est | Pour | Contre |
|---|---|---|---|
| A. Clés + webhook (REST pur) | L'agent appelle l'API REST avec `curl` et une clé ; AQA envoie un webhook signé | Le moins de code côté AQA | L'agent doit apprendre l'API par un texte : timestamps, fuseau, paramètres, erreurs probables |
| **B. Clés + webhook + serveur MCP** *(retenue)* | A, plus un point `/mcp` avec des outils typés qui réutilisent le code existant | Hermes découvre les outils tout seul, ne peut pas fabriquer d'appel invalide, reçoit des réponses taillées pour lui | Une dépendance et une couche fine en plus |
| C. AQA pousse tout | Webhooks d'alerte + webhook « bilan du jour » à heure fixe, pas de clé | Le plus simple | L'agent ne peut ni interroger ni régler le webhook : ne couvre pas la demande |

**Choix de l'auteur : B.**

## Conception

### Découpage

| PR | Branche | Contenu | Dépend de |
|---|---|---|---|
| 1 | `feat-cles-api` | Table `api_keys`, authentification par clé sur les routes de lecture, section « Clés d'API » | — |
| 2 | `feat-webhook` | Table `webhook`, envoi signé branché sur les alertes, API de réglage (session **et** clé), section « Webhook » | 1 (pour l'accès par clé ; l'envoi seul n'en dépend pas) |
| 3 | `feat-mcp` | Point `/mcp`, outils, doc Hermes | 1 et 2 |

### PR 1 — Clés d'API

**Données (nouvelle migration)**

```sql
CREATE TABLE api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,             -- « Hermes », 1-60 caractères
  prefix       TEXT NOT NULL,             -- 8 premiers caractères après « aqa_ », pour reconnaître la clé
  key_hash     TEXT NOT NULL UNIQUE,      -- sha256(clé), hex
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
```

- Format : `aqa_` + 32 octets aléatoires en base64url (même générateur que `newDeviceToken`). Seul le hash est stocké, comme pour les cartes.
- Révoquer = supprimer la ligne *(choix de Claude : pas d'état « révoquée », rien ne la relit ensuite)*.
- `last_used_at` mis à jour au plus une fois par minute par clé, pour ne pas écrire à chaque requête *(choix de Claude)*.

**Authentification**

- Nouveau garde `requireAdminOrKey` : accepte le cookie de session (comme aujourd'hui) **ou** `Authorization: Bearer aqa_…` dont le hash existe. Comparaison par recherche du hash (pas de comparaison de chaîne en clair).
- Les routes restent sous `requireAdmin` par défaut ; seules celles de la liste ci-dessous passent à `requireAdminOrKey`. Une route oubliée reste donc fermée aux clés, jamais l'inverse.
- Requêtes par clé limitées par `@fastify/rate-limit` (déjà installé) *(valeur au choix du constructeur, de l'ordre de 120/min)*.
- La gestion des clés elle-même (`/api-keys`) reste **session uniquement** : une clé ne peut pas créer d'autres clés.

**Routes ouvertes aux clés** (périmètre *choisi par Claude*, proposé à l'auteur) :

| Route | Pourquoi |
|---|---|
| `GET /api/v1/devices`, `GET /devices/:id` | pièces, état, dernière mesure |
| `GET /devices/:id/frames`, `/frames/aggregate` | historique |
| `GET /devices/:id/report` | bilan |
| `GET /devices/:id/alerts` | journal des alertes |
| `GET /devices/:id/events` | journal de la carte |
| `GET /alert-rules` | seuils en vigueur |
| `GET /webhook`, `PATCH /webhook`, `POST /webhook/test` | réglage du webhook (PR 2) |

Tout le reste (commandes, firmware, création/suppression de carte, jeton, `PATCH` d'une carte ou d'une règle, ntfy, clés) : session uniquement.

**API de gestion (session, sous `/api/v1`)**

- `GET /api-keys` → `{ keys: [{ id, name, prefix, created_at, last_used_at }] }`.
- `POST /api-keys` ← `{ name }` → `{ id, name, prefix, created_at, key }` : la **seule** réponse qui contient la clé.
- `DELETE /api-keys/:id` → 204 ; 404 si inconnue.

**Interface** : section « Clés d'API » dans la page Réglages, au niveau global comme `FirmwareSection` (la page est par carte, mais la section ne l'est pas). Une ligne par clé : nom, `aqa_ab12cd34…`, créée le, dernière utilisation (« jamais », « il y a 3 min »), bouton « Révoquer » avec confirmation. Bouton « Nouvelle clé » → champ nom → la clé s'affiche une fois dans une modale du même modèle que `TokenReveal` (généraliser le composant ou en faire un frère, au choix du constructeur).

### PR 2 — Webhook sortant

**Données (nouvelle migration)**, sur le modèle de la table `notify` :

```sql
CREATE TABLE webhook (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  enabled       INTEGER NOT NULL DEFAULT 0,
  url           TEXT NOT NULL DEFAULT '',
  secret        TEXT,                     -- NULL = pas de signature ; jamais renvoyé par l'API
  notify_close  INTEGER NOT NULL DEFAULT 1,
  last_at       INTEGER,
  last_ok       INTEGER,
  last_error    TEXT
);
INSERT INTO webhook (id) VALUES (1);
```

Le secret est stocké en clair : il sert à signer. Il ne quitte le serveur que sous forme de signature.

**Envoi (`server/src/webhook.ts`)**

- Une classe `Webhook` avec le même contrat que `Notifier` : `send(payload)` ne lève jamais, délai max 5 s, résultat court enregistré comme dernier envoi (`HTTP 401`, `délai dépassé (5 s)`, `injoignable : ECONNREFUSED`). Le corps de la réponse distante n'est **jamais** recopié (l'URL est libre).
- `alerts(events)` applique le réglage : rien si désactivé ou sans URL ; pas de fin si « prévenir à la fin » est décoché ; jamais de fin pour `reason = 'disabled'`.
- Dans `buildApp`, le minuteur passe les mêmes événements aux deux, sans attendre : `void notifier.alerts(ev); void webhook.alerts(ev);`. Un échec de l'un n'a aucun effet sur l'autre.
- `AlertEvent` gagne `device_id` (le webhook en a besoin pour que l'agent rappelle MCP sur la bonne pièce).
- Les textes français de ntfy (`openedMessage`, `closedMessage`) sont réutilisés pour le champ `text` : une seule formulation dans tout le projet.

**Signature** — schéma « generic » d'Hermes (V2) :

- En-têtes `X-Webhook-Timestamp: <secondes unix>` et `X-Webhook-Signature-V2: <HMAC-SHA256(secret, "<timestamp>.<corps>")>`.
- **Secret obligatoire** : la route Hermes est publique. Activer le webhook sans secret → 422 ; le test sans secret → 422.
- ⚠️ **À vérifier par le constructeur** dans la doc ou le code source d'Hermes : encodage exact de la signature (hex ou base64, préfixe éventuel `sha256=`), et s'il faut aussi envoyer l'ancien `X-Webhook-Signature` (V1). Critère : une vraie route Hermes avec secret accepte l'envoi de test.

**Charge utile** (`Content-Type: application/json`) :

```json
{
  "event": "alert.opened",
  "sent_at": 1795190400,
  "text": "CO₂ élevé · Salon\n1 340 ppm depuis 5 min (seuil 1 200 ppm).\nOuvre une fenêtre en grand…",
  "device": { "id": "aqa-24A160B3C8F0", "name": "Salon" },
  "alert": {
    "kind": "co2_high", "label": "CO₂ élevé", "tone": "bad",
    "value": 1340, "threshold": 1200, "unit": "ppm",
    "started_at": 1795190100, "ended_at": null, "duration_s": 300,
    "end_value": null, "advice": "Ouvre une fenêtre en grand 5 à 10 minutes…"
  },
  "url": "https://sensor.devgoblin.fr/#/alertes"
}
```

- `event` : `alert.opened`, `alert.closed` ou `test`. Pour `test`, pas de `device` ni d'`alert`, `text` = celui de `TEST_MESSAGE`.
- `alert.closed` : `ended_at`, `end_value` et `duration_s` (= `ended_at − started_at`) remplis ; `value` = `null`.
- `offline` : `value`, `threshold`, `unit` à `null`.
- `text` = titre + corps du message ntfy équivalent : un gabarit Hermes peut se contenter de `{text}`.

**API (sous `/api/v1`, session ou clé)**

- `GET /webhook` → `{ enabled, url, secret_set, notify_close, last: { at, ok, error } | null }`.
- `PATCH /webhook` ← `{ enabled?, url?, secret?, notify_close? }` (zod strict). `url` : `http(s)`, ≤ 500 caractères. `secret` : chaîne de 16 à 200 caractères = remplacer, `null` = retirer (désactive aussi le webhook), absent = garder. Activer sans URL ou sans secret → 422.
- `POST /webhook/test` → envoie `event: "test"` avec le réglage enregistré (même désactivé), attend (≤ 5 s), renvoie le réglage (dont `last`). Sans URL ou sans secret → 422.
- **Résultat réduit pour les clés** (choix de l'auteur) : quand l'appel vient d'une clé (REST ou MCP), `last.error` n'est jamais le détail. Il vaut `"échec : vérifie l'URL et le secret"` si l'envoi a échoué, `null` sinon. `at` et `ok` restent exacts. Le détail (`HTTP 401`, `injoignable : …`, `délai dépassé`) n'est visible que par la session admin, dans l'interface. L'agent peut donc régler et tester son webhook sans pouvoir cartographier le réseau.

**Interface** : section « Webhook » dans la page Alertes desktop, sous la section ntfy et sur son modèle (`NotifySection`) : interrupteur, URL, secret en écriture seule (« défini » / champ vide + bouton « Générer » qui remplit un secret aléatoire à copier dans Hermes avant d'enregistrer), « prévenir à la fin », « Envoyer un test », dernier envoi.

**Risque restant** : une clé d'agent peut pointer le webhook vers n'importe quelle URL et y faire envoyer des alertes signées. Elle n'y gagne aucune donnée qu'elle ne lit déjà, et le résultat réduit l'empêche de sonder le réseau. Les adresses privées ne sont pas bloquées *(choix de Claude : inutile avec le résultat réduit, et ça fermerait un futur Hermes joint en direct sur le LAN)*.

**Cloudflare côté Hermes** : si l'adresse publique d'Hermes passe par Cloudflare, Bot Fight Mode peut refuser le POST d'AQA (client non navigateur). La doc le signale : règle WAF *Skip* sur le chemin `/webhooks/` d'Hermes.

### PR 3 — Serveur MCP

- Point **`/mcp`**, transport **Streamable HTTP** du SDK officiel, en mode **sans état** (pas de session MCP à garder côté serveur). Authentification : `Authorization: Bearer aqa_…` (même vérification que PR 1 ; 401 sinon). Pas de cookie.
- Branchement dans Fastify au choix du constructeur (typiquement `reply.hijack()` puis `transport.handleRequest(request.raw, reply.raw, request.body)`). `/mcp` doit être exclu du renvoi vers l'app web dans le `setNotFoundHandler`.
- **Cloudflare côté AQA** : Hermes joint `/mcp` par `PUBLIC_URL`. La règle WAF *Skip* décrite dans `DEVELOPERS.md` (aujourd'hui `/api/v1/devices/` et `/firmware/`) doit aussi couvrir `/mcp`, sinon Bot Fight Mode bloque Hermes. Mettre à jour `DEVELOPERS.md` dans cette PR. Les appels REST par clé ne sont pas concernés par la doc Hermes (l'agent passe par MCP).
- **Les outils réutilisent la logique des routes**, sans la dupliquer : les calculs aujourd'hui écrits dans les handlers (`summary`, construction du bilan, lecture du journal) sont sortis en fonctions appelées à la fois par la route REST et par l'outil.
- Noms et descriptions des outils en anglais (ce qu'un modèle lit le mieux), contenus des réponses tels qu'AQA les produit (mots de zone et textes en français) *(choix de Claude)*.
- Désigner une pièce : `room` accepte l'id (`aqa-…`) **ou** le nom, sans tenir compte de la casse. Nom ambigu ou inconnu → erreur d'outil qui liste les pièces existantes.
- Chaque outil renvoie du JSON (contenu `text` contenant le JSON, plus `structuredContent` si le SDK le permet simplement).

| Outil | Entrée | Sortie |
|---|---|---|
| `list_rooms` | — | Pour chaque pièce : id, nom, en ligne, vue il y a, dernière mesure (5 valeurs avec unité et mot de zone), nombre d'alertes en cours |
| `get_day_report` | `room`, `date?` (`YYYY-MM-DD`, défaut aujourd'hui), `tz?` | Le bilan de ce jour local (de minuit à minuit, ou à maintenant si c'est aujourd'hui), comparé à la veille : c'est `buildReport` avec `kind: "custom"`, donc verdict, phrases clés, min/moy/max, temps par zone, alertes |
| `get_report` | `room`, `from`, `to` (`YYYY-MM-DD`), `tz?` | Même chose sur une période (≤ 32 jours, limite existante) |
| `get_history` | `room`, `metric` (`co2`, `pm25`, `temp`, `hum`, `snd`), `from`, `to` (ISO 8601), `points?` (défaut 48, max 200) | Moyennes par tranche, pas choisi parmi `AGGREGATE_STEPS` pour rester sous `points` |
| `list_alerts` | `room?` (toutes si absent), `since?` (ISO 8601, défaut il y a 24 h), `limit?` (défaut 50) | Alertes en cours et terminées : libellé, pièce, début, fin, durée, valeurs |
| `get_alert_rules` | — | Règles actives : libellé, seuil, unité, durée |
| `get_webhook` | — | Réglage du webhook (sans le secret) |
| `set_webhook` | `url?`, `secret?`, `enabled?`, `notify_close?` | Même validation que `PATCH /webhook` |
| `test_webhook` | — | Résultat de l'envoi de test |

- **Fuseau** : `tz` facultatif (nom IANA), par défaut `AQA_TZ` — nouvelle variable de config, défaut `Europe/Paris` *(choix de Claude : le serveur tourne souvent en UTC dans Docker, un « aujourd'hui » en UTC couperait la soirée)*. Les heures renvoyées par les outils sont en ISO 8601 avec décalage dans ce fuseau (l'agent n'a pas à convertir des timestamps unix).
- **Taille** : aucune sortie ne renvoie de mesures brutes ; `get_history` est plafonné à 200 points.

### Doc « Brancher Hermes »

Une section dans `README.md` (ou `DEVELOPERS.md`, au choix du constructeur) avec :

1. Créer une clé dans Réglages → Clés d'API.
2. Déclarer AQA comme serveur MCP HTTP dans la config Hermes (`<PUBLIC_URL>/mcp`, en-tête `Authorization: Bearer aqa_…`).
3. Créer une route webhook Hermes (`hermes webhook subscribe …` avec un secret et un prompt du genre « Une alerte qualité d'air vient de changer : {text}. Préviens-moi. »), puis régler le webhook AQA sur l'**adresse publique** de cette route (`https://<hermes-public>/webhooks/<route>`) avec le même secret, dans l'interface ou en le demandant à l'agent. Signaler la règle Cloudflare *Skip* côté Hermes si son adresse passe par Cloudflare.
4. Un cron Hermes du soir : « Appelle `get_day_report` pour chaque pièce de `list_rooms` et envoie-moi un compte rendu court. »

Syntaxe exacte des commandes Hermes à vérifier sur la doc officielle au moment de l'écrire.

## Tests attendus

- **PR 1** : une clé valide lit `GET /devices` ; une clé inconnue → 401 ; une clé valide sur `POST /devices/:id/commands`, `POST /firmware`, `POST /api-keys`, `PATCH /alert-rules/:kind` → 401 ; la clé n'apparaît que dans la réponse de création ; révocation → 401 ensuite ; `last_used_at` mis à jour.
- **PR 2** : charge utile et en-têtes de signature vérifiés contre un calcul HMAC indépendant ; pas de fin pour `disabled` ; un webhook qui ne répond pas ne retarde pas ntfy ; un serveur qui renvoie 500 avec un corps → `last_error` = `HTTP 500` sans le corps ; secret jamais présent dans `GET /webhook` ; activer ou tester sans secret → 422 ; après un échec, `GET /webhook` par clé renvoie l'erreur générique, par session le détail.
- **PR 3** : sans clé → 401 ; `tools/list` renvoie les 9 outils ; `get_day_report` sur des données semées renvoie le même bilan que la route REST pour la même période ; `room` par nom insensible à la casse ; nom inconnu → erreur listant les pièces ; `get_history` ne dépasse jamais `points`.
- **Bout en bout (manuel)** : depuis le LXC AQA, un webhook de test passe par l'extérieur et arrive sur la vraie route Hermes (signature acceptée) ; Hermes appelle `list_rooms` par `PUBLIC_URL/mcp` à travers Cloudflare. L'auteur fournira les routes.

## Laissé au constructeur

- Intégration exacte du SDK MCP dans Fastify, version du SDK.
- Limite de débit par clé.
- Généraliser `TokenReveal` ou en faire un composant voisin.
- Emplacement de la doc Hermes.
- Format exact de la signature Hermes (à vérifier, voir plus haut).
