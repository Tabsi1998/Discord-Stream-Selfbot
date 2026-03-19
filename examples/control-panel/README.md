# Control Panel Example

Dieses Beispiel erweitert `@dank074/discord-video-stream` um ein lokales Web-Panel mit Scheduler.

## Funktionen

- gespeicherte Discord-Voice-Channels
- gespeicherte Stream-Presets
- direkte Medienquellen und `yt-dlp`-Quellen fuer YouTube-Videos und YouTube-Livestreams
- manuelle Starts und Stops
- wiederkehrende Events (`once`, `daily`, `weekly`)
- Ueberschneidungsschutz fuer geplante Serien
- Discord-Commands als Zusatzsteuerung
- Statusseite und letzte Logs

## Setup

1. `.env.example` nach `.env` kopieren
2. `DISCORD_TOKEN` setzen
3. optional `YT_DLP_PATH` setzen, falls `yt-dlp` nicht automatisch erkannt wird
4. `npm install`
5. `npm run build`
6. `npm run start`

Die Weboberflaeche laeuft standardmaessig auf `http://localhost:3099`.

## Docker / Self-hosting

Wenn du das Projekt als fertigen Dienst betreiben willst, nutze die Root-Skripte:

1. `./install.sh`
2. spaeter Konfiguration anpassen mit `./config.sh`
3. Updates einspielen mit `./update.sh`

Die komplette Anleitung steht in `SELFHOSTING.md`.

## YouTube

Normale YouTube-Links funktionieren nur ueber den Preset-Modus `yt-dlp`.

- `sourceMode = direct`: direkte MP4/HLS/M3U8-Quellen
- `sourceMode = yt-dlp`: YouTube-Videos und YouTube-Livestreams

Hinweis: das Panel erwartet fuer `yt-dlp` eine kombinierte, direkt abspielbare Medienquelle. Die Standard-Formatwahl ist deshalb auf progressive oder bereits kombinierte Streams ausgerichtet.

## Wiederkehrende Events

Wiederkehrende Regeln werden beim Speichern in konkrete Event-Instanzen aufgeloest.

- `once`: einzelnes Event
- `daily`: alle `n` Tage bis `until`
- `weekly`: an den gewaehlten Wochentagen alle `n` Wochen bis `until`

Beim Bearbeiten oder Loeschen einer Serie wirkt die Aktion ab der gewaehlten Instanz nach vorne.

## Discord-Commands

Standard-Prefix: `$panel`

- `$panel help`
- `$panel status`
- `$panel start <kanal|id> | <preset|id> | [stopAt]`
- `$panel stop`
- `$panel channels`
- `$panel presets`
- `$panel events`
- `$panel event start <event-id>`
- `$panel event cancel <event-id>`

Wenn `COMMAND_ALLOWED_AUTHOR_IDS` leer ist, darf immer noch der eingeloggte Self-Account die Befehle senden.
