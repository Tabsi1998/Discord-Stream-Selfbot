# Discord Stream Bot

> Automatisches Streaming auf Discord - YouTube, Twitch, IPTV, Direktlinks - alles per Web Panel oder Chat-Befehl steuerbar.

---

## Was ist das?

Ein Self-Bot der auf deinem Discord-Account Videos in Voice Channels streamt. Das Ganze laeuft als Docker Container auf deinem Server und wird ueber ein modernes Web Panel oder Discord Chat-Befehle gesteuert.

**Wichtig:** Self-Bots verstossen gegen die Discord ToS. Nutzung auf eigene Gefahr.

---

## Features

| Feature | Beschreibung |
|---------|-------------|
| Web Panel | Dashboard zum Verwalten von Kanaelen, Presets, Queue und Events |
| Web Panel Login | Optionaler HTTP Basic Auth Schutz direkt in der App |
| Multi-Selfbot | Mehrere Selfbots mit eigenem Token, Presence und Voice-Status |
| Parallele Streams | Mehrere Streams gleichzeitig, jeweils getrennt pro Selfbot |
| Scheduler | Streams zeitgesteuert planen - einmalig, taeglich, woechentlich |
| Discord Events | Geplante Streams werden automatisch als Discord Events erstellt |
| YouTube / Twitch | Automatisch ueber yt-dlp, einfach URL reinkopieren |
| Reserve-Quellen | Mehrere Backup-URLs pro Preset mit automatischem Fallback |
| MPEG-TS / IPTV | Dispatcharr, Tvheadend und andere TS-Proxies direkt nutzen |
| Direkt-URLs | Jede MP4, HLS, M3U8 oder sonstige Media-URL |
| Chat-Befehle | Streams per Discord-Nachricht starten/stoppen |
| Queue | Mehrere URLs nacheinander abspielen, optional mit Loop |
| Notification-Regeln | Getrennte Schalter fuer manuelle Streams, Events, Queue, Fehler und Performance-Warnungen |
| Stream Health | Live Uptime-Anzeige und Status im Dashboard |
| Live Telemetrie | FPS, Speed, Bitrate und Frame-Drops direkt im Panel |
| URL-Test | Vor dem Streamen pruefen ob die Quelle erreichbar ist |
| Qualitaetsprofile | 720p bis 4K, 30/60fps, Custom Encoder-Settings |
| Buffer-Profile | Auto, Stabil, Ausgewogen, Minimale Latenz |
| Source-Auto-Tuning | HLS, MPEG-TS/IPTV, MP4 und yt-dlp bekommen passendere Auto-Profile |
| Hardware-Encoding | NVENC/VAAPI wird automatisch erkannt und bei Bedarf genutzt |
| Go Live / Camera | Beide Discord Stream-Modi unterstuetzt |

---

## Schnellstart

### Voraussetzungen

