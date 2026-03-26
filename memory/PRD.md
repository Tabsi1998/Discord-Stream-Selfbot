# Discord Stream Selfbot - PRD

## Aenderungen (11 Dateien)

### Neue Features:
- YouTube OAuth2 Login (einmal einrichten, laeuft fuer immer)
- Cookie Upload/Delete ueber Web-Panel
- 6 YouTube-Client Fallbacks gegen Bot-Detection
- Smart Update (mit Cache statt --no-cache)
- Config aendern ohne komplett neu zu bauen

### Geaenderte Dateien:
1. `examples/control-panel/src/server/createServer.ts` - OAuth2 + Cookie API
2. `examples/control-panel/src/runtime/SourceResolver.ts` - Multi-Client Retry + Auto-OAuth2
3. `examples/control-panel/src/runtime/StreamRuntime.ts` - Timeout Fix
4. `examples/control-panel/src/services/ControlPanelService.ts` - appendLog
5. `examples/control-panel/public/index.html` - YouTube Login UI
6. `examples/control-panel/public/js/app.js` - OAuth2 + Cookie JS
7. `docker/control-panel.Dockerfile` - OAuth2 Plugin
8. `deploy/docker-compose.yml` - Token Persistenz Volume
9. `config.sh` - Kein unnoetigr Rebuild
10. `update.sh` - Smart Build
11. `install.sh` + `deploy/deploy-lib.sh` - Cache Dir

### Deployment:
1. Save to GitHub (hier im Chat)
2. Auf Server: `./update.sh`
3. Im Panel: "Jetzt mit Google anmelden" klicken
