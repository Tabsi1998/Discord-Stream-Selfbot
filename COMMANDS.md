# Command Reference

Diese Referenz beschreibt den aktuellen Command-Pfad des deploybaren Bots in `examples/control-panel/`.

## Wie Commands ins System kommen

Es gibt drei reale Wege:

1. primaerer Selfbot
2. Zusatz-Selfbots mit `command_enabled=1`
3. optional ein normaler Discord Bot ueber `CONTROL_BOT_TOKEN`

Wichtig:

- Sobald ein normaler Control-Bot aktiv ist, antworten die Selfbots nicht mehr auf Text-Commands.
- Bot-Mention als Prefix funktioniert nur beim normalen Control-Bot.
- Slash-Commands werden nur ueber den normalen Control-Bot registriert.
- Slash-Commands werden nie global angelegt, sondern nur guild-spezifisch.

## Prefixe

- primaeres Prefix: `COMMAND_PREFIX`, Default `$panel`
- zusaetzliche Prefixe: `COMMAND_PREFIX_ALIASES`, komma-getrennt
- beim normalen Bot zusaetzlich die Bot-Mention

Beispiel:

```bash
COMMAND_PREFIX=$panel
COMMAND_PREFIX_ALIASES=?,!panel
```

Dann sind z. B. diese Varianten gueltig:

```text
$panel help
?help
!panel status
```

## Wer darf Commands ausfuehren

### Ohne normalen Control-Bot

- die eingeloggten Selfbot-Accounts selbst

### Mit normalem Control-Bot

- Selfbot-Accounts
- zusaetzlich die IDs aus `COMMAND_ALLOWED_AUTHOR_IDS`

Wenn normale User nichts ausfuehren duerfen, hilft fast immer:

```text
$panel whoami
```

Damit siehst du die erkannte Discord-ID und den aktuellen Freigabemodus.

## Slash-Command Guild-Auswahl

Wenn `CONTROL_BOT_COMMAND_GUILD_IDS` gesetzt ist, werden genau diese Guilds genutzt.

Wenn die Variable leer bleibt, nimmt der Code zuerst:

1. Guilds aus den gespeicherten Kanaelen
2. falls das nicht greift und genau eine Guild sichtbar ist, diese einzelne Guild

## Text-Commands: Kurzuebersicht

| Command | Zweck |
| --- | --- |
| `help` | Befehlsliste anzeigen |
| `whoami` | eigene Discord-ID und Command-Freigabe pruefen |
| `play <url> \| [stopAt] \| [quality]` | URL direkt im aktuellen Voice-Channel starten |
| `start <url> \| [stopAt] \| [quality]` | Alias fuer Quick-Play |
| `start <channel> \| <preset> \| [stopAt]` | gespeicherten Kanal mit Preset starten |
| `status` | aktive Streams anzeigen |
| `stop` | aktive Streams stoppen |
| `restart [target]` | aktiven Stream neu starten |
| `channels` | gespeicherte Kanaele auflisten |
| `presets` | gespeicherte Presets auflisten |
| `events` | kommende oder laufende Events anzeigen |
| `event start <id>` | geplantes Event sofort starten |
| `event cancel <id>` | Event abbrechen |
| `queue` | Queue-Status anzeigen |
| `queue add <url> \| [name]` | Queue-Eintrag anlegen |
| `queue start <channel> \| <preset>` | Queue starten |
| `queue stop` | Queue stoppen |
| `queue skip` | naechsten Queue-Eintrag spielen |
| `queue clear` | Queue leeren |
| `queue loop on` / `off` | Loop umschalten |
| `info` | Runtime- und Systeminfo anzeigen |
| `logs [n]` | letzte Logs anzeigen |

## Slash-Commands: Kurzuebersicht

| Slash-Command | Zweck |
| --- | --- |
| `/help` | Befehlsliste |
| `/whoami` | Freigabe und ID |
| `/status` | aktive Streams |
| `/play url stop_at quality` | Quick-Play im aktuellen Voice-Channel |
| `/start channel preset stop_at` | gespeicherten Kanal mit Preset starten |
| `/stop` | aktive Streams stoppen |
| `/restart target` | aktiven Stream neu starten |
| `/channels` | Kanaele auflisten |
| `/presets` | Presets auflisten |
| `/events` | Events auflisten |
| `/event start id` | Event starten |
| `/event cancel id` | Event abbrechen |
| `/queue status` | Queue anzeigen |
| `/queue add url name` | Queue-Eintrag anlegen |
| `/queue start channel preset` | Queue starten |
| `/queue stop` | Queue stoppen |
| `/queue skip` | Queue ueberspringen |
| `/queue clear` | Queue leeren |
| `/queue loop enabled` | Queue-Loop setzen |
| `/info` | Runtime-Info |
| `/logs count` | Logs anzeigen |