- Docker + Docker Compose
- Git
- Discord Self-Token ([Wie finde ich den?](#discord-token-finden))

### Installation

```bash
git clone https://github.com/Tabsi1998/Discord-Stream-Selfbot.git
cd stream-bot
./install.sh
```

Das Install-Script fragt alles interaktiv ab:

1. Discord Token
2. Zeitzone (Standard: Europe/Vienna)
3. Chat-Befehle an/aus
4. Optionaler Login fuer das Web-Panel
5. Erlaubte User-IDs

Danach laeuft das Panel auf **http://localhost:3099**

### Einstellungen aendern

```bash
./config.sh
```

Zeigt die aktuelle Konfiguration und laesst dich einzelne Werte oder alles auf einmal aendern.

### Updates einspielen

```bash
./update.sh
```

Holt die neueste Version von GitHub, sichert vorher alles (Token, Einstellungen, Stream-Daten) und baut den Container neu.

---

## Web Panel Bedienung

### Dashboard

Die Startseite zeigt dir auf einen Blick:

- **Discord Status** - Verbunden/Offline
- **Aktive Streams** - Alle laufenden Streams pro Selfbot mit eigener Uptime
- **Naechstes Event** - Wann der naechste geplante Stream startet
- **Manueller Start** - Kanal + Preset auswaehlen und sofort starten
- **Letzte Logs** - Was zuletzt passiert ist

### Kanaele

Hier konfigurierst du die Discord Voice Channels in denen gestreamt werden soll.

| Feld | Beschreibung |
|------|-------------|
| Selfbot | Welcher Selfbot diesen Voice Channel bedient |
| Name | Frei waehlbarer Name (z.B. "Gaming Kanal") |
| Guild ID | Server-ID (Rechtsklick auf Server → ID kopieren) |
| Voice Channel ID | Kanal-ID (Rechtsklick auf Voice Channel → ID kopieren) |
| Stream-Modus | `Go Live` oder `Camera` |

**Tipp:** Developer Mode muss in Discord aktiviert sein (Einstellungen → Erweitert → Entwicklermodus).

### Presets

Stream-Vorlagen mit Quelle, Qualitaet und Encoder-Einstellungen.

| Tab | Was du einstellst |
|-----|------------------|
| **Allgemein** | Name, URL, Quelltyp, Qualitaet, Buffer-Verhalten |
| **Video** | Aufloesung, FPS, Bitrate, Codec (H264/H265) |
| **Audio** | Audio-Bitrate, Audio an/aus |
| **Erweitert** | Hardware-Decoding, Minimale Latenz |

#### Quelltypen

| Typ | Wann verwenden |
|-----|---------------|
| **Direkte Media-URL** | MP4, HLS/M3U8, MPEG-TS, RTMP - alles was FFmpeg direkt oeffnen kann |
| **yt-dlp** | YouTube Videos, YouTube Livestreams, Twitch Streams |

**Auto-Erkennung:** Das Panel erkennt automatisch:
- YouTube/Twitch URLs → schaltet auf yt-dlp um
- MPEG-TS Proxy URLs (Dispatcharr) → setzt Buffer auf Stabil
- Pro Preset koennen Reserve-Quellen hinterlegt werden; bei Fehlern probiert das Panel automatisch die naechste Quelle

#### Qualitaetsprofile

| Profil | Aufloesung | FPS | Standard-Bitrate |
|--------|-----------|-----|-----------------|
| 720p/30 | 1280x720 | 30 | 3000 kbps |
| 720p/60 | 1280x720 | 60 | 4500 kbps |
| 1080p/30 | 1920x1080 | 30 | 5000 kbps |
| 1080p/60 | 1920x1080 | 60 | 7500 kbps |
| 1440p/30 | 2560x1440 | 30 | 8500 kbps |
| 1440p/60 | 2560x1440 | 60 | 12000 kbps |
| 4K/30 | 3840x2160 | 30 | 15000 kbps |
| 4K/60 | 3840x2160 | 60 | 20000 kbps |
| Custom | frei | frei | frei |

#### Buffer-Profile

| Profil | Beschreibung | Wann verwenden |
|--------|-------------|---------------|
| **Auto** | Intelligenter Default | Meistens die beste Wahl |
| **Maximale Stabilitaet** | Grosser Buffer, langsamer Start | IPTV, lange Streams, instabile Quellen |
| **Ausgewogen** | Mittlerer Buffer | Normaler Betrieb |
| **Minimale Latenz** | Kleiner Buffer, schneller Start | Live Events wo Verzoegerung stoert |

#### URL Test

Der **Testen** Button neben dem URL-Feld prueft ob die Quelle erreichbar ist und zeigt dir:
- HTTP Status Code
- Content-Type (video/mp2t, video/mp4, application/vnd.apple.mpegurl, etc.)

### Events

Streams zeitgesteuert planen.

| Feld | Beschreibung |
|------|-------------|
| Name | Name des Events (wird auch in Discord angezeigt) |
| Kanal | In welchem Voice Channel gestreamt wird |
| Preset | Welche Stream-Vorlage verwendet wird |
| Start/Ende | Zeitraum des Streams |
| Wiederholung | Einmalig, Taeglich, Woechentlich |
| Wochentage | Bei woechentlich: an welchen Tagen |
| Intervall | Alle X Tage/Wochen |
| Wiederholen bis | Bis wann die Serie laeuft |

#### Discord Event Sync

Wenn ein Event erstellt wird, wird automatisch ein **Discord Scheduled Event** auf dem Server erstellt. Das funktioniert in beide Richtungen:

- Event erstellen → Discord Event wird erstellt
- Event starten → Discord Event Status wird auf "Active" gesetzt
- Event beenden → Discord Event Status wird auf "Completed" gesetzt
- Event abbrechen → Discord Event wird geloescht
- Event bearbeiten → Altes Discord Event wird geloescht, neues erstellt

Events mit Discord-Sync zeigen ein **DISCORD** Badge in der Event-Liste.

### Logs

Alle Systemereignisse mit Filtern:
- **INFO** - Normale Vorgaenge (Stream gestartet, Event erstellt)
- **WARN** - Warnungen (Discord Event Sync fehlgeschlagen)
- **ERROR** - Fehler (Stream abgestuerzt, Verbindungsprobleme)

---

## Multi-Selfbot Betrieb

- Der primaere Selfbot wird direkt ueber `deploy/.env` konfiguriert.
- Weitere Selfbots liegen in `examples/control-panel/data/selfbot-profiles.tsv`.
- Jeder konfigurierte Discord Voice Channel ist genau einem Selfbot zugeordnet.
- Scheduler, Queue und manuelle Starts arbeiten bot-spezifisch. Dadurch koennen verschiedene Selfbots parallel streamen, ohne sich global zu blockieren.
- Die Queue ist weiterhin global als Playlist, streamt aber immer ueber genau den Selfbot des gewaehlten Queue-Kanals.

Die wichtigsten Presence-Variablen:

| Variable | Beschreibung |
|----------|-------------|
| `PRIMARY_SELFBOT_NAME` | Anzeigename des primaeren Selfbots |
| `IDLE_ACTIVITY_TEXT` | Idle-Status wenn der Bot gerade nichts streamt |
| `STREAM_ACTIVITY_TEXT` | Status-Template waehrend eines Streams, z.B. `{{title}}` |
| `VOICE_STATUS_TEMPLATE` | Voice-Status-Template, z.B. `Now streaming: {{title}}` |
| `SELFBOT_CONFIG_FILE` | Pfad zur TSV/JSON Datei mit Zusatzbots |

`config.sh` bietet dafuer den Punkt `10) Selfbots`.

---

## MPEG-TS / Dispatcharr / IPTV Integration

Du hast einen IPTV-Proxy wie Dispatcharr, Tvheadend oder aehnliches? Perfekt.

### So funktioniert es

1. Kopiere die TS-Stream URL in das Preset, z.B.:
   ```
   http://192.168.2.104:9191/proxy/ts/stream/412ccfb1-8868-42c1-aaf3-b0e3565c1a74
   ```
2. Das Panel erkennt automatisch dass es ein MPEG-TS Proxy ist
3. Quelltyp wird auf "Direkt" gesetzt
4. Buffer-Profil wird auf "Stabil" gesetzt
5. FFmpeg bekommt spezielle Flags:
   - `-fflags +genpts+discardcorrupt` (fehlende Timestamps generieren, kaputte Pakete verwerfen)
   - Kein `-readrate` (Live-Stream ist bereits in Echtzeit)
   - Reconnect bei Verbindungsabbruch

### Warum das gut ist

| Vorteil | Erklaerung |
|---------|-----------|
| Kein Token sichtbar | Der IPTV-Proxy kuemmert sich um die Authentifizierung |
| Stabiler Stream | Dispatcharr liefert einen sauberen TS-Feed |
| Lokal | Laeuft im Heimnetz, kein externer Traffic |
| Kein Transcoding noetig | FFmpeg kopiert Audio/Video direkt (copy codec) |

### Typische Setups

```
Dispatcharr (IPTV) → FFmpeg (im Docker) → Discord Voice Channel
Tvheadend → FFmpeg → Discord
Jellyfin → FFmpeg → Discord
```

---

## Discord Chat-Befehle

Alle Befehle starten mit dem konfigurierten Prefix (Standard: `$panel`).
Sie funktionieren ueber den primaeren Selfbot, ueber command-faehige Zusatz-Selfbots und optional ueber einen normalen Discord Bot mit `CONTROL_BOT_TOKEN`.

Komplette Befehlsreferenz: siehe [COMMANDS.md](COMMANDS.md)

### Kurzuebersicht

| Befehl | Was es tut |
|--------|-----------|
| `$panel help` | Alle Befehle anzeigen |
| `$panel status` | Aktuellen Stream-Status anzeigen |
| `$panel start Kanal \| Preset` | Stream sofort starten |
| `$panel start Kanal \| Preset \| 2025-12-31 22:00` | Stream mit Stoppzeit starten |
| `$panel stop` | Einen oder mehrere aktive Streams stoppen |
| `$panel restart [bot\|kanal\|id]` | Aktiven Stream gezielt neu starten |
| `$panel channels` | Alle konfigurierten Kanaele anzeigen |
| `$panel presets` | Alle Presets anzeigen |
| `$panel events` | Kommende Events anzeigen |
| `$panel event start <id>` | Geplantes Event sofort starten |
| `$panel event cancel <id>` | Event abbrechen |
| `$panel queue` | Queue anzeigen |
| `$panel queue add <url> \| [name]` | URL in die Queue legen |
| `$panel queue start Kanal \| Preset` | Queue im Kanal starten |
| `$panel queue stop` | Queue stoppen |
| `$panel queue skip` | Zum naechsten Queue-Item springen |
| `$panel info` | System-/Runtime-Infos anzeigen |
| `$panel logs [n]` | Letzte Logs abrufen |

---

## Discord Token finden

1. Discord im Browser oeffnen (discord.com/app)
2. **F12** druecken (Developer Tools)
3. Tab **Network** waehlen
4. Beliebige Aktion in Discord ausfuehren (Nachricht senden, Kanal wechseln)
5. Auf einen der Requests klicken
6. In den **Headers** nach `Authorization` suchen
7. Der Wert ist dein Token

**ACHTUNG:** Dein Token ist wie ein Passwort. Niemals teilen!

---

## Projektstruktur

```
Discord-Stream-Selfbot/
├── install.sh                  # Interaktive Ersteinrichtung
├── update.sh                   # Git Update + Container Rebuild
├── config.sh                   # Konfiguration aendern
├── deploy/
│   ├── .env                    # Deine Konfiguration (nach install.sh)
│   ├── .env.example            # Vorlage
│   ├── docker-compose.yml      # Container-Definition
│   └── data/
│       └── control-panel-state.json  # Alle Daten (Channels, Presets, Events)
├── docker/
│   └── control-panel.Dockerfile
├── src/                        # Core Streaming Library
│   └── media/
│       └── newApi.ts           # FFmpeg + WebRTC Streaming Engine
├── examples/
│   └── control-panel/
│       ├── src/                # Backend (TypeScript)
│       │   ├── config/         # App-Konfiguration
│       │   ├── domain/         # Typen, Profile, Wiederholungslogik
│       │   ├── runtime/        # Discord, Scheduler, Commands, Source Resolution
│       │   ├── server/         # Express API Server
│       │   ├── services/       # Geschaeftslogik (CRUD, Discord Sync)
│       │   └── state/          # Persistenz (JSON File)
│       └── public/             # Frontend (HTML/CSS/JS)
│           ├── index.html
│           ├── css/app.css
│           └── js/app.js
├── COMMANDS.md                 # Befehlsreferenz
├── IDEAS.md                    # Ideen & Erweiterungsmoeglichkeiten
├── SELFHOSTING.md              # Docker/Self-Hosting Anleitung
└── PERFORMANCE.md              # Performance Tipps
```

---

## Konfigurationsvariablen

| Variable | Beschreibung | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Dein Discord Self-Token | (Pflicht) |
| `HOST_PORT` | Web Panel Port | 3099 |
| `TZ` | Zeitzone | Europe/Vienna |
| `DISCORD_COMMANDS_ENABLED` | Chat-Befehle an (1) / aus (0) | 1 |
| `COMMAND_PREFIX` | Prefix fuer Chat-Befehle | $panel |
| `CONTROL_BOT_TOKEN` | Optionaler normaler Discord Bot fuer dieselben Text-Befehle | leer |
| `COMMAND_ALLOWED_AUTHOR_IDS` | Erlaubte User-IDs (komma-getrennt) | nur du selbst |
| `PRIMARY_SELFBOT_NAME` | Anzeigename des primaeren Selfbots | Primary Selfbot |
| `SELFBOT_CONFIG_FILE` | TSV/JSON-Datei fuer zusaetzliche Selfbots | `/app/examples/control-panel/data/selfbot-profiles.tsv` |
| `IDLE_ACTIVITY_TEXT` | Idle-Status Text | THE LION SQUAD - eSPORTS |
| `STREAM_ACTIVITY_TEXT` | Streaming-Status Template | `{{title}}` |
| `VOICE_STATUS_TEMPLATE` | Voice-Status Template | `Now streaming: {{title}}` |
| `PANEL_AUTH_ENABLED` | Web-Panel per Login absichern | 0 |
| `PANEL_AUTH_USERNAME` | Benutzername fuer das Panel | leer |
| `PANEL_AUTH_PASSWORD` | Passwort fuer das Panel | leer |
| `YT_DLP_FORMAT` | yt-dlp Formatauswahl | bestvideo+bestaudio |
| `PREFERRED_HW_ENCODER` | Hardware-Encoder Auswahl (`auto`, `nvenc`, `vaapi`) | auto |
| `FFMPEG_LOG_LEVEL` | FFmpeg Log-Level fuer Streams | warning |
| `SCHEDULER_POLL_MS` | Wie oft der Scheduler Events prueft | 1000 |
| `STARTUP_TIMEOUT_MS` | Max. Wartezeit bis Discord verbunden | 15000 |

---

## Tests

Fuer das Control Panel gibt es jetzt einen separaten Testpfad fuer Wiederholungen, Scheduler, State-Migration und bot-spezifische Service-Logik.

```bash
npm run test:control-panel
```

Direkt im Control-Panel-Ordner:

```bash
cd examples/control-panel
npm run test
```

---

## Troubleshooting

### Stream haengt / buffert

1. **Buffer-Profil auf "Stabil" setzen** - Mehr Buffer = stabiler
2. **Qualitaet reduzieren** - 1080p statt 4K, 30fps statt 60fps
3. **Bitrate senken** - Weniger kbps = weniger Bandbreite noetig
4. **Hardware-Beschleunigung im Preset aktivieren** - nutzt automatisch NVENC/VAAPI wenn verfuegbar
5. **Quelle pruefen** - URL-Test im Preset verwenden
6. **Logs checken** - Im Logs-Tab oder per `$panel logs` nach Fehlern suchen

### 1440p / 4K soll fluessiger laufen

- Aktiviere im Preset **Hardware Acceleration**
- Lasse `PREFERRED_HW_ENCODER=auto`, ausser du willst gezielt `nvenc` oder `vaapi` erzwingen
- Fuer VAAPI im Docker-Container muss `/dev/dri` in den Container durchgereicht werden
- Ohne Hardware-Encoder faellt das System automatisch auf Software-Encoding zurueck; fuer stabile Streams dann besser auf `1080p30` oder `1080p60` bleiben

### YouTube funktioniert nicht

- URL muss ein vollstaendiger YouTube Link sein
- Quelltyp muss auf **yt-dlp** stehen (wird automatisch erkannt)
- yt-dlp ist im Docker Image enthalten

### Discord Event wird nicht erstellt

- Bot muss auf dem Server die Berechtigung haben Events zu erstellen
- Self-Token Accounts haben manchmal eingeschraenkte Rechte
- Check die Logs fuer genaue Fehlermeldung

### Container startet nicht

```bash
# Logs anzeigen
docker compose -f deploy/docker-compose.yml logs -f

# Container neu bauen
docker compose -f deploy/docker-compose.yml up -d --build --force-recreate
```

---

## Technische Details

| Komponente | Technologie |
|-----------|-------------|
| Streaming Engine | FFmpeg → WebRTC via discord-video-stream |
| Discord Bibliothek | discord.js-selfbot-v13 |
| Backend | Node.js, Express, TypeScript |
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| Persistenz | JSON File (kein externer DB Server noetig) |
| Containerisierung | Docker, Docker Compose |
| Video Codecs | H.264, H.265 |
| Verschluesselung | Transport + E2E Encryption |

---

## Lizenz & Haftung

Dieses Projekt nutzt Self-Bot Funktionalitaet die gegen die Discord Terms of Service verstossen kann. Die Nutzung erfolgt auf eigene Verantwortung. Der Autor uebernimmt keine Haftung fuer Konsequenzen.
