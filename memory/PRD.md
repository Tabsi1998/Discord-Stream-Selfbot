# Discord Stream Selfbot - PRD

## Problem Statement
Web-basiertes Control Panel zum Planen und Verwalten von Discord Streams ueber einen Self-Bot.
Unterstuetzt YouTube, Twitch, Direkt-URLs und MPEG-TS Streams (Dispatcharr/IPTV).

## Architektur
- **Production**: Node.js / Express / TypeScript + Vanilla JS Frontend + JSON File Persistenz
- **Preview**: React Frontend + FastAPI Backend + MongoDB (Emergent)
- **Deployment**: Docker via control-panel.Dockerfile + docker-compose.yml

## Implementiert
- [x] UI Dark Theme (Discord-Style)
- [x] Quality Profiles: 720p-4K, 30/60fps
- [x] Interactive Shell Scripts (install.sh, update.sh, config.sh)
- [x] GitHub Actions CI Fixes
- [x] Docker Build Fixes
- [x] Discord Event Sync (Create, Start, Cancel, Complete, Update)
- [x] yt-dlp Auto-Switch
- [x] Stream Stabilitaet: FFmpeg Reconnect + MPEG-TS Erkennung
- [x] MPEG-TS/Dispatcharr Support mit Resilience-Flags
- [x] Stream Health Monitoring (Live Uptime Counter)
- [x] URL Test Button
- [x] Adaptive Polling
- [x] Discord Badge fuer synced Events
- [x] **Queue/Playlist System** - Add/Remove/Clear/Start/Stop/Skip/Loop/Reorder
- [x] **Kalender-Ansicht** - Wochen- und Monatsansicht mit Events
- [x] **Neue Discord Commands** - queue, info, logs, restart
- [x] **Benachrichtigungen** - Discord Webhook + DM Notifications
- [x] Komplette Dokumentation (README, COMMANDS, IDEAS, SELFHOSTING)

## API Endpoints
### Core
- GET /api/bootstrap, GET /api/state, GET /api/stream/health
- GET/POST /api/channels, DELETE /api/channels/:id
- GET/POST /api/presets, DELETE /api/presets/:id, POST /api/presets/test-url
- GET/POST /api/events, PUT/DELETE /api/events/:id
- POST /api/manual/start, POST /api/stop

### Queue (NEU)
- GET /api/queue - Queue + Config abrufen
- POST /api/queue - Item hinzufuegen
- DELETE /api/queue/:id - Item entfernen
- POST /api/queue/clear - Queue leeren
- POST /api/queue/loop - Loop an/aus
- POST /api/queue/start - Queue starten (channelId + presetId)
- POST /api/queue/skip - Item ueberspringen
- POST /api/queue/stop - Queue stoppen
- POST /api/queue/reorder - Reihenfolge aendern

### Notifications (NEU)
- POST /api/notifications/test - Test-Benachrichtigung senden

## Discord Commands
$panel help | status | start | stop | restart | channels | presets | events
$panel event start/cancel <id>
$panel queue | queue add | queue start | queue stop | queue skip | queue clear | queue loop on/off
$panel info | logs [n]

## Offene Tasks
### P1
- Graceful Shutdown (FFmpeg Cleanup)
- WebSocket statt Polling

### P2
- Import/Export (JSON Backup)
- Erweiterte Wiederholungsregeln
- Multi-Server Support
- Automatischer Quell-Fallback
- RTMP Ingest
- EPG Integration
- Stream-Statistiken
- TypeScript Strict Mode
