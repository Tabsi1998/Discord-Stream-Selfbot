# Discord Stream Selfbot - PRD

## Original Problem Statement
Discord Stream Selfbot from https://github.com/Tabsi1998/Discord-Stream-Selfbot - install, run, fix YouTube bot-detection issues.

## Architecture
- Node.js Control Panel (port 3099) + FastAPI Proxy (port 8001) + React Frontend (port 3000)
- Tech: Node.js 22, TypeScript, Express, FFmpeg, yt-dlp with OAuth2 plugin

## Implemented (2026-03-26)
- [x] Full project installation and build
- [x] yt-dlp bot-detection fix (6 YouTube client fallbacks)
- [x] Stuck stream session fix (10s timeout)
- [x] **Google OAuth2 one-click authentication** (einmal einrichten, laeuft fuer immer)
- [x] Cookie upload/delete/status as fallback
- [x] Auto-discovery of cookie files and OAuth2 tokens
- [x] Full React frontend with all CRUD operations

## Backlog
- [ ] DISCORD_TOKEN konfigurieren
- [ ] OAuth2 mit echtem Google Account testen
- [ ] Queue System Frontend UI
- [ ] Discord Webhook Notifications
