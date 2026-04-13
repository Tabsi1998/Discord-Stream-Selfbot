# Performance Guide

Diese Hinweise beziehen sich auf den aktuellen Control-Panel-/Docker-Pfad des Bots.

## Erstes Ziel: den echten Engpass finden

Nicht jeder schlechte Stream ist ein Encoder-Problem. Typische Engpaesse:

- Quelle ist instabil oder liefert kaputte Timestamps
- CPU oder GPU reicht fuer Qualitaet/FPS nicht
- Netzwerk ist instabil
- yt-dlp oder YouTube blockiert
- Buffer-Profil passt nicht zur Quelle

Nutze zuerst:

- Dashboard-Telemetrie
- `GET /api/stream/health`
- Logs im Panel oder per Docker

Wichtige Telemetrie-Werte:

- `fps`: was FFmpeg aktuell liefert
- `speed`: Transcoding-Geschwindigkeit; deutlich unter `1.0` ist ein Warnsignal
- `bitrateKbps`: reale Datenrate
- `dropFrames`: verlorene Frames
- `dupFrames`: duplizierte Frames

## Empfohlene Startwerte

| Quelle | Solider Startpunkt |
| --- | --- |
| YouTube / Twitch via yt-dlp | `1080p30`, Buffer `balanced` |
| HLS / M3U8 | `1080p30`, Buffer `balanced` oder `stable` |
| MPEG-TS / IPTV / Dispatcharr | `1080p30`, Buffer `stable` |
| Datei / MP4 / lokaler Direktlink | `1080p30`, Buffer `balanced` |
| schwacher Host | `720p30`, Buffer `balanced` |

Wenn du zuerst Stabilitaet willst:

- 30 FPS vor 60 FPS
- `1080p30` vor `1440p60`
- `balanced` oder `stable` vor `low-latency`

## Buffer-Profile richtig einsetzen

### `auto`

- Default
- waehlt Verhalten passend zur Quelle

### `stable`

- fuer IPTV, MPEG-TS, lange Streams und wackelige Quellen
- langsamerer Start, dafuer meist robuster

### `balanced`

- sinnvoller Allround-Default
- guter Mittelweg fuer die meisten Quellen

### `low-latency`

- nur wenn schnelle Reaktion wichtiger ist als Stabilitaet
- empfindlicher bei Lastspitzen und unruhigen Quellen

## Hardware-Encoding

Aktivierte `hardwareAcceleration` im Preset bedeutet im aktuellen Code:

- nicht nur Hardware-Decoding
- sondern auch bevorzugte Auswahl eines passenden Hardware-Encoders

Steuerung per `.env`:

```bash
PREFERRED_HW_ENCODER=auto
FFMPEG_LOG_LEVEL=warning
```

Unterstuetzte Priorisierung:

- `auto`
- `nvenc`
- `vaapi`

### VAAPI

Noetig:

- Host muss `/dev/dri` bereitstellen
- Docker Compose muss das Device durchreichen
- optional `FFMPEG_VAAPI_DEVICE=/dev/dri/renderD128`

### NVENC

Noetig:

- NVIDIA GPU
- `nvidia-container-toolkit`
- Docker Runtime mit GPU-Zugriff

Wenn kein passender Encoder verfuegbar ist, faellt der Bot automatisch auf Software-Encoding zurueck.

## Source-spezifische Hinweise

### yt-dlp / YouTube / Twitch

- Verwende `sourceMode=yt-dlp` oder eine URL, die automatisch erkannt wird.
- Default fuer YouTube ist `YT_DLP_YOUTUBE_EXTRACTOR_ARGS=youtube:player_client=android`.
- Bei Problemen zuerst `./update.sh --fresh`, damit yt-dlp ohne Build-Cache neu gebaut wird.
- Wenn YouTube weiter blockiert:
  - Cookies nutzen
  - oder den OAuth2-Flow im Panel starten

### MPEG-TS / IPTV / Dispatcharr

Das Projekt erkennt solche Quellen und behandelt sie konservativer. Fuer diesen Typ gilt fast immer:

- Buffer `stable`
- keine aggressive Latenzoptimierung
- lieber 30 FPS statt 60 FPS

### HLS / M3U8

HLS ist oft okay mit `balanced`, kann aber bei schwankenden Segmenten `stable` brauchen.

### Direkte Dateien

Dateien oder sehr saubere Direktlinks vertragen oft `balanced` gut und sind der einfachste Lastfall.

## Was du bei Lastproblemen zuerst senken solltest

1. FPS von `60` auf `30`
2. Aufloesung von `1440p` oder `2160p` auf `1080p`
3. Video-Bitrate
4. von `H265` auf `H264`, falls dein Setup mit H265 schlechter laeuft
5. Buffer-Profil auf `stable`, wenn die Quelle selbst wackelt

## Host- und Docker-Tipps

- gib dem Host genug CPU-Reserven
- vermeide parallel zu viele 60-FPS-Streams auf demselben Bot
- pruefe, ob die Quelle lokal schneller/stabiler erreichbar ist
- bei Reverse Proxies nur das Panel proxyen; der eigentliche Stream laeuft ueber Discord, nicht ueber HTTP
- halte yt-dlp aktuell, wenn du stark von YouTube abhaengst

## Wann `./update.sh --fresh` sinnvoll ist

Typische Faelle:

- YouTube-Link ging frueher, jetzt nicht mehr
- yt-dlp soll sicher neu gezogen werden
- Docker hat alte Layer gecacht

```bash
./update.sh --fresh
```

## Realistische Erwartungen

- `2160p60` ist nur mit sehr starken Hosts sinnvoll.
- `1440p60` ist bereits deutlich anspruchsvoller als `1080p60`.
- fuer die meisten produktiven Setups ist `1080p30` oder `1080p60` die bessere Wahl.

## Historischer Hinweis

Aeltere Dokumentation zu AES-/ChaCha-Benchmarks aus dem frueheren UDP-Pfad ist fuer den aktuellen Control-Panel-Betrieb nicht mehr der relevante Tuning-Hebel. Der heutige Deploy-Pfad arbeitet ueber den aktuellen WebRTC-basierten Stack; fuer den Bot-Betrieb sind Quelle, FFmpeg-Last, Buffering und Hardware-Encoding die entscheidenden Punkte.
