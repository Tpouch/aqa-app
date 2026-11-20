# AQA app

Serveur et interface web des capteurs de qualité de l'air AQA (ESP32). Les
cartes envoient leurs mesures en HTTPS. L'app les stocke, trace les graphes sur
des heures ou des semaines, et envoie des commandes aux cartes (redémarrage,
géohash, config, mise à jour OTA signée).

Le contrat entre la carte et le serveur est décrit dans le repo firmware, dans
[`EPITECH_ESP32/docs/api.md`](https://github.com/Tpouch/EPITECH_ESP32/blob/main/docs/api.md).
Ce serveur l'implémente à la lettre.

| | |
|---|---|
| `server/` | Fastify 5 + TypeScript, SQLite intégré à Node (`node:sqlite`), zod |
| `web/` | React 19 + Vite, graphes [uPlot](https://github.com/leeoniya/uPlot) |
| Déploiement | Docker Compose, une seule image (l'API sert aussi le front), Cloudflare Tunnel en option |

## Développement

Node ≥ 24 (Node 26 recommandé).

```bash
npm install
cp .env.example .env          # remplir ADMIN_PASSWORD et SESSION_SECRET
npm run dev                   # API sur :3000, front Vite sur :5173 (proxy /api)
npm test                      # tests du serveur (contrat carte + routes app)
npm run typecheck
npm run build                 # web/dist + server/dist ; `npm start` sert le tout sur :3000
```

Pour tester avec une vraie carte en local, mets dans son `.env` :
`API_URL=http://<IP de ton PC>:3000` et le `DEVICE_TOKEN` donné par l'app
(voir « Ajouter une carte »).

## Déploiement (VPS + Docker Compose)

```bash
git clone git@github.com:Tpouch/aqa-app.git && cd aqa-app
cp .env.example .env && nano .env
mkdir -p data && sudo chown 1000:1000 data   # le conteneur tourne en utilisateur "node" (uid 1000)
docker compose up -d --build
docker compose logs -f app
```

L'app écoute sur `127.0.0.1:3000` du VPS. Les données (SQLite et firmwares)
sont dans `./data` : c'est ce dossier qu'il faut sauvegarder.

Pour exposer `sensor.devgoblin.fr`, il y a deux options.

**A. Cloudflare Tunnel (recommandé).** Aucun port ouvert et aucun certificat à
gérer sur le VPS, ce qui règle aussi l'erreur 525 actuelle.

1. Cloudflare Zero Trust → Networks → Tunnels → créer un tunnel, copier le token.
2. Dans le tunnel, ajouter un « Public hostname » : `sensor.devgoblin.fr` → `http://app:3000`.
3. Dans `.env` : `TUNNEL_TOKEN=...`
4. `COMPOSE_PROFILES=tunnel docker compose up -d --build`

**B. Reverse proxy (Caddy ou Nginx)** sur le VPS, vers `127.0.0.1:3000`, avec
un certificat d'origine Cloudflare et le mode SSL **Full (strict)**.

**Dans les deux cas, côté Cloudflare :** ajoute une règle WAF *Skip* (Bot
Fight Mode, Browser Integrity Check, challenges) pour
`starts_with(http.request.uri.path, "/api/v1/devices/") or starts_with(http.request.uri.path, "/firmware/")`.
Sans elle, l'ESP32 reçoit des 403 en HTML au lieu de l'API.

## Ajouter une carte

1. Flashe la carte, puis relève son identifiant `aqa-XXXXXXXXXXXX`. Il est
   affiché au démarrage dans le log série, et dans le TUI `tools/aqa_tui.py`.
   Une carte qui appelle l'API sans être enregistrée apparaît aussi
   automatiquement dans **Gestion**.
2. **Gestion → Ajouter une carte.** L'app affiche un jeton **une seule fois**.
3. Dans le `.env` du firmware : `DEVICE_TOKEN=<jeton>` (et
   `API_URL=https://sensor.devgoblin.fr`), puis recompile et flashe.

La base ne garde qu'un hash du jeton. Si tu le perds, utilise
**nouveau jeton** et reflashe la carte.

## Mise à jour OTA

1. Dans le repo firmware : `pio run`, puis `tools/sign_firmware.sh`.
2. **Gestion → Firmwares :** envoie `firmware.bin`, `firmware.sig` et un numéro de version.
3. Page du capteur → **Mise à jour OTA** → choisis la version.

Le firmware compilé contient le Wi-Fi et le `DEVICE_TOKEN` du `.env` : compile
une image **par carte**. L'app ne le rend jamais public. La carte le télécharge
par un lien signé (HMAC) valable 24 h, et vérifie la signature RSA avant de
l'activer.

## Configuration

| Variable | Défaut | |
|---|---|---|
| `ADMIN_PASSWORD` | — | Mot de passe de l'interface, ≥ 12 caractères |
| `SESSION_SECRET` | — | ≥ 32 caractères, signe les cookies et les liens firmware |
| `PUBLIC_URL` | `https://sensor.devgoblin.fr` | Base des liens OTA envoyés aux cartes |
| `RETENTION_DAYS` | `0` | Supprime les mesures plus vieilles (0 = jamais) |
| `DATA_DIR` | `./data` (`/data` en Docker) | SQLite et firmwares |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | |
| `TRUST_PROXY` | `true` | IP client prise dans `X-Forwarded-For` (Cloudflare) |
| `LOG_LEVEL` | `info` | |
| `TUNNEL_TOKEN` | — | Uniquement avec le profil `tunnel` |

## Routes

Les routes de la carte suivent `docs/api.md` : `POST /api/v1/devices/{id}/status`,
`/frames`, `/commands/{cid}/ack`, authentifiées par jeton Bearer. Les routes de
l'app exigent le cookie de session admin :

| | |
|---|---|
| `POST/GET/DELETE /api/v1/session` | Connexion (5 essais par minute), état, déconnexion |
| `GET/POST /api/v1/devices` | Liste (+ cartes inconnues), ajout → jeton |
| `GET/PATCH/DELETE /api/v1/devices/{id}` | Détail, renommer, supprimer (avec les mesures) |
| `POST /api/v1/devices/{id}/token` | Nouveau jeton |
| `GET /api/v1/devices/{id}/frames?from&to&limit` | Mesures brutes |
| `GET /api/v1/devices/{id}/frames/aggregate?from&to&step` | Moyennes (`step` : 60, 300, 900, 3600, 10800, 21600, 86400) |
| `GET/POST /api/v1/devices/{id}/commands`, `DELETE …/{cid}` | Historique, envoi, annulation (si `pending`) |
| `GET/POST /api/v1/firmware`, `DELETE …/{version}` | Firmwares (upload multipart : `version`, `firmware`, `signature`) |
| `GET /firmware/{version}/firmware.bin\|sig?exp&sig` | Téléchargement par la carte, lien signé |
| `GET /healthz` | Santé |
