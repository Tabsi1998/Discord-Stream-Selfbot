# Discord Stream Bot

Self-hosted Discord stream stack for video sources via Selfbots, optional control bot, web panel, scheduler, queue, and Docker deployment.

## Wichtiger Hinweis

- Dieses Repo enthaelt einen deploybaren Bot-Pfad und eine wiederverwendbare Streaming-Library.
- Der produktive Bot-/Panel-Pfad liegt in `examples/control-panel/` und wird von `install.sh`, `config.sh` und `update.sh` verwendet.
- Die Root-Ordner `src/` und `dist/` sind die zugrundeliegende Library `@dank074/discord-video-stream`.
- Selfbots koennen gegen die Discord Terms of Service verstossen. Nutzung auf eigene Verantwortung.

## Doku-Navigation

- `README.md`: Einstieg, Architektur, Schnellstart
- [`SELFHOSTING.md`](SELFHOSTING.md): Betrieb, Backups, Docker, Reverse Proxy, GPU
- [`COMMANDS.md`](COMMANDS.md): Text- und Slash-Commands
- [`PERFORMANCE.md`](PERFORMANCE.md): Qualitaetsprofile, Buffering, Hardware-Encoding, Tuning
- [`examples/control-panel/README.md`](examples/control-panel/README.md): technische Doku fuer das deploybare Panel, API und Persistenz

## Was das Projekt heute ist

- Web Panel fuer Kanaele, Presets, Queue, Events, Notifications und Konfig-Import/Export
- primaerer Selfbot plus beliebig viele Zusatz-Selfbots mit eigenen Presence-/Voice-Status-Texten
- optionale Steuerung ueber einen normalen Discord Bot fuer Chat-Commands und guild-spezifische Slash-Commands
- Scheduler mit einmaligen, taeglichen und woechentlichen Events
- Discord Scheduled Event Sync fuer geplante Streams
- yt-dlp, HLS, MPEG-TS/IPTV und direkte Media-URLs
- Queue mit Reorder, Loop und Konfliktregel `queue-first` oder `event-first`
- Live-Status per SSE (`/api/live/state`), Healthcheck, FFmpeg-Telemetrie und URL-Test
- Notification-Regeln fuer Webhooks und optionale Self-DM-Benachrichtigungen
- YouTube-Helfer fuer Cookies und device-flow OAuth2

## Architektur auf einen Blick

```text
repo root
├── src/                         # Streaming-Library
├── examples/control-panel/      # Deploybare App (HTTP + Scheduler + Runtime)
├── deploy/                      # Docker Compose, .env, persistente Host-Daten
├── install.sh                   # Erstinstallation fuer den Bot-Pfad
├── config.sh                    # Konfig- und Selfbot-Pflege
├── update.sh                    # Git-Update + Backups + Rebuild
└── docker/control-panel.Dockerfile
```

Zur Laufzeit sieht das Modell so aus:

1. Der primaere Selfbot kommt aus `deploy/.env`.
2. Zusatz-Selfbots werden aus `deploy/data/selfbot-profiles.tsv` oder einer JSON-Datei geladen.
3. Jeder gespeicherte Stream-Kanal ist genau einem Selfbot zugeordnet.
4. Die Queue laeuft immer auf genau einem ausgewaehlten Selfbot/Kanal/Preset.
5. Geplante Events koennen die Queue je nach Konfliktregel pausieren oder blockiert werden.
6. Optional uebernimmt ein normaler Bot die Command-Eingabe, waehrend die Selfbots weiter streamen.

## Schnellstart

### Voraussetzungen

- Docker mit `docker compose`
- Git
- Discord Self-Token
- optional:
  - `CONTROL_BOT_TOKEN` fuer einen normalen Steuer-Bot
  - `/dev/dri` oder NVIDIA Runtime fuer Hardware-Encoding
  - Reverse Proxy und TLS fuer oeffentliche Bereitstellung

### Installation

```bash
git clone https://github.com/Tabsi1998/Discord-Stream-Selfbot.git
cd stream-bot
./install.sh
```

`install.sh` erledigt den produktiven Bot-Pfad:

- prueft Docker und Compose
- schreibt `deploy/.env`
- legt `deploy/data/selfbot-profiles.tsv` an
- baut das Docker-Image inklusive `yt-dlp[default]` und `yt-dlp-youtube-oauth2`
- startet den Container `discord-stream-selfbot`

Danach:

- Web Panel: `http://localhost:3099`
- Healthcheck: `http://localhost:3099/api/health`

### Erster sinnvoller Test

1. Im Panel mindestens einen Kanal anlegen
2. Ein Preset anlegen
3. Ueber "Manual Start" oder per Command einen Stream starten
4. Im Dashboard pruefen, ob Discord-Status, aktiver Stream und Telemetrie erscheinen

## Tagesgeschaeft

```bash
./config.sh
./update.sh
./update.sh --fresh
```

- `./config.sh` aendert `.env` und Zusatz-Selfbots
- `./update.sh` sichert Konfiguration und State, fuehrt `git pull --ff-only` aus und baut neu
- `./update.sh --fresh` baut ohne Docker-Cache und zieht yt-dlp aggressiver neu

## Was die Scripts wirklich tun

### `install.sh`

- nutzt im Script fest `HOST_PORT=3099` und `PORT=3099`
- fragt den ueblichen Betriebsumfang interaktiv ab
- uebernimmt fortgeschrittene Defaults aus einer bestehenden `.env`, falls vorhanden

### `config.sh`

- bearbeitet `deploy/.env`
- verwaltet Zusatz-Selfbots in `deploy/data/selfbot-profiles.tsv`
- kann die Compose-Umgebung nach Aenderungen neu bauen

### `update.sh`

