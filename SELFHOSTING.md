# Self-Hosting Anleitung

Dieses Repo kann als persistenter Docker-Dienst auf deinem eigenen Server betrieben werden.

---

## Voraussetzungen

- **Docker** mit `docker compose` (v2)
- **Git**
- Auf Windows: Git Bash oder WSL fuer die `.sh`-Skripte
- Ein **Discord Self-Token** ([Anleitung im README](README.md#discord-token-finden))

---

## Schnellstart

```bash
# 1. Repo klonen
git clone https://github.com/Tabsi1998/Discord-Stream-Selfbot.git
cd Discord-Stream-Selfbot

# 2. Interaktive Installation
./install.sh

# 3. Fertig!
# Browser: http://localhost:3099
```

`install.sh` fragt interaktiv alles ab:

| Schritt | Was abgefragt wird |
|---------|-------------------|
| 1/4 | Voraussetzungen pruefen (Docker, Compose, Dateien) |
| 2/4 | Discord Token + erlaubte User-IDs |
| 3/4 | Zeitzone, Chat-Befehle an/aus, Prefix, yt-dlp Cookies |
| 4/4 | Zusammenfassung + Bestaetigung |

---

## Konfiguration aendern

```bash
./config.sh
```

Zeigt die aktuelle Konfiguration und bietet Optionen:

| Option | Was du aendern kannst |
|--------|----------------------|
| 1 | Discord Token |
| 2 | Zeitzone |
| 3 | Chat-Befehle (an/aus, Prefix) |
| 4 | Erlaubte User-IDs |
| 5 | yt-dlp Cookies |
| 6 | yt-dlp Format |
| 7 | Scheduler (Poll-Intervall, Timeout) |
| a | Alles auf einmal |
| q | Abbrechen |

Danach wird optional der Container mit der neuen Konfiguration neu gebaut.

---

## Updates einspielen

```bash
./update.sh
```

Was passiert:

1. Voraussetzungen pruefen
2. Aktuellen Stand anzeigen (Branch, Commit)
3. Lokale Aenderungen sichern (git stash)
4. Pruefen ob Updates verfuegbar sind
5. Konfiguration + Stream-Daten sichern
6. `git pull --ff-only` ausfuehren
7. Container stoppen, neu bauen, starten

**Alles wird gesichert:**
- `.env` → `.env.pre-update`
- `control-panel-state.json` → `control-panel-state.pre-update.json`
- Lokale Code-Aenderungen → `git stash`

---

## Wichtige Dateien

| Datei | Beschreibung |
|-------|-------------|
| `deploy/.env` | Deine Konfiguration (Token, Port, etc.) |
| `deploy/.env.example` | Vorlage mit allen Variablen |
| `deploy/docker-compose.yml` | Container-Definition |
| `deploy/data/control-panel-state.json` | Alle Daten (Channels, Presets, Events, Logs) |
| `docker/control-panel.Dockerfile` | Docker Build fuer den Dienst |

---

## Docker Compose manuell steuern

```bash
# Status anzeigen
docker compose -f deploy/docker-compose.yml ps

# Logs anzeigen (live)
docker compose -f deploy/docker-compose.yml logs -f

# Container stoppen
docker compose -f deploy/docker-compose.yml down

# Container starten
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d

# Container komplett neu bauen
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build --force-recreate
```

---

## Daten-Backup

Die einzigen Dateien die du sichern musst:

```bash
# Konfiguration
cp deploy/.env ~/backup/

# Stream-Daten (Channels, Presets, Events)
cp deploy/data/control-panel-state.json ~/backup/
```

Zum Wiederherstellen einfach zurueckkopieren und Container neu starten.

---

## Hinweise

- Der Dienst laeuft auf **Port 3099** (fest konfiguriert)
- YouTube-Quellen laufen ueber **yt-dlp**, das im Docker-Image bereits installiert ist
- Wenn YouTube `Sign in to confirm you're not a bot` meldet, setze in `deploy/.env` entweder:
  - `YT_DLP_COOKIES_FILE=/app/examples/control-panel/cookies/yt-dlp-cookies.txt`
  - oder `YT_DLP_COOKIES_FROM_BROWSER=...` wenn du den Browser-Profile-Zugriff selbst in den Container bringst
- Vor diesem Cookie-Fallback versucht das Panel automatisch `YT_DLP_YOUTUBE_EXTRACTOR_ARGS=youtube:player_client=android`, was viele Livestreams bereits ohne Cookies aufloest.
- Fuer die Cookie-Datei kannst du eine Netscape-Cookies-Datei unter `deploy/cookies/yt-dlp-cookies.txt` ablegen. Dieser Ordner wird read-only in den Container gemountet.
- MPEG-TS Streams (Dispatcharr, IPTV) werden automatisch erkannt und optimiert
- FFmpeg ist im Docker-Image mit allen benoetigten Codecs enthalten
- Die State-Datei wird bei jedem Schreibvorgang automatisch gespeichert
- Fuer Aenderungen an Code oder Abhaengigkeiten: `./update.sh` ausfuehren

---

## Reverse Proxy (optional)

Wenn du das Panel ueber eine Domain erreichbar machen willst:

### nginx Beispiel

```nginx
server {
    listen 443 ssl;
    server_name stream.deinedomain.at;

    ssl_certificate     /etc/ssl/certs/stream.pem;
    ssl_certificate_key /etc/ssl/private/stream.key;

    location / {
        proxy_pass http://127.0.0.1:3099;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Caddy Beispiel

```
stream.deinedomain.at {
    reverse_proxy localhost:3099
}
```

**Empfehlung:** Passwortschutz einrichten (z.B. Basic Auth), da das Panel volle Kontrolle ueber den Stream-Bot hat.
