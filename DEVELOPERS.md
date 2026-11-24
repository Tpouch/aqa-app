# Developer guide

Technical documentation for the AQA app. For what the project does, see the
[README](README.md).

The station is an ESP32 board with four sensors (firmware, wiring and build
instructions: [Tpouch/EPITECH_ESP32](https://github.com/Tpouch/EPITECH_ESP32)).
Every 15 seconds it measures the air and sends the readings to this app over
HTTPS. The app stores them, charts them over hours or weeks, and sends commands
back to the boards: restart, geohash, config, Wi-Fi, signed OTA update.

## Getting started

1. **Build the station** by following the
   [EPITECH_ESP32](https://github.com/Tpouch/EPITECH_ESP32) repository.
2. **Deploy this app** on a server with an admin password: one Docker container
   (see [Deployment](#deployment-docker-compose)).
3. **Register the board** in the app: it gives you a secret token to put in the
   firmware's `.env` before you flash it (see [Adding a board](#adding-a-board)).
   Boards already trying to connect show up in the list on their own.

## Security and privacy

- One admin account (`ADMIN_PASSWORD`), with a signed session cookie.
- Each board signs in with its own token; the database keeps only its hash.
- Firmware images are never public: boards download them through signed,
  time-limited links (see [OTA updates](#ota-updates)).
- Nothing leaves the server, except alert notifications when they are turned
  on: they go to the ntfy server chosen in the UI (ntfy.sh by default).

The board ↔ server contract is defined in the firmware repository,
[`EPITECH_ESP32/docs/api.md`](https://github.com/Tpouch/EPITECH_ESP32/blob/main/docs/api.md),
and this server follows it exactly.

| | |
|---|---|
| `server/` | Fastify 5 + TypeScript, SQLite built into Node (`node:sqlite`), zod |
| `web/` | React 19 + Vite, charts with [uPlot](https://github.com/leeoniya/uPlot) |
| Deployment | Docker Compose, a single image (the API also serves the front end) |

## Development

Node ≥ 24 (Node 26 recommended).

```bash
npm install
cp .env.example .env          # fill in ADMIN_PASSWORD and SESSION_SECRET
npm run dev                   # API on :3000, Vite front end on :5173 (proxies /api)
PORT=3100 npm run dev         # API on another port: the front end's proxy follows PORT
npm test                      # server tests (board contract + app routes) and web tests (Vitest)
npm run typecheck
npm run build                 # web/dist + server/dist; `npm start` serves everything on :3000
```

To fill a local database with a demo board and five weeks of fake measurements:

```bash
npx tsx --env-file=.env server/scripts/seed-demo.ts http://localhost:3000
```

To test with a real board on your machine, put
`API_URL=http://<your PC's IP>:3000` and the `DEVICE_TOKEN` given by the app
(see [Adding a board](#adding-a-board)) in the board's `.env`.

## Deployment (Docker Compose)

```bash
git clone git@github.com:Tpouch/aqa-app.git && cd aqa-app
cp .env.example .env && nano .env
docker compose up -d --build
docker compose logs -f app
```

The app is published on every interface of the host, port `3090` (port 3000
inside the container), so a reverse proxy on another machine can reach it at
`http://<host IP>:3090`. Don't forward that port on your router: only the proxy
should face the Internet. The data (SQLite database and firmware images) lives in the named
Docker volume `aqa-data`, mounted on `/data`. Docker creates it with the right
owner (the container runs as user `node`, uid 1000), so there is nothing to
prepare on the server. It persists across redeployments; back it up with:

```bash
docker run --rm -v <project>_aqa-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/aqa-data.tgz -C /data .
```

Don't replace it with a host folder (`./data:/data`) unless that folder is owned
by uid 1000: otherwise the app stops with "Cannot open /data/aqa.sqlite3".

Configuration comes only from environment variables (see
[Configuration](#configuration)). A platform like Coolify asks for them in its UI.
Locally, `docker compose` reads them from `.env`. `ADMIN_PASSWORD` and
`SESSION_SECRET` are required: the deployment stops if they are empty.

### Reverse proxy and Cloudflare

To expose `sensor.devgoblin.fr`, put a reverse proxy (Nginx Proxy Manager,
Caddy…) in front of the app. Give it a certificate (Let's Encrypt or a
Cloudflare origin certificate) and set Cloudflare's SSL mode to **Full
(strict)**. Point it at `http://<host IP>:3090`. If the proxy runs on the same
machine in Docker, you can instead put it on the app's Docker network and
target `app:3000`.

**On Cloudflare**, add a WAF *Skip* rule (Bot Fight Mode, Browser Integrity
Check, challenges) for
`starts_with(http.request.uri.path, "/api/v1/devices/") or starts_with(http.request.uri.path, "/firmware/")`.
Without it, the ESP32 gets HTML 403 pages instead of the API.

## Adding a board

1. Flash the board and note its id, `aqa-XXXXXXXXXXXX`. It is printed in the
   serial log at boot and shown in the firmware repo's TUI (`tools/aqa_tui.py`).
   A board that calls the API before it is registered also appears on its own in
   the app's add-a-board screen.
2. On the add-a-board screen, register the id. The app shows a token **once**.
   The screen opens by itself while no board is registered; afterwards, use
   **+ ajouter une carte** in the left column (`#/ajouter`, desktop only). The
   column also warns when an unregistered board keeps calling the API.
3. In the firmware's `.env`, set `DEVICE_TOKEN=<token>` (and
   `API_URL=https://sensor.devgoblin.fr`), then rebuild and flash.

The database only keeps a hash of the token. If you lose it, use
**Réglages → Zone sensible → Nouveau jeton** and flash the board again.

## OTA updates

1. In the firmware repo, run `pio run`, then `tools/sign_firmware.sh`.
2. **Réglages → Firmwares**: upload `firmware.bin`, `firmware.sig` and a version number.
3. **Carte → Mettre à jour**: pick the version and install.

The compiled firmware contains the Wi-Fi credentials and the `DEVICE_TOKEN`
from its `.env`, so build **one image per board**. The app never makes it
public. The board downloads it through an HMAC-signed link valid for 24 h and
checks the RSA signature before activating it.

The server finds which board an image belongs to by looking for a registered
board's token inside it. **Carte → Mettre à jour** only offers that board's
images, and an `ota` command for another board's image is refused: the board
would come back with the wrong token, be refused by the server and need a
reflash by cable. An image that matches no board (token replaced since the
build) is listed as *aucune carte* and cannot be installed. A version number
already used by one board cannot be reused for another (for example
`2.1.0-chambre` instead of `2.1.0`).

## Sound calibration

The board reports noise as a raw peak-to-peak ADC amplitude (0–4095, averaged
over 15 s), not as decibels. **Réglages → Calibrer le son** stores one reference
point per board on the server: `snd_ref` is the last amplitude received, and
`db_ref` is the level read on a sound meter at the same moment. The client then
shows `dB = db_ref + 20·log10(snd / snd_ref)`. Calibration is refused if the
last measurement is older than 2 minutes. Until a board is calibrated, sound is
shown as a raw amplitude with no zones. The CSV export keeps `snd` and adds
`snd_db` when calibrated.

## Configuration

| Variable | Default | |
|---|---|---|
| `ADMIN_PASSWORD` | — | Web UI password, ≥ 12 characters |
| `SESSION_SECRET` | — | ≥ 32 characters; signs session cookies and firmware links |
| `PUBLIC_URL` | `https://sensor.devgoblin.fr` | Base of the OTA links sent to the boards |
| `RETENTION_DAYS` | `0` | Delete older measurements (0 = never) |
| `DATA_DIR` | `./data` (`/data` in Docker) | SQLite and firmware images |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | In dev, Vite's proxy also follows `PORT` (shell or `.env`) |
| `TRUST_PROXY` | `true` | Client IP taken from `X-Forwarded-For` |
| `LOG_LEVEL` | `info` | |

Alert notifications (ntfy) are not configured here: they are set in the web UI
(**Alertes → Notifications**) and stored in the database.

Generate a `SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Routes

The board routes follow `docs/api.md`: `POST /api/v1/devices/{id}/status`,
`/frames` and `/commands/{cid}/ack`, authenticated with a Bearer token. The app
routes require the admin session cookie:

| | |
|---|---|
| `POST/GET/DELETE /api/v1/session` | Log in (5 attempts per minute), state, log out |
| `GET/POST /api/v1/devices` | List (+ unknown boards), add → token |
| `GET/PATCH/DELETE /api/v1/devices/{id}` | Detail; update `name` and/or `sound_calibration` (`{ snd_ref, db_ref }` or `null`); delete (with its measurements) |
| `POST /api/v1/devices/{id}/token` | New token |
| `GET /api/v1/devices/{id}/frames?from&to&limit` | Raw measurements |
| `GET /api/v1/devices/{id}/frames/aggregate?from&to&step` | Averages (`step`: 60, 300, 900, 3600, 10800, 21600, 86400) |
| `GET /api/v1/devices/{id}/report?from&to[&prev_from][&kind][&tz]` | Report (*Bilan*) of the period [from, to), at most 32 days, compared with [prev_from, from) (default: the same length just before). `kind` = `week`, `month` or `custom` (only changes the wording), `tz` = IANA time zone for the heat map hours (default: the server's) |
| `GET /api/v1/devices/{id}/events` | Journal |
| `GET/POST /api/v1/devices/{id}/commands`, `DELETE …/{cid}` | History, send, cancel (if `pending`) |
| `GET/POST /api/v1/firmware`, `DELETE …/{version}` | Firmware images (multipart upload: `version`, `firmware`, `signature`) |
| `GET /firmware/{version}/firmware.bin\|sig?exp&sig` | Download by the board, signed link |
| `GET /api/v1/alert-rules`, `PATCH …/{kind}`, `POST …/reset` | Alert rules: list, update `enabled` / `threshold` / `duration_s`, restore defaults |
| `GET /api/v1/devices/{id}/alerts?limit&before&before_id` | Alerts of a board: `{ open, history }` |
| `GET/PATCH /api/v1/notify` | ntfy settings: `enabled`, `server`, `topic`, `token` (string = replace, `null` = remove; never returned, only `token_set`), `notify_close`; `last` = last send |
| `POST /api/v1/notify/test` | Send a test notification with the saved settings (even when disabled) and return them with `last` |
| `GET /healthz` | Health check |

## Alert notifications (ntfy)

`server/src/alerts.ts` checks the rules every 30 s. `openAlert` and
`closeAlert` report an event, and `checkAlerts` returns these events after its
SQLite transaction commits. `buildApp` hands them to the `Notifier`
(`server/src/notify.ts`) without waiting, so a slow or unreachable ntfy server
never delays detection, and no notification goes out for a rolled-back
transaction.

`Notifier.publish()` is the only way out: a `POST` of JSON to the root of the
ntfy server (`topic`, `title`, `message`, `priority`, `tags`, `click`), with
`Authorization: Bearer <token>` when a token is set and a 5 s timeout. It never
throws. Each result (success or a short error such as `HTTP 403 : forbidden`)
is logged and stored as the "last send" shown in the UI.

| Event | Title | Priority |
|---|---|---|
| Alert opens | `<label> · <board name>`, body = value, threshold and tip | `high` for red alerts, `default` for amber ones |
| Alert ends (optional) | `Retour à la normale · <board name>`, body = duration | `low` |

Clicking a notification opens `PUBLIC_URL/#/alertes`. An alert closed because
its rule was switched off sends nothing.

## Code structure (front end and shared modules)

| | |
|---|---|
| `server/src/zones.ts` | Zone bands of every measurement: the one definition, imported by the server and the web client |
| `server/src/report.ts`, `reportText.ts` | The Bilan: numbers from one-minute averages, then its sentences (pure, tested; reusable for a weekly notification) |
| `web/src/metrics.ts` | Zone words, dB conversion, y-axis range, period stats (pure, tested) |
| `web/src/components/ZoneChart.tsx` | uPlot chart with named zone bands; cursor synced across charts |
| `web/src/components/Sidebar.tsx` | Left column: live readings (also metric selectors), navigation, theme |
| `web/src/pages/measures/` | Mesures: banner, stats, single chart and grid |
| `web/src/compare.ts` | Comparing two rooms on the single chart: rooms offered (sound only between calibrated boards), both series merged on one time axis, tooltip values, end-of-curve labels (pure, tested). The compared room is kept per browser tab (`sessionStorage`, `aqa-compare`) |
| `web/src/pages/report/` | Bilan: week / month bounds (`period.ts`), page and view, shared with the phone tab |
| `web/src/pages/card/` | Carte: board status, actions, commands in progress, journal |
| `web/src/pages/alerts/` | Alertes: rules, ntfy notifications, journal |
| `web/src/pages/settings/` | Réglages, including sound calibration |
| `web/src/styles.css` | Design tokens (dark default + light) and every style |

Routes are hash-based (`#/mesures`, `#/bilan`, `#/alertes`, `#/carte`, `#/reglages`, `#/infos`). Old links
(`#/overview`, `#/sensor`, `#/commands`, `#/options`, `#/device/<id>/<tab>`)
redirect to the new ones.
