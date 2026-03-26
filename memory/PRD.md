# Discord Stream Selfbot - PRD

## Original Problem Statement
User wants to clone, install and run the Discord-Stream-Selfbot from https://github.com/Tabsi1998/Discord-Stream-Selfbot in the Emergent preview environment. The main issues from the user's logs were:
1. YouTube yt-dlp "Sign in to confirm you're not a bot" errors
2. "Force-closing stuck stream session" warnings
3. Stream failures due to yt-dlp authentication issues

## Architecture
- **Node.js Control Panel** (port 3099): Express server serving API + static files
- **FastAPI Proxy** (port 8001): Proxies /api/* requests to the Node.js control panel
- **React Frontend** (port 3000): Renders the control panel UI
- **Tech Stack**: Node.js 22 + TypeScript, Express, discord.js-selfbot-v13, FFmpeg, yt-dlp
- **Persistence**: JSON file-based state (no external DB)

## What's Been Implemented

### Session 1 (2026-03-26)
- [x] Cloned and built the full project (main library + control panel)
- [x] Installed Node.js 22.22.2, FFmpeg 5.1.8, yt-dlp 2026.03.21.233500
- [x] Configured supervisor to run Node.js control panel + FastAPI proxy + React frontend
- [x] React frontend renders full control panel UI with all CRUD operations
- [x] All API endpoints working: channels, presets, events, queue, stream control
- [x] **Fixed yt-dlp bot-detection**: Added 6 YouTube client fallbacks (default, android, ios, web_creator, mweb, tv)
- [x] **Fixed stuck stream sessions**: Increased force-close timeout from 5s to 10s
- [x] **Enhanced error messages**: Added rate-limiting and geo-restriction detection

### Session 2 (2026-03-26)
- [x] **Cookie Management System**: Full web-based cookie upload/delete/status via API
- [x] Cookie upload via file picker or paste (Netscape cookies.txt format)
- [x] "Wie geht das?" how-to instructions built into the panel
- [x] Auto-discovery of cookie files in cookies/ directory (no ENV config needed)
- [x] Cookie validation (rejects invalid formats)
- [x] Full lifecycle: upload -> status check -> delete

## Prioritized Backlog
### P0 (Critical)
- [ ] Configure DISCORD_TOKEN for live Discord connectivity
- [ ] Upload real YouTube cookies via the new Cookie Management panel

### P1 (Important)
- [ ] Test actual streaming with a real Discord account
- [ ] Test MPEG-TS/IPTV streaming
- [ ] Queue system frontend UI

### P2 (Nice to Have)
- [ ] Discord notification webhook
- [ ] Auto-update yt-dlp
- [ ] Cookie freshness monitoring/auto-refresh
