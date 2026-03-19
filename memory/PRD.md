# Discord Stream Selfbot - PRD & Verbesserungsplan

## Was wurde bisher gemacht

### Iteration 1 - Grundsetup (Emergent Preview)
- React + FastAPI + MongoDB Control Panel fuer Emergent Preview
- Discord Dark Theme UI

### Iteration 2 - Shell Scripts & Quality Profiles
- install.sh: Interaktives Setup mit Farben, Token/User-ID Eingabe
- update.sh: Git-Update ohne Datenverlust
- config.sh: Menue-basierte Konfigurationsaenderung
- Quality Profiles: "Original" entfernt, 2160p30 + 2160p60 hinzugefuegt

### Iteration 3 - GitHub CI Fixes
- Biome Formatting in src/media/newApi.ts
- temp_repo Submodule-Fehler behoben
- .gitignore/.dockerignore bereinigt

### Iteration 4 - Docker Build Fix
- prebuild Pfad: Windows-Backslashes auf Linux-Forward-Slashes
- publish_prerelease.yml deaktiviert (pkg-pr-new nicht installiert)

### Iteration 5 - Originalcode Fixes
- Quality Profiles in den echten Quelldateien (types.ts, presetProfiles.ts, app.js, index.html)
- yt-dlp Binary Detection Fix (-version vs --version)
- YouTube URL Auto-Detection (direct -> yt-dlp)
- Frontend Dark Theme CSS fuer Docker-Deployment

### Iteration 6 - Discord Event Sync
- Automatische Discord Scheduled Event Erstellung bei Event-Anlage
- Discord Event Loeschung bei Event-Cancel/Delete
- Discord Event Status "Active" bei Event-Start
- discordEventId Feld in ScheduledEvent Typ

## Verbesserungsvorschlaege (Priorisiert)

### P0 - Sollte als Naechstes gemacht werden

1. **Event-Update -> Discord Event Update**
   Aktuell wird beim Bearbeiten eines Events das Discord Event nicht aktualisiert.
   Fix: Bei updateEvent altes Discord Event loeschen und neues erstellen.

2. **Event Completed -> Discord Event Status**
   Wenn ein Event fertig ist (Stream endet planmaessig), sollte das Discord Event
   auf Status "Completed" (3) gesetzt werden.

3. **Fehlerbehandlung bei Discord Offline**
   Wenn Discord nicht verbunden ist, sollten Events trotzdem erstellt werden koennen.
   Die Discord-Sync sollte dann nachgeholt werden sobald die Verbindung steht.
   -> Queue-System fuer ausstehende Discord Events

4. **Frontend: Discord Event Status anzeigen**
   In der Event-Liste ein kleines Discord-Icon zeigen wenn ein Discord Event
   verknuepft ist. Tooltip mit Discord Event ID.

### P1 - Wichtige Verbesserungen

5. **WebSocket fuer Real-time Updates**
   Aktuell pollt das Frontend alle 5 Sekunden. WebSocket wuerde:
   - Sofortige Status-Updates bei Stream Start/Stop
   - Live Log-Stream
   - Weniger Server-Last

6. **Overlap-Protection Verbesserung**
   Aktuell nur pro Channel. Sollte auch global pruefen ob der Bot
   bereits in einem anderen Channel streamt (nur 1 Stream gleichzeitig moeglich).

7. **Stream Health Monitoring**
   FFmpeg-Prozess ueberwachen:
   - CPU/RAM Verbrauch
   - Dropped Frames zaehlen
   - Bitrate-Schwankungen erkennen
   - Automatischer Restart bei Crash

8. **Preset Vorschau/Test**
   "URL testen" Button der kurz prueft ob die Quelle erreichbar ist
   (HTTP HEAD Request oder yt-dlp --simulate) bevor ein Event erstellt wird.

9. **Event-Kalender Ansicht**
   Wochen/Monats-Kalender statt nur Liste. Drag & Drop zum Verschieben.

### P2 - Nice-to-Have

10. **Export/Import Konfiguration**
    Channels, Presets und Events als JSON exportieren/importieren.
    Nuetzlich fuer Backup oder Migration.

11. **Multi-Stream Support Vorbereitung**
    Architektur vorbereiten fuer mehrere gleichzeitige Streams
    (mehrere Discord Accounts).

12. **Stream-Statistiken**
    Wie lange wurde in welchem Channel gestreamt?
    Erfolgsrate der Events? Durchschnittliche Dauer?

13. **Benachrichtigungen**
    Discord DM oder Webhook-Nachricht wenn:
    - Stream startet/stoppt
    - Event fehlschlaegt
    - yt-dlp URL nicht aufloesbar

14. **Mobile-Responsive UI**
    Das Control Panel auch vom Handy bedienbar machen.

15. **Twitch/YouTube Chat Relay**
    Chat aus Twitch/YouTube Streams als Overlay oder
    in einen Discord Text-Channel spiegeln.

### Code-Qualitaet Verbesserungen

16. **Error Boundaries im Frontend**
    Einzelne Sektionen sollen bei JS-Fehler nicht die ganze Seite killen.

17. **Rate Limiting auf API**
    Schutz gegen versehentliche Spam-Requests.

18. **Input Sanitization**
    XSS-Schutz fuer Name/Description Felder die im HTML gerendert werden.

19. **Structured Logging**
    JSON-formatierte Logs mit Timestamp, Level, Context fuer besseres Debugging.

20. **TypeScript Strict Mode**
    tsconfig.json auf strict: true setzen. Aktuell sind einige
    implicit-any und nullable Typen nicht abgefangen.
