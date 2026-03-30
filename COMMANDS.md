# Discord Chat-Befehle - Referenz

> Alle Befehle beginnen mit dem konfigurierten Prefix. Standard: `$panel`
>
> Zusaetzliche Prefixe wie `?` oder `!panel` koennen ueber `COMMAND_PREFIX_ALIASES` gesetzt werden. Beim normalen Control-Bot funktioniert zusaetzlich die Bot-Mention als Prefix.
>
> Die Befehle koennen ueber den primaeren Selfbot, ueber command-faehige Zusatz-Selfbots und optional ueber einen normalen Discord Bot (`CONTROL_BOT_TOKEN`) angenommen werden.
>
> Sobald ein normaler Control-Bot aktiv ist, antworten die Selfbots nicht mehr auf Chat-Commands.

---

## Uebersicht

| Befehl | Kurzbeschreibung |
|--------|-----------------|
| `help` | Alle Befehle anzeigen |
| `whoami` | Eigene Discord-ID und Freigabe pruefen |
| `play` | URL direkt im aktuellen Voice-Channel starten |
| `status` | Aktuellen Stream-Status |
| `start` | Stream manuell starten |
| `stop` | Einen oder mehrere aktive Streams stoppen |
| `restart` | Aktiven Stream gezielt neu starten |
| `channels` | Kanaele auflisten |
| `presets` | Presets auflisten |
| `events` | Kommende Events auflisten |
| `event start` | Geplantes Event starten |
| `event cancel` | Event abbrechen |
| `queue` | Queue anzeigen |
| `queue add` | URL in die Queue legen |
| `queue start` | Queue starten |
| `queue stop` | Queue stoppen |
| `queue skip` | Zum naechsten Queue-Item springen |
| `queue clear` | Queue leeren |
| `queue loop on/off` | Queue-Loop umschalten |
| `info` | System- und Runtime-Infos |
| `logs` | Letzte Logs abrufen |

---

## Befehle im Detail

### `$panel help`

Zeigt die Liste aller verfuegbaren Befehle.

```
$panel help
```

**Ausgabe:**
```
Befehle mit $panel
$panel help
$panel whoami
$panel play <url> | [zeit]
$panel status
$panel start <url>
$panel start <kanal|id> | <preset|id> | [zeit]
$panel stop
$panel restart [bot|kanal|id]
$panel channels
$panel presets
$panel events
$panel event start <event-id>
$panel event cancel <event-id>
$panel queue
$panel queue add <url> | [name]
$panel queue start <kanal> | <preset>
$panel queue stop
$panel queue skip
$panel queue clear
$panel queue loop on
$panel queue loop off
$panel info
$panel logs [n]
```

---

### `$panel whoami`

Zeigt deine Discord-ID, den aktuellen Freigabe-Status und das erkannte Prefix an. Das ist der schnellste Check, wenn Commands ueber den normalen Bot nicht reagieren.

```
$panel whoami
? whoami
```

**Ausgabe:**
```
Deine Discord-ID: 123456789012345678
Erlaubt: nein
Auth-Modus: allowlist
Erkanntes Prefix: ?
Primaeres Prefix: $panel
Trage diese User-ID in COMMAND_ALLOWED_AUTHOR_IDS ein, um den normalen Bot zu nutzen.
```

---

### `$panel play <url> | [stopAt]`

Startet eine URL direkt im aktuellen Voice-Channel des Schreibers. Wenn der Voice-Channel bereits im Panel konfiguriert ist, wird diese Zuordnung verwendet. Andernfalls wird fuer den aktuellen Channel ein temporaerer Command-Kanal verwendet.

```text
?play https://www.youtube.com/watch?v=atRP5-nOfRY
?play https://example.com/live.m3u8 | 2026-04-30 22:30
```

Wenn genau ein gespeicherter Stream-Kanal existiert, funktioniert `play` auch ohne aktuellen Voice-Channel.

`start <url>` ist derselbe Schnellstart als Alias.

---

### `$panel status`

Zeigt den aktuellen Stream-Status an.

```
$panel status
```

**Ausgabe wenn aktiv:**
```
Aktive Streams: 2
1. Primary Bot | Gaming Kanal -> YouTube HD | running | 19.03.26, 22:00 | Stop 19.03.26, 23:30
2. Backup Bot | IPTV -> Dispatcharr | running | 19.03.26, 22:05
```

**Ausgabe wenn inaktiv:**
```
Kein aktiver Stream.
```

---

### `$panel start <kanal> | <preset>`

Startet sofort einen Stream im angegebenen Kanal mit dem angegebenen Preset.

Kanal und Preset koennen per **Name** oder **ID** angegeben werden.

```
$panel start Gaming Kanal | YouTube HD
$panel start gaming | youtube
$panel start 1234567890 | abcdef123456
```

**Mit Stoppzeit:**

```
$panel start Gaming Kanal | YouTube HD | 2025-12-31 23:00
$panel start Gaming Kanal | YouTube HD | 2025-12-31T23:00:00
```

**Trennzeichen:** Das `|` Zeichen trennt die drei Teile.

**Ausgabe:**
```
Stream startet: Gaming Kanal
Preset: YouTube HD
Stop um: 31.12.25, 23:00
```

