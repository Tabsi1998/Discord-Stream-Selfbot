# Discord Stream Selfbot Control Panel - PRD

## Originale Problem-Beschreibung
GitHub Repo klonen (https://github.com/Tabsi1998/Discord-Stream-Selfbot), zum Laufen bringen, komplett analysieren und Verbesserungen identifizieren. Fokus auf Frontend UI und generelle Code-Verbesserungen. Plan fuer weitere Entwicklung erstellen.

## Architektur

### Original (aus GitHub Repo)
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: Vanilla HTML/CSS/JS (statische Dateien)
- **State**: JSON-File basiert (kein Datenbank)
- **Streaming**: discord-video-stream Library + FFmpeg + yt-dlp

### Portiert (aktuell laufend)
- **Backend**: Python FastAPI + Motor (MongoDB async)
- **Frontend**: React 18 + Tailwind CSS
- **Datenbank**: MongoDB
- **Hosting**: Emergent Platform (port 8001 backend, port 3000 frontend)

## Was wurde implementiert (19.03.2026)

### Shell Scripts (komplett neu geschrieben)
- **install.sh**: Interaktiv mit Farben, 5-Schritt-Flow (Voraussetzungen, Discord Token + User-IDs, Web Panel Port/TZ, Chat-Befehle/yt-dlp/Scheduler, Zusammenfassung & Start). Bestehende .env als Basis verwendbar. Validierung aller Eingaben. Geheime Token-Eingabe.
- **update.sh**: Git-Update OHNE Datenverlust. Automatisches .env + State Backup. Zeigt verfuegbare Commits an. Stash-Support fuer lokale Aenderungen. Container rebuild nach Update. Restore bei Fehler.
- **config.sh**: Menue-basiert (1-7 + a fuer alles). Zeigt aktuelle Werte, aendert gezielt einzelne Einstellungen. Container-Neustart optional.

### Quality Profiles (aktualisiert)
- "Original" entfernt
- 2160p30 (4K / 30 FPS - 3840x2160) hinzugefuegt
- 2160p60 (4K / 60 FPS - 3840x2160) hinzugefuegt
- 4K Bitrate-Empfehlungen: H264 10-18Mbps, H265 8.2-15.3Mbps

### Backend (server.py)
- GET /api/health - Health Check
- GET /api/bootstrap - Kompletter App-State
- GET /api/state - State ohne Voice Channels
- GET /api/profiles - Quality & Buffer Profile Definitionen
- GET /api/recommend-bitrate - Bitrate-Empfehlung berechnen
- POST/PUT/DELETE /api/channels - CRUD fuer Discord Voice Channels
- POST/PUT/DELETE /api/presets - CRUD fuer Stream Presets (mit Normalisierung)
- POST/PUT/DELETE /api/events - CRUD fuer Events (mit Recurrence)
- POST /api/events/{id}/start - Event starten
- POST /api/events/{id}/cancel - Event abbrechen
- POST /api/manual/start - Manueller Stream-Start
- POST /api/stop - Aktiven Stream stoppen
- GET /api/logs - Letzte Logs

### Frontend (React)
- Dashboard: Status-Karten, Manueller Start, System-Info, Letzte Logs
- Kanaele: CRUD-Formular, Liste mit Edit/Delete
- Presets: Tabs (Allgemein, Video, Audio, Erweitert), Quality Profiles, Buffer Profiles
- Events: Einmalig/Taeglich/Woechentlich, Wochentag-Auswahl, Start/Cancel/Delete
- Logs: Filter nach Level (All/Info/Warn/Error)
- Sidebar Navigation mit Active-Run-Anzeige

## User Personas
- **Primaer**: Technisch versierte Discord-Nutzer die Selfbot-Streaming einrichten
- **Sprache**: Deutsch
- **Use Case**: Streams zeitgesteuert in Discord-Voice-Channels abspielen

## Core Requirements (Statisch)
1. Discord Voice Channel Verwaltung (Guild ID + Channel ID)
2. Stream Preset Verwaltung (URL, Quality, Codec, Buffer)
3. Event Scheduling (einmalig, taeglich, woechentlich)
4. Manueller Stream Start/Stop
5. Real-time Status und Logs

## Priorisierter Backlog

### P0 - Kritisch (fuer produktiven Einsatz)
- [ ] Discord Self-Token Integration (WebSocket-Verbindung)
- [ ] FFmpeg-basiertes Streaming zu Discord Voice Channels
- [ ] yt-dlp Integration fuer YouTube/Twitch URLs
- [ ] Scheduler-Service der Events automatisch startet/stoppt

### P1 - Wichtig
- [ ] Voice Channel Discovery (automatisch von Discord laden)
- [ ] Discord Command Bridge (Chat-Befehle zum Steuern)
- [ ] Overlap-Protection (Events duerfen sich nicht ueberschneiden)
- [ ] Bessere Fehlerbehandlung und Retry-Logik
- [ ] WebSocket fuer Real-time UI Updates

### P2 - Nice-to-Have
- [ ] Stream Preview/Monitor
- [ ] Export/Import von Konfigurationen
- [ ] Multi-Account Support
- [ ] Benachrichtigungen (Email/Discord)
- [ ] Dunkler/Heller Theme Toggle
- [ ] Mobile-responsive Optimierung

## Naechste Schritte
1. Code-Review und Verbesserungsplan praesentieren
2. Basierend auf User-Feedback priorisieren
3. Discord-Integration Schritt fuer Schritt umsetzen