- stasht auf Wunsch lokale Git-Aenderungen
- sichert:
  - `deploy/.env` nach `deploy/.env.pre-update`
  - `deploy/data/control-panel-state.json` nach `deploy/data/control-panel-state.pre-update.json`
  - Zusatz-Selfbot-Datei nach `*.pre-update`
- fuehrt `git pull --ff-only` aus
- baut und startet den Container neu

## Wichtige Dateien auf dem Host

| Pfad | Zweck |
| --- | --- |
| `deploy/.env` | Laufzeitkonfiguration fuer den Bot-Pfad |
| `deploy/.env.example` | Vorlage mit allen bekannten Variablen |
| `deploy/docker-compose.yml` | Container- und Volume-Definition |
| `deploy/data/control-panel-state.json` | Kanaele, Presets, Events, Queue, Notification-Settings |
| `deploy/data/control-panel-state.logs.json` | separat persistierte Logs |
| `deploy/data/control-panel-state.json.bak` | automatische Backup-Datei beim Speichern |
| `deploy/data/selfbot-profiles.tsv` | Zusatz-Selfbots auf dem Host |
| `deploy/cookies/yt-dlp-cookies.txt` | manuell hinterlegte YouTube-Cookies |
| `deploy/yt-dlp-cache/` | yt-dlp Cache und OAuth2-Tokens |
| `docker/control-panel.Dockerfile` | produktiver Build fuer das Panel |

## Konfiguration

Die vollstaendige Vorlage steht in [`deploy/.env.example`](deploy/.env.example). Fuer den Betrieb sind diese Punkte entscheidend:

- `DISCORD_TOKEN` ist Pflicht.
- `HOST_PORT` und `PORT` werden von `install.sh` fest auf `3099` gesetzt. Manuelle Aenderungen in `deploy/.env` sind moeglich, werden aber nicht interaktiv angeboten.
- `SELFBOT_CONFIG_FILE` ist ein Container-Pfad. Im Standardfall zeigt er auf die vom Host gemountete Datei `deploy/data/selfbot-profiles.tsv`.
- `CONTROL_BOT_TOKEN` aktiviert einen normalen Discord Bot fuer Text- und Slash-Commands.
- `COMMAND_ALLOWED_AUTHOR_IDS` bestimmt, welche User ueber den normalen Bot Commands senden duerfen.
- `IDLE_*`, `STREAM_*` und `VOICE_STATUS_TEMPLATE` steuern Presence und Voice-Status der Selfbots.
- `YT_DLP_YOUTUBE_EXTRACTOR_ARGS` ist standardmaessig `youtube:player_client=android`.
- `PREFERRED_HW_ENCODER` unterstuetzt `auto`, `nvenc` und `vaapi`.
- `NOTIFICATION_WEBHOOK_URL` und `NOTIFICATION_DM_ENABLED` dienen nur als Startwerte, solange im gespeicherten Panel-State noch keine Notification-Einstellungen hinterlegt sind.

## Was das Panel abdeckt

- Dashboard mit Discord-Status, aktiven Streams, Queue, geplantem naechsten Event und Telemetrie
- Channel-Management inklusive Selfbot-Zuordnung und `go-live`/`camera`
- Presets mit Profilen, Buffer-Strategie, Hardware-Beschleunigung und Fallback-Quellen
- manuelle Starts mit optionaler Stoppzeit
- Queue mit Start, Stop, Skip, Clear, Reorder und Loop
- Event-Serien mit Scope `single`, `this-and-following` und `all`
- Notification-Settings inklusive Testversand
- Konfig-Export und -Import
- YouTube-Cookie-Status, Cookie-Upload und OAuth2-Device-Flow

Ein paar wichtige Laufzeitdetails:

- Die Queue ist global als Liste, aber immer genau an einen Selfbot/Kanal/Preset gebunden.
- `queue-first` bedeutet: ein geplantes Event auf demselben Selfbot wird blockiert.
- `event-first` bedeutet: die Queue wird fuer das Event pausiert und danach fortgesetzt.
- Notification-DMs gehen an den verwendeten Selfbot-Account selbst; fuer externe Alarme ist ein Webhook meist sinnvoller.

## Commands

Text-Commands funktionieren ueber Selfbots oder optional ueber einen normalen Bot. Die komplette Referenz steht in [`COMMANDS.md`](COMMANDS.md).

Kurzueberblick:

- Prefix standardmaessig `$panel`
- Zusatz-Prefixe ueber `COMMAND_PREFIX_ALIASES`
- Bot-Mention als Prefix nur beim normalen Control-Bot
- Slash-Commands nur guild-spezifisch, nie global
- sobald `CONTROL_BOT_TOKEN` aktiv ist, antworten die Selfbots nicht mehr auf Chat-Commands

## Entwicklung

Fuer Docker-Betrieb brauchst du lokal kein Node. Fuer Entwicklung schon:

- Node.js `>=22.4.0`
- `npm install`

Wichtige Root-Skripte:

```bash
npm run build
npm run build:control-panel
npm run test:control-panel
npm run ci
npm run docker:build:control-panel
npm run lint
```

Der lokale Dev-Pfad fuer das deploybare Panel ist in [`examples/control-panel/README.md`](examples/control-panel/README.md) beschrieben.

## Projektstruktur

```text
stream-bot/
├── COMMANDS.md
├── PERFORMANCE.md
├── SELFHOSTING.md
├── config.sh
├── deploy/
├── docker/
├── examples/
│   ├── basic/
│   ├── control-panel/
│   └── puppeteer-stream/
├── install.sh
├── src/
└── update.sh
```

## Haftung

Dieses Projekt nutzt Self-Bot-Funktionalitaet. Der Betrieb erfolgt auf eigene Verantwortung.