## Quick-Play: Details

### Syntax

```text
$panel play <url> | [stopAt] | [quality]
$panel start <url> | [stopAt] | [quality]
```

Beispiele:

```text
$panel play https://www.youtube.com/watch?v=atRP5-nOfRY
$panel play https://example.com/live.m3u8 | 2026-04-30 22:30
$panel play https://example.com/live.m3u8 | 1080p60
$panel play https://example.com/live.m3u8 | 2026-04-30 22:30 | 1440p30
```

Verhalten:

- nutzt den aktuellen Voice-Channel des Absenders
- wenn genau ein gespeicherter Stream-Kanal existiert, funktioniert `play` auch ohne aktuellen Voice-Channel
- erkennt YouTube/Twitch-Links und schaltet intern auf `yt-dlp`

Unterstuetzte Quick-Play-Qualitaeten:

- `auto`
- `720p30`
- `720p60`
- `1080p30`
- `1080p60`
- `1440p30`
- `1440p60`

## Gespeicherte Kanaele und Presets starten

### Syntax

```text
$panel start <channel> | <preset> | [stopAt]
```

Beispiele:

```text
$panel start Gaming Kanal | YouTube HD
$panel start gaming | youtube
$panel start 1234567890 | abcdef123456
$panel start Gaming Kanal | YouTube HD | 2026-12-31 23:00
```

Hinweise:

- Kanal und Preset duerfen per Name oder interner ID referenziert werden
- wenn mehrere Treffer moeglich sind, bricht der Command mit einem Fehler ab

## Status, Stop und Restart

### Status

```text
$panel status
```

Zeigt alle aktiven Streams, nicht nur einen.

### Stop

```text
$panel stop
```

Verhalten:

- bei genau einem aktiven Stream wird dieser gestoppt
- bei mehreren aktiven Streams werden alle aktiven Streams gestoppt

### Restart

```text
$panel restart
$panel restart backup-bot
$panel restart Gaming Kanal
```

Verhalten:

- uebernimmt Kanal, Preset und vorhandene Stoppzeit
- ohne Ziel klappt `restart` nur, wenn genau ein aktiver Stream existiert

## Listen-Commands

```text
$panel channels
$panel presets
$panel events
```

Sie listen gespeicherte Kanaele, Presets und kommende/laufende Events in Textform auf.

## Event-Steuerung

### Direkt starten

```text
$panel event start ev_abc123
```

### Abbrechen

```text
$panel event cancel ev_abc123
```

Hinweis:

- `event start` funktioniert nur fuer Events im Status `scheduled`

## Queue

### Status

```text
$panel queue
```

### URL hinzufuegen

```text
$panel queue add https://example.com/live.m3u8 | Abendprogramm
```

### Start

```text
$panel queue start Gaming Kanal | IPTV Balanced
```

### Stop / Skip / Clear

```text
$panel queue stop
$panel queue skip
$panel queue clear
```

### Loop

```text
$panel queue loop on
$panel queue loop off
```

Hinweise:

- die Queue ist immer an einen bestimmten Selfbot/Kanal/Preset gebunden
- wenn ein geplantes Event denselben Selfbot braucht, entscheidet die Konfliktregel im Panel, ob die Queue pausiert oder das Event blockiert wird

## Info und Logs

### Info

```text
$panel info
```

Zeigt u. a.:

- Discord-Status
- aktive Bots
- erkannte Command-Prefixe
- FFmpeg- und yt-dlp-Infos
- Slash-Command-Status des optionalen Control-Bots

### Logs

```text
$panel logs
$panel logs 10
```

Grenzen:

- Standard: 5
- Maximum: 20

## Fehlerbilder, die haeufig keine Bot-Bugs sind

- Commands reagieren nicht: `DISCORD_COMMANDS_ENABLED=0`
- normaler User darf nichts: `COMMAND_ALLOWED_AUTHOR_IDS` fehlt
- normaler Bot reagiert nicht: `Message Content Intent` nicht aktiviert
- Slash-Commands fehlen: Guild nicht in `CONTROL_BOT_COMMAND_GUILD_IDS` und nicht aus gespeicherten Kanaelen ableitbar
- `play` findet keinen Kanal: Absender ist in keinem Voice-Channel und es gibt nicht genau einen gespeicherten Stream-Kanal
