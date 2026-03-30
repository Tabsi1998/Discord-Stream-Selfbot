# Control Panel

Web-basiertes Dashboard zum Verwalten und Planen von Discord Streams.

---

## Features

- Gespeicherte Discord Voice Channels
- Stream-Presets (Quelle, Qualitaet, Encoder, Buffer)
- Reserve-Quellen pro Preset mit automatischem Fallback bei Fehlern
- Zeitgesteuerte Events (einmalig, taeglich, woechentlich)
- Discord Event Synchronisation (Create, Start, Complete, Cancel, Update)
- Manueller Start/Stop per Web Panel oder Chat-Befehl
- YouTube / Twitch ueber yt-dlp
- Automatischer YouTube-Client-Retry fuer yt-dlp, wenn Standard-Requests an Bot-Checks scheitern
- MPEG-TS / Dispatcharr / IPTV Auto-Erkennung
- URL-Erreichbarkeitstest
- Live Stream Health Monitoring mit Uptime-Counter
- Live FFmpeg Telemetrie im Dashboard (FPS, Speed, Bitrate, Drops)
- Adaptive Auto-Aktualisierung (schneller bei aktivem Stream)
- Qualitaetsprofile: 720p/30 bis 4K/60, Custom
- Buffer-Profile: Auto, Stabil, Ausgewogen, Minimale Latenz
- Queue fuer mehrere Quellen mit Loop-Unterstuetzung
- Queue-Steuerung direkt im Web-Panel (Add, Start, Skip, Reorder, Clear)
- Benachrichtigungsregeln fuer manuelle Streams, Events, Queue, Fehler und Performance-Warnungen
- Eingebauter Login-Schutz fuer das Panel per `PANEL_AUTH_*`
- Automatische Hardware-Encoder-Erkennung fuer NVENC / VAAPI
- Source-aware Auto-Tuning fuer yt-dlp, HLS, MPEG-TS/IPTV und Dateiquellen
- Mehrere Selfbots mit eigener Presence und Voice-Status
- Parallele Streams pro Selfbot statt global nur einer Session
- Discord Chat-Befehle (help, status, start, stop, queue, logs, etc.)

---

## Projektstruktur

```
src/
├── config/           # appConfig.ts - Environment Variablen, Binary Detection
├── domain/           # types.ts - Alle TypeScript Typen
│                     # presetProfiles.ts - Qualitaets-/Buffer-Profile
│                     # recurrence.ts - Wiederholungslogik
├── runtime/          # StreamRuntime.ts - FFmpeg + Discord Streaming
│                     # DiscordCommandBridge.ts - Chat-Befehle
│                     # Scheduler.ts - Event-Scheduler
│                     # SourceResolver.ts - URL → FFmpeg Input
├── server/           # createServer.ts - Express API Routen
├── services/         # ControlPanelService.ts - CRUD + Discord Sync
├── state/            # AppStateStore.ts - JSON Persistenz
└── index.ts          # Einstiegspunkt

public/
├── index.html        # Haupt-HTML
├── css/app.css       # Styling (Dark Theme)
└── js/app.js         # Frontend Logik
```

---

## API Endpoints

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/api/health` | Unauthentifizierter Healthcheck fuer Docker/Monitoring |
| GET | `/api/bootstrap` | Gesamtstatus (Channels, Presets, Events, Runtime, Logs) |
| GET | `/api/state` | Vollstaendiger App-State |
| GET | `/api/logs` | Neueste Log-Eintraege |
| GET | `/api/stream/health` | Stream Health inkl. `activeRuns`, optional per `?botId=` |
| GET | `/api/channels` | Alle Kanaele |
| POST | `/api/channels` | Kanal erstellen |
| PUT | `/api/channels/:id` | Kanal aktualisieren |
| DELETE | `/api/channels/:id` | Kanal loeschen |
| GET | `/api/presets` | Alle Presets |
| POST | `/api/presets` | Preset erstellen |
| PUT | `/api/presets/:id` | Preset aktualisieren |
| DELETE | `/api/presets/:id` | Preset loeschen |
| POST | `/api/presets/test-url` | URL Erreichbarkeit testen |
| GET | `/api/events` | Alle Events |
| POST | `/api/events` | Event erstellen |
| PUT | `/api/events/:id` | Event bearbeiten |
| DELETE | `/api/events/:id` | Event loeschen |
| POST | `/api/events/:id/cancel` | Event abbrechen |
| POST | `/api/events/:id/start` | Event sofort starten |
| POST | `/api/manual/start` | Manuellen Stream starten |
| POST | `/api/stop` | Einzelnen Bot oder alle aktiven Streams stoppen |
| GET | `/api/voice-channels` | Verfuegbare Discord Voice Channels |
| GET | `/api/queue` | Queue + Queue-Konfiguration |
| POST | `/api/queue` | Queue-Item anlegen |
| POST | `/api/queue/start` | Queue starten |
| POST | `/api/queue/skip` | Queue-Item ueberspringen |
| POST | `/api/queue/stop` | Queue stoppen |
| POST | `/api/queue/loop` | Queue-Loop schalten |

---

## Setup (Entwicklung)

```bash
# 1. .env.example nach .env kopieren
cp .env.example .env