**Fehler:**
- Kanal oder Preset nicht gefunden: `channel not found: xyz`
- Mehrere Treffer: `Multiple channels match "gaming"`
- Ungueltige Zeit: `stopAt must be a valid date/time`

---

### `$panel stop`

Stoppt den aktuell laufenden Stream. Wenn mehrere Streams aktiv sind, werden alle aktiven Streams gestoppt.

```
$panel stop
```

**Ausgabe mit einem Stream:**
```
Stream wird gestoppt: Gaming Kanal
```

**Ausgabe mit mehreren Streams:**
```
2 aktive Streams werden gestoppt.
```

Oder wenn kein Stream laeuft:
```
Kein aktiver Stream.
```

---

### `$panel restart [bot|kanal|id]`

Stoppt einen aktiven Stream und startet ihn mit demselben Kanal/Preset erneut. Eine gesetzte Stoppzeit wird uebernommen.

```text
$panel restart
$panel restart backup-bot
$panel restart Gaming Kanal
```

**Ausgabe:**
```text
Stream wird neugestartet: Primary Bot | Gaming Kanal -> YouTube HD
```

Wenn mehrere Streams aktiv sind und kein Ziel uebergeben wird:

```text
Fehler: Mehrere Streams aktiv. Nutze: restart <bot|kanal|id>
```

---

### `$panel channels`

Listet alle konfigurierten Voice Channels auf.

```
$panel channels
```

**Ausgabe:**
```
Gaming Kanal | ch_abc123
Musik Kanal | ch_def456
Filmabend | ch_ghi789
```

---

### `$panel presets`

Listet alle Stream-Presets auf.

```
$panel presets
```

**Ausgabe:**
```
YouTube HD | pr_abc123 | yt-dlp
Dispatcharr IPTV | pr_def456 | direct
Teststream | pr_ghi789 | direct
```

---

### `$panel events`

Listet kommende und laufende Events auf (max. 12).

```
$panel events
```

**Ausgabe:**
```
Abend-Stream | ev_abc123 | scheduled | 20.03.26, 20:00 -> 20.03.26, 23:00
Morgen-Show | ev_def456 | scheduled | 21.03.26, 08:00 -> 21.03.26, 10:00
```

---

### `$panel event start <event-id>`

Startet ein geplantes Event sofort, unabhaengig von der geplanten Startzeit.

```
$panel event start ev_abc123
```

**Ausgabe:**
```
Event ev_abc123 wird gestartet.
```

---

### `$panel event cancel <event-id>`

Bricht ein geplantes oder laufendes Event ab.

```
$panel event cancel ev_abc123
```

**Ausgabe:**
```
Event ev_abc123 wurde abgebrochen.
```

---

### `$panel queue`

Zeigt die aktuelle Queue an.

```text
$panel queue
```

---

### `$panel queue add <url> | [name]`

Legt eine URL in die Queue. Der Name ist optional.

```text
$panel queue add https://example.com/live.m3u8 | Abendprogramm
```

---

### `$panel queue start <kanal> | <preset>`

Startet die Queue im angegebenen Kanal mit dem angegebenen Preset.

```text
$panel queue start Gaming Kanal | IPTV Balanced
```

---

### `$panel queue stop`

Stoppt die Queue.

```text
$panel queue stop
```

---

### `$panel queue skip`

Springt direkt zum naechsten Queue-Item.

```text
$panel queue skip
```

---

### `$panel queue clear`

Entfernt alle Queue-Items.

```text
$panel queue clear
```

---

### `$panel queue loop on/off`

Schaltet den Queue-Loop an oder aus.

```text
$panel queue loop on
$panel queue loop off
```

---

### `$panel info`

Zeigt Systemdaten wie Discord-Status, yt-dlp-Version, Uptime und RAM an.

```text
$panel info
```

---

### `$panel logs [n]`

Zeigt die neuesten Logs an. Standard sind 5, maximal 20.

```text
$panel logs
$panel logs 10
```

---

## Wer darf Befehle senden?

Standardmaessig duerfen nur die eingeloggten Selfbot-Accounts Befehle senden.

Zusaetzliche User-IDs koennen in der Konfiguration hinterlegt werden:

```bash
./config.sh
# → Option 4: Erlaubte User-IDs
# → z.B.: 123456789,987654321
```

Oder direkt in `deploy/.env`:
```
COMMAND_ALLOWED_AUTHOR_IDS=123456789,987654321
```

---

## Prefix aendern

Standard-Prefix ist `$panel`. Du kannst es aendern oder weitere Aliase setzen:

```bash
./config.sh
# → Option 3: Chat-Befehle
# → Neuer Prefix: z.B. !stream
# → Weitere Prefixe: z.B. ?,!panel
```

Wenn du den normalen Bot verwendest und nichts reagiert, starte mit:

```text
$panel whoami
```

Dann werden Befehle mit `!stream start ...` etc. verwendet.

---

## Befehle deaktivieren

```bash
./config.sh
# → Option 3: Chat-Befehle aktivieren? → n
```

Das Web Panel funktioniert weiterhin, nur die Discord Chat-Steuerung ist dann aus.
