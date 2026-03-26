# Ideen & Erweiterungsmoeglichkeiten

> Was mit dem Discord Stream Selfbot noch alles moeglich waere.
> Sortiert nach Aufwand und Nutzen.

---

## Leicht umsetzbar (Quick Wins)

### Playlist / Queue System
**Was:** Mehrere URLs hintereinander abspielen statt nur eine.
**Wie:** Eine Queue im Backend die nach Ende eines Streams automatisch den naechsten startet.
**Nutzen:** Filmabend mit mehreren Episoden, DJ-Set mit verschiedenen Tracks.

```
Beispiel:
Queue: [Film1.mp4, Film2.mp4, Film3.mp4]
→ Film1 fertig → Film2 startet automatisch → Film3 startet automatisch → fertig
```

### Mehr Discord Commands

| Neuer Befehl | Was er tut |
|-------------|-----------|
| `$panel queue add <url>` | URL zur Warteschlange hinzufuegen |
| `$panel queue list` | Aktuelle Queue anzeigen |
| `$panel queue clear` | Queue leeren |
| `$panel queue skip` | Naechstes Item in der Queue |
| `$panel info` | Detaillierte System-Info (CPU, RAM, FFmpeg Version) |
| `$panel logs [n]` | Letzte n Log-Eintraege anzeigen |
| `$panel preset show <name>` | Details eines Presets anzeigen |
| `$panel restart` | Stream neu starten (gleiche Quelle) |
| `$panel switch <preset>` | Preset wechseln ohne Stream zu stoppen |
| `$panel mute` / `$panel unmute` | Audio an/aus |
| `$panel volume <0-100>` | Lautstaerke aendern (wenn technisch machbar) |

### Benachrichtigungen

**Was:** Push-Benachrichtigung wenn ein Stream startet, endet oder crashed.
**Optionen:**
- Discord DM an dich selbst
- Discord Webhook in einen Kanal
- Optional: Telegram Bot, Email

**Beispiel:**
```
[Stream gestartet] Gaming Kanal → YouTube HD | 20:00
[Stream beendet] Gaming Kanal | Laufzeit: 03:14:22
[FEHLER] Stream abgestuerzt! FFmpeg Exit Code: 1
```

### Import / Export

**Was:** Alle Einstellungen (Channels, Presets, Events) als JSON exportieren/importieren.
**Nutzen:** Backup, Migration auf anderen Server, Konfiguration teilen.

```bash
# Export
curl http://localhost:3099/api/state > backup.json

# Import
curl -X POST http://localhost:3099/api/import -d @backup.json
```

---

## Mittel (Lohnt sich)

### Kalender-Ansicht

**Was:** Wochen-/Monatskalender im Web Panel der alle Events visuell darstellt.
**Nutzen:** Auf einen Blick sehen wann was streamt, Luecken und Ueberschneidungen erkennen.

### Stream-Statistiken

**Was:** Aufzeichnen wie lange Streams liefen, wie oft sie crashten, durchschnittliche Bitrate.
**Anzeige im Dashboard:**
```
Heute:      3 Streams | 8h 23min Laufzeit | 0 Fehler
Diese Woche: 21 Streams | 58h Laufzeit | 2 Fehler
Gesamt:     342 Streams | 1240h Laufzeit | 15 Fehler
```

### WebSocket fuer Real-time Updates

**Was:** Statt Polling (alle paar Sekunden neu laden) eine WebSocket Verbindung.
**Nutzen:** Sofortige Updates im Dashboard, weniger Server-Last, bessere Uptime-Anzeige.

### Multi-Server Support

**Was:** In mehreren Discord Servern gleichzeitig streamen.
**Wie:** Mehrere Streamer-Instanzen parallel laufen lassen, jeder mit eigenem FFmpeg Prozess.
**Einschraenkung:** Braucht mehr CPU/RAM, und Discord koennte das als verdaechtig werten.

### Erweiterte Wiederholungsregeln

**Was:** Komplexere Scheduling-Muster.
**Beispiele:**
- "Jeden zweiten Dienstag"
- "Am ersten Montag im Monat"
- "Montag bis Freitag von 20:00 bis 23:00"
- "Nur an Feiertagen"

### Automatischer Quell-Fallback

**Was:** Wenn die primaere Quelle nicht erreichbar ist, automatisch auf eine Backup-Quelle wechseln.
**Beispiel:**
```
Primaer: http://192.168.2.104:9191/proxy/ts/stream/abc
Fallback: http://192.168.2.104:9191/proxy/ts/stream/xyz
Notfall: /data/offline-screen.mp4
```

