# Self-Hosting

Diese Anleitung beschreibt den produktiven Docker-Pfad des Bots in diesem Repo. Gemeint ist nicht die nackte Library unter `src/`, sondern die deploybare App in `examples/control-panel/`.

## Voraussetzungen

- Docker mit `docker compose`
- Git
- ein Discord Self-Token
- optional:
  - ein normaler Discord Bot fuer Commands und Slash-Commands
  - Reverse Proxy und TLS
  - Intel/AMD iGPU oder NVIDIA GPU fuer Hardware-Encoding

## Empfohlene Installation

```bash
git clone https://github.com/Tabsi1998/Discord-Stream-Selfbot.git
cd stream-bot
./install.sh
```

`install.sh`:

1. prueft Docker und Compose
2. fragt Token, erlaubte User-IDs, Commands, Panel-Login, Cookies und Presence-Texte ab
3. schreibt `deploy/.env`
4. legt `deploy/data/selfbot-profiles.tsv` an
5. baut das Docker-Image frisch
6. startet `deploy/docker-compose.yml`

Nach erfolgreicher Installation:

- Panel: `http://localhost:3099`
- Health: `http://localhost:3099/api/health`

## Erster Funktionstest

1. Im Panel einen Kanal speichern
2. Ein Preset anlegen
3. Ueber "Manual Start" oder `$panel start` einen Stream ausloesen
4. Im Dashboard pruefen:
   - Discord ist `ready`
   - ein aktiver Run erscheint
   - Telemetrie aktualisiert sich

## Alltag: Befehle fuer den Betrieb

```bash
./config.sh
./update.sh
./update.sh --fresh
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f
```

- `./config.sh`: aendert `.env` und Zusatz-Selfbots
- `./update.sh`: Standard-Update mit Backups und Rebuild
- `./update.sh --fresh`: Build ohne Docker-Cache, sinnvoll fuer yt-dlp-Updates

## Was persistent gespeichert wird

| Host-Datei / Ordner | Zweck |
| --- | --- |
| `deploy/.env` | Konfiguration |
| `deploy/data/control-panel-state.json` | Kanaele, Presets, Events, Queue, Notification-Settings |
| `deploy/data/control-panel-state.logs.json` | Logs |
| `deploy/data/*.bak` | automatische Backup-Dateien bei State-Schreibvorgaengen |
| `deploy/data/selfbot-profiles.tsv` | Zusatz-Selfbots auf dem Host |
| `deploy/cookies/yt-dlp-cookies.txt` | YouTube-Cookies |
| `deploy/yt-dlp-cache/` | yt-dlp Cache und OAuth2-Tokens |

Wichtig:

- Der State wird ohne externe Datenbank gespeichert.
- Logs liegen absichtlich nicht im Haupt-State, sondern in `*.logs.json`.
- Import/Export im Panel betrifft Kanaele, Presets, Events, Queue und Notification-Settings, nicht deine `.env`.

## Backup und Restore

### Minimal noetig

```bash
cp deploy/.env /pfad/zum/backup/
cp deploy/data/control-panel-state.json /pfad/zum/backup/
cp deploy/data/control-panel-state.logs.json /pfad/zum/backup/
cp deploy/data/selfbot-profiles.tsv /pfad/zum/backup/
cp -r deploy/cookies /pfad/zum/backup/
cp -r deploy/yt-dlp-cache /pfad/zum/backup/
```

### Wiederherstellung

1. Dateien an dieselben Host-Pfade zurueckkopieren
2. Container neu starten:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

