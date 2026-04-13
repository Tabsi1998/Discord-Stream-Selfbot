# Control Panel

Technische Doku fuer die deploybare App in diesem Repo. Diese Anwendung wird von den Root-Skripten und vom Dockerfile fuer den produktiven Bot-Betrieb verwendet.

## Scope

Das Control Panel ist nicht nur ein Frontend. Es enthaelt:

- HTTP-Server
- Auth-Middleware fuer das Panel
- JSON-Persistenz
- Discord-Runtime fuer Selfbots
- optionalen Control-Bot fuer Commands
- Scheduler
- Queue-Logik
- Discord Event Sync
- Notification- und YouTube-Helfer

## Lokal entwickeln

### Voraussetzungen

- Node.js `>=22.4.0`
- Root-Abhaengigkeiten installiert

### Commands

Vom Repo-Root:

```bash
npm install
npm run build
npm --prefix examples/control-panel install
npm run build:control-panel
```

Start:

```bash
npm --prefix examples/control-panel run start
```

Tests:

```bash
npm --prefix examples/control-panel run test
```

Wichtig:

- `prebuild` im Panel baut zuerst die Root-Library
- `start` nutzt `node --env-file-if-exists=.env ./dist/index.js`
- fuer lokalen Betrieb brauchst du mindestens `DISCORD_TOKEN`

## Architektur

```text
examples/control-panel/
├── public/                 # HTML/CSS/JS fuer die Web-Oberflaeche
├── src/config/             # Env-Parsing, Binary-Detection, Selfbot-Loading
├── src/domain/             # Typen, Qualitaetsprofile, Wiederholung
├── src/runtime/            # Discord Runtime, Scheduler, Commands, Source Resolver
├── src/server/             # Express Server, Request-Validation
├── src/services/           # Geschaeftslogik und Orchestrierung
├── src/state/              # JSON-State und Log-Persistenz
└── src/index.ts            # Bootstrapping
```

## Laufzeitkomponenten

### `AppStateStore`

- persistiert den App-State in eine JSON-Datei
- persistiert Logs separat in `*.logs.json`
- legt `*.bak` Backups an
- normalisiert alte State-Formate beim Laden

### `StreamRuntime`

- startet Selfbots
- verwaltet aktive Runs pro Bot
- liefert Telemetrie
- stellt Voice-Channel-Discovery bereit

### `DiscordCommandBridge`

- verarbeitet Text-Commands
- optional Slash-Commands ueber einen normalen Bot
- verwaltet Prefixe, Allowlist und Guild-Zielauswahl

### `ControlPanelService`

- CRUD fuer Kanaele, Presets, Events und Queue
- Event-Serien und Konfliktlogik
- Notification-Versand
- Config-Export/Import

### `createServer`

- Healthcheck
- Panel-Auth
- statische Dateien
- REST-API
- SSE-Live-State
- Cookie- und OAuth2-Endpunkte

## Persistenz

Die Standardpfade kommen aus `DATA_FILE` und werden meist ueber Docker auf Host-Dateien gemappt.

| Datei | Inhalt |
| --- | --- |
| `control-panel-state.json` | Kanaele, Presets, Events, Queue, Queue-Config, Notification-Settings, Runtime-Grundzustand |
| `control-panel-state.logs.json` | Logs |
| `control-panel-state.json.bak` | Backup des Haupt-State |
| `control-panel-state.logs.json.bak` | Backup der Logs |

Zusatzdaten:

- YouTube-Cookies in `cookies/yt-dlp-cookies.txt`
- yt-dlp OAuth2 Token im Cache unter `~/.cache/yt-dlp/youtube-oauth2/`

## API-Ueberblick

### Oeffentlich ohne Panel-Auth

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/health` | Healthcheck mit `ok`, `authEnabled`, `discordStatus` |

### State und Live-Sync

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/bootstrap` | kompletter State plus Voice-Channel-Discovery |
| `GET` | `/api/state` | kompletter App-State |
| `GET` | `/api/live/state` | SSE-Stream mit State-Updates |
| `GET` | `/api/logs` | Logs, limitierbar per `?limit=` |
| `GET` | `/api/stream/health` | aktiver Run, Uptime und aktive Streams |

### Kanaele

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/channels` | alle gespeicherten Kanaele |
| `GET` | `/api/voice-channels` | Discord-Discovery, optional `botId` und `refresh=1` |
| `POST` | `/api/channels` | Kanal anlegen |
| `PUT` | `/api/channels/:id` | Kanal aktualisieren |
| `DELETE` | `/api/channels/:id` | Kanal loeschen |

### Presets

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/presets` | alle Presets |
| `POST` | `/api/presets` | Preset anlegen |
| `PUT` | `/api/presets/:id` | Preset aktualisieren |
| `DELETE` | `/api/presets/:id` | Preset loeschen |
| `POST` | `/api/presets/test-url` | URL per `HEAD` pruefen |