---

## Groesser (Aufwaendig aber cool)

### Web-basierter Stream-Monitor

**Was:** Live-Preview des Streams direkt im Web Panel.
**Wie:** FFmpeg erzeugt parallel einen niedrig-aufgeloesten HLS Stream der im Browser angezeigt wird.
**Nutzen:** Sehen was Discord-User sehen, ohne Discord oeffnen zu muessen.

### RTMP Ingest

**Was:** OBS oder andere Software streamt an den Selfbot.
**Wie:** nginx-rtmp Modul im Docker Container, FFmpeg liest den RTMP Stream.
**Ablauf:**
```
OBS → RTMP → nginx-rtmp → FFmpeg → Discord
```
**Nutzen:** Alles was OBS kann, landet auf Discord. Szenen, Overlays, Kamera, etc.

### EPG Integration (Elektronische Programmzeitschrift)

**Was:** IPTV Programm-Guide automatisch in Events umwandeln.
**Wie:** EPG XML/JSON vom IPTV Provider lesen, relevante Sendungen als Events erstellen.
**Nutzen:** "Streame jede Champions League Uebertragung automatisch in den Fussball-Kanal."

### Watch Party / Synchronisation

**Was:** Mehrere Self-Bots auf verschiedenen Servern den gleichen Stream gleichzeitig abspielen.
**Nutzen:** "Watch Party" ueber mehrere Discord Server hinweg.

### Discord Activity Integration

**Was:** Statt normalem Go-Live eine Discord Activity starten mit Custom Controls.
**Einschraenkung:** Activities sind Bot-only, Self-Bots koennen das vermutlich nicht.

### REST API fuer externe Steuerung

**Was:** Vollstaendige API Dokumentation fuer Drittanbieter-Integration.
**Nutzen:** Home Assistant, Node-RED, IFTTT, eigene Scripts koennen Streams steuern.

```bash
# Stream starten
curl -X POST http://localhost:3099/api/manual/start \
  -H "Content-Type: application/json" \
  -d '{"channelId": "ch_abc", "presetId": "pr_def"}'

# Stream stoppen
curl -X POST http://localhost:3099/api/stop

# Status abfragen
curl http://localhost:3099/api/stream/health
```

---

## Was technisch NICHT geht (Limits)

| Limitation | Grund |
|-----------|-------|
| Mehrere Streams pro Account | Discord erlaubt nur 1 Go-Live pro Account |
| Bot-Token verwenden | Discord blockiert Video von Bot-Accounts |
| Audio in hoher Qualitaet | Discord komprimiert Audio auf ~128kbps Opus |
| 4K tatsaechlich anzeigen | Discord Clients cappen meistens bei 1080p/720p |
| Eigene Video-Player UI | Go-Live zeigt nur den Stream, keine Custom Controls |
| DRM-geschuetzte Inhalte | FFmpeg kann kein Widevine/PlayReady |

---

## Self-Bot Moeglichkeiten generell

Ein Discord Self-Bot kann theoretisch alles was ein normaler Discord Account kann:

| Aktion | Moeglich? | Risiko |
|--------|-----------|--------|
| Nachrichten lesen/senden | Ja | Mittel |
| Voice Channels beitreten | Ja | Niedrig |
| Video/Audio streamen | Ja | Mittel |
| Reactions setzen | Ja | Hoch (Spam-Detection) |
| Server beitreten/verlassen | Ja | Hoch |
| Rollen aendern | Ja (mit Rechten) | Hoch |
| Scheduled Events erstellen | Ja | Niedrig |
| Threads erstellen | Ja | Mittel |
| DMs senden | Ja | Sehr hoch |
| Dateien hochladen | Ja | Mittel |

**Generelle Regel:** Je mehr Aktionen pro Zeiteinheit, desto hoeher das Ban-Risiko. Streaming allein ist relativ sicher weil es eine einzelne, langlebige Aktion ist.

---

## Mein Empfehlungen (Top 5)

1. **Playlist/Queue** - Groesster Mehrwert fuer den geringsten Aufwand
2. **Benachrichtigungen** - Wissen was passiert ohne dauernd reinschauen zu muessen
3. **Stream-Statistiken** - Ueberblick ueber Zuverlaessigkeit
4. **Automatischer Fallback** - Stream laeuft weiter auch wenn eine Quelle stirbt
5. **Kalender-Ansicht** - Events besser planen und visualisieren

---

## Willst du was davon umgesetzt haben?

Sag einfach welches Feature dich am meisten interessiert und wir bauen es!
