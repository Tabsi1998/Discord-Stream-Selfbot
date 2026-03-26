# Discord Chat-Befehle - Referenz

> Alle Befehle beginnen mit dem konfigurierten Prefix. Standard: `$panel`

---

## Uebersicht

| Befehl | Kurzbeschreibung |
|--------|-----------------|
| `help` | Alle Befehle anzeigen |
| `status` | Aktuellen Stream-Status |
| `start` | Stream manuell starten |
| `stop` | Aktiven Stream stoppen |
| `channels` | Kanaele auflisten |
| `presets` | Presets auflisten |
| `events` | Kommende Events auflisten |
| `event start` | Geplantes Event starten |
| `event cancel` | Event abbrechen |

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
$panel status
$panel start <kanal|id> | <preset|id> | [zeit]
$panel stop
$panel channels
$panel presets
$panel events
$panel event start <event-id>
$panel event cancel <event-id>
```

---

### `$panel status`

Zeigt den aktuellen Stream-Status an.

```
$panel status
```

**Ausgabe wenn aktiv:**
```
Aktiv: Gaming Kanal -> YouTube HD
Status: running
Seit: 19.03.26, 22:00
Geplantes Ende: 19.03.26, 23:30
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

Stoppt den aktuell laufenden Stream.

```
$panel stop
```

**Ausgabe:**
```
Aktiver Stream wird gestoppt.
```

Oder wenn kein Stream laeuft:
```
Kein aktiver Stream.
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

## Wer darf Befehle senden?

Standardmaessig darf nur der Account selbst (der eingeloggte Self-Token) Befehle senden.

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

Standard-Prefix ist `$panel`. Du kannst es aendern:

```bash
./config.sh
# → Option 3: Chat-Befehle
# → Neuer Prefix: z.B. !stream
```

Dann werden Befehle mit `!stream start ...` etc. verwendet.

---

## Befehle deaktivieren

```bash
./config.sh
# → Option 3: Chat-Befehle aktivieren? → n
```

Das Web Panel funktioniert weiterhin, nur die Discord Chat-Steuerung ist dann aus.