### Events und manuelle Runs

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/events` | Events lesen |
| `POST` | `/api/events` | Event anlegen |
| `PUT` | `/api/events/:id` | Event aktualisieren |
| `DELETE` | `/api/events/:id` | Event loeschen |
| `POST` | `/api/events/:id/start` | Event sofort starten |
| `POST` | `/api/events/:id/cancel` | Event abbrechen |
| `POST` | `/api/manual/start` | manuellen Run starten |
| `POST` | `/api/stop` | aktiven Bot oder alle Runs stoppen |

### Queue

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/queue` | Queue plus Config |
| `POST` | `/api/queue` | Queue-Eintrag anlegen |
| `DELETE` | `/api/queue/:id` | Queue-Eintrag loeschen |
| `POST` | `/api/queue/clear` | Queue leeren |
| `POST` | `/api/queue/loop` | Loop setzen |
| `PUT` | `/api/queue/config` | `loop` oder `conflictPolicy` aendern |
| `POST` | `/api/queue/start` | Queue starten |
| `POST` | `/api/queue/skip` | naechsten Eintrag abspielen |
| `POST` | `/api/queue/stop` | Queue stoppen |
| `POST` | `/api/queue/reorder` | Position aendern |

### Notifications und Konfiguration

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/settings/notifications` | Notification-Settings lesen |
| `PUT` | `/api/settings/notifications` | Notification-Settings speichern |
| `POST` | `/api/settings/notifications/test` | Testversand mit optionalem Override |
| `POST` | `/api/notifications/test` | Test mit gespeicherten Settings |
| `GET` | `/api/config/export` | JSON-Export herunterladen |
| `POST` | `/api/config/import` | Export wieder importieren |

### Cookies und OAuth2

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/cookies/status` | Cookie-Status und Pfade |
| `POST` | `/api/cookies/upload` | Netscape-Cookies speichern |
| `POST` | `/api/cookies/delete` | Cookie-Datei loeschen |
| `GET` | `/api/cookies/howto` | Hilfetexte fuer Cookie-Export |
| `GET` | `/api/oauth2/status` | OAuth2-Status und vorhandenes Token |
| `POST` | `/api/oauth2/start` | Device-Flow starten |
| `POST` | `/api/oauth2/revoke` | gespeichertes OAuth2-Token loeschen |

## Wichtige Verhaltensdetails

### Panel-Auth

- `/api/health` bleibt offen
- alle anderen Routen und die statischen Panel-Dateien laufen hinter der Auth-Middleware
- Auth ist HTTP Basic Auth mit `PANEL_AUTH_*`

### Queue-Konfliktregel

- `queue-first`: geplante Events auf demselben Selfbot werden blockiert
- `event-first`: Queue wird pausiert, Event gestartet und Queue danach fortgesetzt

### Event-Scopes

Bei Updates und Deletes fuer Serien gelten:

- `single`
- `this-and-following`
- `all`

Default im Update-Pfad ist `this-and-following`.

### Config-Export/Import

- Export-Version ist aktuell `version: 1`
- der Export setzt `queueConfig.active` bewusst auf `false`
- Import ist nur erlaubt, wenn keine aktiven Streams laufen und die Queue gestoppt ist

### Notifications

- Webhook-Versand postet JSON an `webhookUrl`
- `dmEnabled` sendet eine DM an den verwendeten Selfbot-Account selbst
- gespeicherte Notification-Settings uebersteuern spaetere `.env`-Defaults

### Cookies

- Upload erwartet Netscape/Mozilla-Format
- der Server validiert mindestens tab-separierte Cookie-Zeilen
- erfolgreicher Upload wird geloggt

### OAuth2

- nutzt `yt-dlp-youtube-oauth2`
- Device-Code und Verify-URL werden aus dem Prozessoutput extrahiert
- Token wird im yt-dlp Cache gehalten

## Wichtige Env-Variablen

Die echten Defaults liegen in `deploy/.env.example`. Fuer diese App besonders relevant:

- `DISCORD_TOKEN`
- `DATA_FILE`
- `SELFBOT_CONFIG_FILE`
- `COMMAND_PREFIX`
- `COMMAND_PREFIX_ALIASES`
- `CONTROL_BOT_TOKEN`
- `CONTROL_BOT_COMMAND_GUILD_IDS`
- `COMMAND_ALLOWED_AUTHOR_IDS`
- `PANEL_AUTH_ENABLED`
- `PANEL_AUTH_USERNAME`
- `PANEL_AUTH_PASSWORD`
- `PANEL_AUTH_REALM`
- `YT_DLP_COOKIES_FROM_BROWSER`
- `YT_DLP_COOKIES_FILE`
- `YT_DLP_YOUTUBE_EXTRACTOR_ARGS`
- `YT_DLP_FORMAT`
- `PREFERRED_HW_ENCODER`
- `FFMPEG_VAAPI_DEVICE`
- `FFMPEG_LOG_LEVEL`
- `SCHEDULER_POLL_MS`
- `STARTUP_TIMEOUT_MS`
- `NOTIFICATION_WEBHOOK_URL`
- `NOTIFICATION_DM_ENABLED`

## Tests

Der Testpfad deckt vor allem die produktive App-Logik ab:

- Wiederholungen
- Scheduler
- Queue und State-Migration
- Service-Logik

```bash
npm --prefix examples/control-panel run test
```