## Manuelle Docker-Steuerung

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f
docker compose --env-file deploy/.env -f deploy/docker-compose.yml down
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build --force-recreate
```

## Wichtige Host-Pfade und Container-Mounts

| Host | Container |
| --- | --- |
| `deploy/data` | `/app/examples/control-panel/data` |
| `deploy/cookies` | `/app/examples/control-panel/cookies` |
| `deploy/yt-dlp-cache` | `/root/.cache/yt-dlp` |

Deshalb gilt:

- die Zusatz-Selfbot-Datei liegt auf dem Host unter `deploy/data/selfbot-profiles.tsv`
- OAuth2-Tokens landen persistent unter `deploy/yt-dlp-cache/youtube-oauth2/`

## YouTube: aktueller Betriebsweg

### Standard ohne manuelles Zutun

Per Default nutzt das Projekt:

```bash
YT_DLP_YOUTUBE_EXTRACTOR_ARGS=youtube:player_client=android
```

Das umgeht bereits viele YouTube-Bot-Checks.

### Wenn YouTube trotzdem blockiert

Es gibt zwei reale Pfade im Code:

1. Cookie-Datei
2. OAuth2-Device-Flow

### Cookie-Datei

Möglichkeiten:

- im Panel per Cookie-Upload
- manuell als `deploy/cookies/yt-dlp-cookies.txt`
- per `.env` mit `YT_DLP_COOKIES_FILE=/app/examples/control-panel/cookies/yt-dlp-cookies.txt`
- lokal ausserhalb von Docker optional per `YT_DLP_COOKIES_FROM_BROWSER=edge` oder `chrome:Default`

Der Upload-Endpunkt erwartet Netscape/Mozilla-Format mit Tab-separierten Feldern.

### OAuth2-Device-Flow

Im Panel kann ein OAuth2-Flow gestartet werden. Intern startet das Projekt `yt-dlp` mit dem `yt-dlp-youtube-oauth2` Plugin und speichert das Token im gemounteten Cache unter:

```text
deploy/yt-dlp-cache/youtube-oauth2/token_data.json
```

Der Flow ist fuer Faelle gedacht, in denen Cookies unbequem sind oder haeufig ablaufen.

## Mehrere Selfbots

Der primaere Selfbot kommt aus `deploy/.env`. Zusatz-Selfbots werden aus `deploy/data/selfbot-profiles.tsv` oder einer JSON-Datei geladen.

### TSV-Format

```text
# id	name	token	idle_status_text	stream_status_text	voice_status_text	enabled	command_enabled
backup-1	Backup Bot	TOKEN_HIER	Idle Text	{{title}}	Now streaming: {{title}}	1	0
backup-2	Event Bot	TOKEN_HIER	Idle Text	{{title}}	Now streaming: {{title}}	1	1
```

Spalten:

- `id`: interne ID des Bots
- `name`: Anzeigename im Panel
- `token`: Discord Token
- `idle_status_text`: Idle-Text
- `stream_status_text`: Text waehrend des Streams
- `voice_status_text`: Voice-Status-Template
- `enabled`: `1` oder `0`
- `command_enabled`: `1` oder `0`

### JSON-Alternative

Der Loader akzeptiert auch ein JSON-Array. Nutzbare Felder:

- `id`
- `name`
- `token`
- `enabled`
- `commandEnabled`
- `idlePresenceStatus`
- `idleActivityType`
- `idleActivityText`
- `streamPresenceStatus`
- `streamActivityType`
- `streamActivityText`
- `voiceStatusTemplate`

## Commands und optionaler Control-Bot

Wenn `CONTROL_BOT_TOKEN` gesetzt ist:

- registriert das Projekt Text-Commands ueber einen normalen Bot
- registriert optional guild-spezifische Slash-Commands
- die Selfbots selbst antworten dann nicht mehr auf Chat-Commands

Wichtig:

- `COMMAND_ALLOWED_AUTHOR_IDS` ist fuer normale User relevant
- `CONTROL_BOT_COMMAND_GUILD_IDS` begrenzt die Slash-Registrierung
- wenn keine Guild-IDs gesetzt sind, versucht der Code zuerst die im Panel gespeicherten Guilds abzuleiten
- Slash-Commands werden nie global angelegt

Die komplette Referenz steht in [`COMMANDS.md`](COMMANDS.md).

## Hardware-Encoding

### VAAPI

Compose-Beispiel:

```yaml
services:
  control-panel:
    devices:
      - /dev/dri:/dev/dri
```

Empfohlene `.env`-Werte:

```bash
PREFERRED_HW_ENCODER=vaapi
FFMPEG_VAAPI_DEVICE=/dev/dri/renderD128
```

### NVENC

- `nvidia-container-toolkit` auf dem Host installieren
- GPU fuer Docker freigeben
- optional `PREFERRED_HW_ENCODER=nvenc`

Wenn kein passender Encoder verfuegbar ist, faellt das Projekt automatisch auf Software-Encoding zurueck.

## Sicherheit und Reverse Proxy

Das Panel kann sensible Funktionen ausloesen. Deshalb mindestens eine dieser Optionen setzen:

- `PANEL_AUTH_ENABLED=1` mit Benutzername/Passwort
- Reverse-Proxy-Auth
- beides

Wichtig:

- `/api/health` bleibt absichtlich ohne Panel-Auth erreichbar
- alle anderen API-Routen und die statischen Panel-Dateien liegen hinter der Auth-Middleware

### nginx

```nginx
server {
    listen 443 ssl;
    server_name stream.example.com;

    ssl_certificate     /etc/ssl/certs/stream.pem;
    ssl_certificate_key /etc/ssl/private/stream.key;

    location / {
        proxy_pass http://127.0.0.1:3099;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Caddy

```text
stream.example.com {
    reverse_proxy localhost:3099
}
```

## Monitoring und Fehleranalyse

Praktische Stellen:

- `docker compose ... logs -f`
- Dashboard-Logs
- `GET /api/health`
- `GET /api/stream/health`
- `GET /api/live/state` fuer den Live-State-Stream

Wenn Streams instabil sind, siehe [`PERFORMANCE.md`](PERFORMANCE.md).