# 2. DISCORD_TOKEN in .env setzen

# 3. Dependencies installieren
npm install

# 4. TypeScript kompilieren
npm run build

# 5. Server starten
npm run start
```

Wenn YouTube mit `Sign in to confirm you're not a bot` blockiert, versucht das Panel automatisch einen alternativen YouTube-Client ueber `yt-dlp`:

- Standard: `YT_DLP_YOUTUBE_EXTRACTOR_ARGS=youtube:player_client=android`
- fuer viele Live-Streams ist dadurch keine manuelle Cookie-Konfiguration mehr noetig
- fuer Docker-Betrieb wird `yt-dlp` ueber `--pre "yt-dlp[default]"` frisch gebaut, damit YouTube-Fixes nicht an altem Build-Cache haengen

Wenn YouTube trotzdem weiter blockiert, kannst du zusaetzlich Cookies konfigurieren:

- `YT_DLP_COOKIES_FROM_BROWSER=edge` oder `chrome:Default` fuer lokale Starts
- `YT_DLP_COOKIES_FILE=/pfad/zu/cookies.txt` fuer exportierte Netscape-Cookies

Das Panel gibt in diesem Fall jetzt auch eine konkrete Konfigurationshilfe zurueck.

Fuer produktive Deployments kann das Panel direkt per Basic Auth geschuetzt werden:

```bash
PANEL_AUTH_ENABLED=1
PANEL_AUTH_USERNAME=admin
PANEL_AUTH_PASSWORD=<dein-passwort>
```

Fuer fluessigere Streams bei hohen Aufloesungen:

```bash
PREFERRED_HW_ENCODER=auto
FFMPEG_LOG_LEVEL=warning
```

Wenn Docker Zugriff auf `/dev/dri` oder eine NVIDIA-GPU hat, nutzt ein Preset mit aktivierter Hardware-Beschleunigung automatisch den passenden Encoder.

Reserve-Quellen kannst du direkt im Preset pflegen:

- eine Quelle pro Zeile
- optional mit Quellmodus als `direct|https://...` oder `yt-dlp|https://...`
- wenn die Hauptquelle fehlschlaegt, versucht der Resolver automatisch die naechste Reservequelle

Web Panel: **http://localhost:3099**

---

## Tests

```bash
npm run test
```

Der Testpfad baut eine separate `dist-test` Ausgabe und deckt aktuell Wiederholungen, Scheduler, State-Migration und bot-spezifische Service-Logik ab.

---

## Docker / Self-Hosting

Fuer den produktiven Betrieb: siehe [SELFHOSTING.md](../../SELFHOSTING.md)

```bash
# Kurzversion:
./install.sh          # Ersteinrichtung
./config.sh           # Konfiguration aendern
./update.sh           # Updates einspielen
```

---

## Discord Chat-Befehle

Standard-Prefix: `$panel`

Weitere Prefixe wie `?` oder `!panel` koennen ueber `COMMAND_PREFIX_ALIASES` gesetzt werden. Beim normalen Control-Bot funktioniert zusaetzlich die Bot-Mention als Prefix.
Sobald ein normaler Control-Bot aktiv ist, antworten die Selfbots nicht mehr auf Chat-Commands.

Die Befehle koennen ueber den primaeren Selfbot, ueber command-faehige Zusatz-Selfbots und optional ueber einen normalen Discord Bot mit `CONTROL_BOT_TOKEN` angenommen werden.
Der normale Bot kann ausserdem guild-spezifische Slash-Commands registrieren. Diese werden nie global angelegt und koennen ueber `CONTROL_BOT_COMMAND_GUILD_IDS` begrenzt werden.

| Befehl | Beschreibung |
|--------|-------------|
| `$panel help` | Alle Befehle |
| `$panel whoami` | Eigene Discord-ID und Command-Freigabe pruefen |
| `$panel play <url> \| [zeit]` | URL direkt im aktuellen Voice-Channel starten |
| `$panel status` | Stream-Status |
| `$panel start <url>` | Schnellstart fuer eine URL |
| `$panel start <kanal> \| <preset> \| [zeit]` | Stream starten |
| `$panel stop` | Einen oder mehrere Streams stoppen |
| `$panel restart [bot\|kanal\|id]` | Gezielter Neustart eines aktiven Streams |
| `$panel channels` | Kanaele auflisten |
| `$panel presets` | Presets auflisten |
| `$panel events` | Events auflisten |
| `$panel event start <id>` | Event sofort starten |
| `$panel event cancel <id>` | Event abbrechen |

Vollstaendige Referenz: [COMMANDS.md](../../COMMANDS.md)

Wenn der normale Bot nicht reagiert, pruefe vor allem `COMMAND_ALLOWED_AUTHOR_IDS` und das `Message Content Intent`.
