# Discord Stream Selfbot - Control Panel

## Originales Problem
Web-basiertes Control Panel zum Planen und Verwalten von Discord Streams ueber einen Self-Bot. Unterstuetzt YouTube, Twitch, Direkt-URLs und MPEG-TS Streams (Dispatcharr/IPTV).

## Architektur
- **Production Stack**: Node.js / Express / TypeScript mit Vanilla JS Frontend
- **Preview Stack**: React Frontend + FastAPI Backend + MongoDB (Emergent Preview)
- **Quellcode**: `/app/examples/control-panel/` (Control Panel), `/app/src/` (Core Library)
- **State**: File-based JSON (`control-panel-state.json`) in Production, MongoDB in Preview
- **Deployment**: Docker via `control-panel.Dockerfile` + `docker-compose.yml`

## Kernfunktionen
1. Channel-Verwaltung (Discord Voice Channels konfigurieren)
2. Preset-Verwaltung (Stream-Quellen, Qualitaet, Buffer, Encoder)
3. Event-Planung (Zeitgesteuerte Streams mit Wiederholung)
4. Manueller Stream-Start/Stop
5. Discord Event-Synchronisation (Create, Start, Cancel, Complete, Update)
6. Stream Health Monitoring (Live Uptime Counter)
7. MPEG-TS/Dispatcharr Stream-Erkennung
8. URL-Erreichbarkeitstest
9. yt-dlp Auto-Erkennung (YouTube/Twitch)
10. Interaktive Install/Update/Config Shell-Skripte

## Implementiert
- [x] UI Overhaul: Modernes Discord-Dark-Theme
- [x] Quality Profiles: 720p-4K, 30/60fps (Original entfernt)
- [x] Interactive Shell Scripts: install.sh, update.sh, config.sh
- [x] GitHub Actions CI Fixes (Biome, Submodules, Workflows)
- [x] Docker Build Fixes (Path Separators, .dockerignore)
- [x] Discord Event Sync: Create, Start, Cancel, Complete, Update
- [x] yt-dlp Auto-Switch bei YouTube/Twitch URLs
- [x] Stream Stabilitaet: FFmpeg Reconnect-Flags, MPEG-TS Erkennung
- [x] MPEG-TS/Dispatcharr Support: Resilience-Flags, kein readrate fuer Live-TS
- [x] Stream Health Monitoring: Live Uptime Counter im Dashboard
- [x] URL-Test Button: Preset URLs auf Erreichbarkeit pruefen
- [x] Adaptive Polling: 3s bei aktivem Stream, 8s im Leerlauf
- [x] Discord Badge: Synced Events im Frontend markiert
- [x] TypeScript Fixes: setStatus("COMPLETED") statt numerische Codes
- [x] React Frontend: Vollstaendiges Dashboard, Channels, Presets, Events, Logs

## API Endpoints
- GET /api/bootstrap - Gesamtstatus
- GET /api/stream/health - Stream Health Info (aktiv/inaktiv, uptime)
- POST /api/presets/test-url - URL Erreichbarkeitstest
- GET/POST /api/channels - Channel CRUD
- GET/POST /api/presets - Preset CRUD
- GET/POST /api/events - Event CRUD
- POST /api/manual/start - Manueller Stream-Start
- POST /api/stop - Stream stoppen
- GET /api/logs - Logs abrufen

## Offene Tasks

### P1 - Naechste Schritte
- Stream Kalender-Ansicht (Wochen-/Monatskalender)
- Graceful Shutdown: FFmpeg-Prozesse sauber beenden
- WebSocket fuer Real-time Updates statt Polling
- Import/Export Funktionalitaet (JSON Backup)

### P2 - Zukunft
- Erweiterte Wiederholungsregeln ("jeden zweiten Dienstag")
- Overlap-Protection global
- Stream-Statistiken (Laufzeit, Fehlerrate)
- Benachrichtigungen (Discord DM/Webhook)
- Multi-Stream Vorbereitung
- Mobile-Responsive Optimierung
- Structured Logging
- TypeScript Strict Mode aktivieren

## Bekannte Einschraenkungen
- Discord-Funktionen nur mit gueltigem Self-Token testbar
- Preview-Umgebung nutzt FastAPI/MongoDB statt Node.js/File-based JSON
- MPEG-TS Streams benoetigen lokale Netzwerk-Erreichbarkeit
