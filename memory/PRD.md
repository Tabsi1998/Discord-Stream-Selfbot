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
- [x] Komplette Dokumentation (README, COMMANDS, IDEAS, SELFHOSTING)

## Offene Tasks
### P1
- Playlist/Queue System
- Benachrichtigungen (DM/Webhook)
- Stream Kalender-Ansicht
- Graceful Shutdown

### P2
- WebSocket statt Polling
- Stream-Statistiken
- Import/Export
- Erweiterte Wiederholungsregeln
- Multi-Server Support
- Automatischer Quell-Fallback
- TypeScript Strict Mode
