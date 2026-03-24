# Control Panel

Web-basiertes Dashboard zum Verwalten und Planen von Discord Streams.

---

## Features

- Gespeicherte Discord Voice Channels
- Stream-Presets (Quelle, Qualitaet, Encoder, Buffer)
- Zeitgesteuerte Events (einmalig, taeglich, woechentlich)
- Discord Event Synchronisation (Create, Start, Complete, Cancel, Update)
- Manueller Start/Stop per Web Panel oder Chat-Befehl
- YouTube / Twitch ueber yt-dlp
- Automatischer YouTube-Client-Retry fuer yt-dlp, wenn Standard-Requests an Bot-Checks scheitern
- MPEG-TS / Dispatcharr / IPTV Auto-Erkennung
- URL-Erreichbarkeitstest
- Live Stream Health Monitoring mit Uptime-Counter
- Adaptive Auto-Aktualisierung (schneller bei aktivem Stream)
- Qualitaetsprofile: 720p/30 bis 4K/60, Custom
- Buffer-Profile: Auto, Stabil, Ausgewogen, Minimale Latenz
- Discord Chat-Befehle (help, status, start, stop, events, etc.)

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
| GET | `/api/bootstrap` | Gesamtstatus (Channels, Presets, Events, Runtime, Logs) |
| GET | `/api/stream/health` | Stream Health (aktiv/inaktiv, Uptime, Kanal, Preset) |
| GET | `/api/channels` | Alle Kanaele |
| POST | `/api/channels` | Kanal erstellen/aktualisieren |
| DELETE | `/api/channels/:id` | Kanal loeschen |
| GET | `/api/presets` | Alle Presets |
| POST | `/api/presets` | Preset erstellen/aktualisieren |
| DELETE | `/api/presets/:id` | Preset loeschen |
| POST | `/api/presets/test-url` | URL Erreichbarkeit testen |
| GET | `/api/events` | Alle Events |
| POST | `/api/events` | Event erstellen |
| PUT | `/api/events/:id` | Event bearbeiten |
| DELETE | `/api/events/:id` | Event loeschen |
| POST | `/api/events/:id/cancel` | Event abbrechen |
| POST | `/api/events/:id/start` | Event sofort starten |
| POST | `/api/manual/start` | Manuellen Stream starten |
| POST | `/api/stop` | Aktiven Stream stoppen |
| GET | `/api/logs` | Letzte Log-Eintraege |
| GET | `/api/voice-channels` | Verfuegbare Discord Voice Channels |

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

Web Panel: **http://localhost:3099**

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

| Befehl | Beschreibung |
|--------|-------------|
| `$panel help` | Alle Befehle |
| `$panel status` | Stream-Status |
| `$panel start <kanal> \| <preset> \| [zeit]` | Stream starten |
| `$panel stop` | Stream stoppen |
| `$panel channels` | Kanaele auflisten |
| `$panel presets` | Presets auflisten |
| `$panel events` | Events auflisten |
| `$panel event start <id>` | Event sofort starten |
| `$panel event cancel <id>` | Event abbrechen |

Vollstaendige Referenz: [COMMANDS.md](../../COMMANDS.md)
