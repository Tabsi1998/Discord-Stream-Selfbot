#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  Discord Stream Selfbot - Installer
#  Interaktive Einrichtung mit allen benoetigten Einstellungen
# ══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Farben ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Pfade ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR/deploy"
ENV_FILE="$DEPLOY_DIR/.env"
ENV_BACKUP="$DEPLOY_DIR/.env.backup"
DATA_DIR="$DEPLOY_DIR/data"
COOKIES_DIR="$DEPLOY_DIR/cookies"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
SELFBOT_PROFILES_FILE="$DATA_DIR/selfbot-profiles.tsv"

# ── Feste Werte (nicht abgefragt) ──────────────────────────────
FIXED_HOST_PORT=3099
FIXED_PORT=3099

# ── Defaults ────────────────────────────────────────────────────
DEFAULT_TZ="Europe/Vienna"
DEFAULT_COMMAND_PREFIX='$panel'
DEFAULT_YT_DLP_PACKAGE='yt-dlp[default]'
DEFAULT_YT_DLP_FORMAT='bestvideo[vcodec!=none]+bestaudio[acodec!=none]/best[vcodec!=none][acodec!=none]/best*[vcodec!=none][acodec!=none]/best'
DEFAULT_SCHEDULER_POLL_MS=1000
DEFAULT_STARTUP_TIMEOUT_MS=15000
DEFAULT_PANEL_AUTH_USERNAME='admin'
DEFAULT_PANEL_AUTH_REALM='Stream Bot'
DEFAULT_PREFERRED_HW_ENCODER='auto'
DEFAULT_FFMPEG_LOG_LEVEL='warning'
DEFAULT_PRIMARY_SELFBOT_NAME='Primary Selfbot'
DEFAULT_SELFBOT_CONFIG_FILE='/app/examples/control-panel/data/selfbot-profiles.tsv'
DEFAULT_IDLE_PRESENCE_STATUS='online'
DEFAULT_IDLE_ACTIVITY_TYPE='WATCHING'
DEFAULT_IDLE_ACTIVITY_TEXT='THE LION SQUAD - eSPORTS'
DEFAULT_STREAM_PRESENCE_STATUS='online'
DEFAULT_STREAM_ACTIVITY_TYPE='PLAYING'
DEFAULT_STREAM_ACTIVITY_TEXT='{{title}}'
DEFAULT_VOICE_STATUS_TEMPLATE='Now streaming: {{title}}'

# ── Helper ──────────────────────────────────────────────────────
print_step() {
  echo "" >&2
  echo -e "${CYAN}${BOLD}  [$1/$2] $3${NC}" >&2
  echo -e "${DIM}  ─────────────────────────────────────────────${NC}" >&2
}
print_success() { echo -e "  ${GREEN}✓${NC} $1" >&2; }
print_info()    { echo -e "  ${BLUE}i${NC} $1" >&2; }
print_warn()    { echo -e "  ${YELLOW}!${NC} $1" >&2; }
print_error()   { echo -e "  ${RED}✗${NC} $1" >&2; }

# Eingabe - Prompt auf stderr, Wert auf stdout
ask() {
  local label="$1"
  local default="$2"
  local answer

  if [ -n "$default" ]; then
    printf "  ${BOLD}%s${NC} ${DIM}[%s]${NC}: " "$label" "$default" >&2
  else
    printf "  ${BOLD}%s${NC}: " "$label" >&2
  fi
  read -r answer
  if [ -z "$answer" ]; then
    answer="$default"
  fi
  printf '%s' "$answer"
}

mask_secret() {
  local value="$1"
  if [ -z "$value" ]; then
    printf ''
  elif [ "${#value}" -le 6 ]; then
    printf 'gesetzt'
  else
    printf '%s...%s' "${value:0:4}" "${value: -2}"
  fi
}

ask_secret() {
  local label="$1"
  local default="$2"
  local answer
  local masked_default

  masked_default=$(mask_secret "$default")
  if [ -n "$masked_default" ]; then
    printf "  ${BOLD}%s${NC} ${DIM}[%s]${NC}: " "$label" "$masked_default" >&2
  else
    printf "  ${BOLD}%s${NC}: " "$label" >&2
  fi
  IFS= read -r -s answer
  echo "" >&2
  if [ -z "$answer" ]; then
    answer="$default"
  fi
  printf '%s' "$answer"
}

# Ja/Nein - Prompt auf stderr
ask_yn() {
  local label="$1"
  local default="$2"
  local answer

  if [ "$default" = "y" ]; then
    printf "  ${BOLD}%s${NC} ${DIM}[J/n]${NC}: " "$label" >&2
  else
    printf "  ${BOLD}%s${NC} ${DIM}[j/N]${NC}: " "$label" >&2
  fi
  read -r answer
  answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
  [ -z "$answer" ] && answer="$default"
  case "$answer" in
    j|y|ja|yes) printf '1' ;;
    *) printf '0' ;;
  esac
}

# .env lesen
read_env() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true
  fi
}

get_or_default() {
  local val
  val=$(read_env "$1")
  if [ -n "$val" ]; then
    printf '%s' "$val"
  else
    printf '%s' "$2"
  fi
}

# Positive Zahl?
check_number() {
  if ! [[ "$2" =~ ^[1-9][0-9]*$ ]]; then
    print_error "$1 muss eine positive Zahl sein (eingegeben: $2)"
    exit 1
  fi
}

validate_panel_auth() {
  local enabled="$1"
  local username="$2"
  local password="$3"
  if [ "$enabled" != "1" ]; then
    return 0
  fi
  if [ -z "$username" ]; then
    print_error "Panel Benutzername ist erforderlich, wenn der Login aktiviert ist"
    exit 1
  fi
  if [ -z "$password" ]; then
    print_error "Panel Passwort ist erforderlich, wenn der Login aktiviert ist"
    exit 1
  fi
}

# ══════════════════════════════════════════════════════════════════
#  START
# ══════════════════════════════════════════════════════════════════

clear
echo "" >&2
echo -e "${MAGENTA}${BOLD}" >&2
echo "  ╔══════════════════════════════════════════════════════╗" >&2
echo "  ║                                                      ║" >&2
echo "  ║   Discord Stream Selfbot - Installation              ║" >&2
echo "  ║                                                      ║" >&2
echo "  ╚══════════════════════════════════════════════════════╝" >&2
echo -e "${NC}" >&2

# Bestehende .env?
if [ -f "$ENV_FILE" ]; then
  echo -e "  ${YELLOW}${BOLD}Bestehende Konfiguration gefunden!${NC}" >&2
  echo "" >&2
  USE_EXISTING=$(ask_yn "Bestehende Werte als Defaults verwenden?" "y")
  if [ "$USE_EXISTING" = "0" ]; then
    print_warn "Starte mit leeren Werten"
    rm -f "$ENV_FILE"
  else
    print_success "Verwende bestehende Werte als Defaults"
  fi
fi

# ── [1/4] Voraussetzungen ──────────────────────────────────────
print_step 1 4 "Voraussetzungen pruefen"
echo "" >&2

ALL_OK=true

if command -v docker &>/dev/null; then
  print_success "Docker gefunden: $(docker --version 2>/dev/null | head -1)"
else
  print_error "Docker ist nicht installiert"
  print_info "Installation: https://docs.docker.com/get-docker/"
  ALL_OK=false
fi

if docker compose version &>/dev/null 2>&1; then
  print_success "Docker Compose gefunden"
else
  print_error "Docker Compose fehlt"
  ALL_OK=false
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  print_error "docker-compose.yml nicht gefunden: $COMPOSE_FILE"
  ALL_OK=false
fi

if [ "$ALL_OK" = false ]; then
  echo "" >&2
  print_error "Voraussetzungen nicht erfuellt. Abbruch."
  exit 1
fi

echo "" >&2
print_success "Alles OK!"

# ── [2/4] Discord Konfiguration ───────────────────────────────
print_step 2 4 "Discord Konfiguration"
echo "" >&2
print_info "Du benoetigst deinen Discord Self-Token."
print_info "So findest du ihn:"
print_info "  Discord Web -> F12 -> Network -> Beliebige Request -> Authorization Header"
echo "" >&2
print_warn "ACHTUNG: Dein Token ist wie ein Passwort. Niemals teilen!"
echo "" >&2

CURRENT_TOKEN=$(read_env "DISCORD_TOKEN")

CONF_TOKEN=$(ask_secret "Discord Self-Token" "$CURRENT_TOKEN")

if [ -z "$CONF_TOKEN" ]; then
  print_error "Discord Token ist erforderlich!"
  exit 1
fi
print_success "Token gespeichert"

echo "" >&2
print_info "Erlaubte Discord User-IDs fuer Chat-Befehle"
print_info "  Komma-getrennt, leer = nur Selfbot-Accounts"
CONF_ALLOWED_IDS=$(ask "Erlaubte User-IDs" "$(get_or_default COMMAND_ALLOWED_AUTHOR_IDS "")")

# ── [3/4] Allgemeine Einstellungen ────────────────────────────
print_step 3 4 "Allgemeine Einstellungen"
echo "" >&2
print_info "Port ist fest auf ${BOLD}$FIXED_HOST_PORT${NC}"
echo "" >&2

CONF_TZ=$(ask "Zeitzone" "$(get_or_default TZ "$DEFAULT_TZ")")

echo "" >&2
print_info "Discord Chat-Befehle erlauben Steuerung per Nachricht"
print_info "  z.B. \$panel start, \$panel stop, \$panel status"
print_info "  Optional kann ein normaler Discord Bot dieselben Befehle annehmen"
print_info "  Weitere Prefixe wie ? oder !panel gehen ueber COMMAND_PREFIX_ALIASES"
echo "" >&2

CURRENT_CMD=$(read_env "DISCORD_COMMANDS_ENABLED")
CMD_DEFAULT="y"
[ "$CURRENT_CMD" = "0" ] && CMD_DEFAULT="n"

CONF_COMMANDS_ENABLED=$(ask_yn "Chat-Befehle aktivieren?" "$CMD_DEFAULT")
CONF_PREFIX=$(ask "Befehl-Prefix" "$(get_or_default COMMAND_PREFIX "$DEFAULT_COMMAND_PREFIX")")
CONF_PREFIX_ALIASES=$(ask "Weitere Prefixe (komma-getrennt, optional)" "$(get_or_default COMMAND_PREFIX_ALIASES "")")
CONF_CONTROL_BOT_TOKEN=$(ask_secret "Control-Bot Token (optional)" "$(get_or_default CONTROL_BOT_TOKEN "")")
echo "" >&2
print_info "Optional: Login-Schutz fuer das Web Panel per HTTP Basic Auth"
CURRENT_PANEL_AUTH=$(read_env "PANEL_AUTH_ENABLED")
PANEL_AUTH_DEFAULT="n"
[ "$CURRENT_PANEL_AUTH" = "1" ] && PANEL_AUTH_DEFAULT="y"
CONF_PANEL_AUTH_ENABLED=$(ask_yn "Web-Panel mit Login absichern?" "$PANEL_AUTH_DEFAULT")
CONF_PANEL_AUTH_USERNAME=""
CONF_PANEL_AUTH_PASSWORD=""
if [ "$CONF_PANEL_AUTH_ENABLED" = "1" ]; then
  CONF_PANEL_AUTH_USERNAME=$(ask "Panel Benutzername" "$(get_or_default PANEL_AUTH_USERNAME "$DEFAULT_PANEL_AUTH_USERNAME")")
  CONF_PANEL_AUTH_PASSWORD=$(ask_secret "Panel Passwort" "$(get_or_default PANEL_AUTH_PASSWORD "")")
fi
validate_panel_auth "$CONF_PANEL_AUTH_ENABLED" "$CONF_PANEL_AUTH_USERNAME" "$CONF_PANEL_AUTH_PASSWORD"
echo "" >&2
print_info "Optional: yt-dlp Cookies helfen gegen YouTube-Bot-Checks"
print_info "  Browser: z.B. edge oder chrome:Default"
print_info "  Docker Cookie-Datei: z.B. /app/examples/control-panel/cookies/yt-dlp-cookies.txt"
echo "" >&2
CONF_YT_DLP_COOKIES_BROWSER=$(ask "yt-dlp Browser-Cookies (optional)" "$(get_or_default YT_DLP_COOKIES_FROM_BROWSER "")")
CONF_YT_DLP_COOKIES_FILE=$(ask "yt-dlp Cookie-Datei (optional)" "$(get_or_default YT_DLP_COOKIES_FILE "")")
echo "" >&2
print_info "Idle-/Streaming-Status fuer den primaeren Selfbot"
print_info "  Platzhalter: {{title}}, {{presetName}}, {{channelName}}, {{botName}}"
CONF_PRIMARY_SELFBOT_NAME=$(ask "Primaerer Selfbot Name" "$(get_or_default PRIMARY_SELFBOT_NAME "$DEFAULT_PRIMARY_SELFBOT_NAME")")
CONF_IDLE_ACTIVITY_TEXT=$(ask "Idle-Status Text" "$(get_or_default IDLE_ACTIVITY_TEXT "$DEFAULT_IDLE_ACTIVITY_TEXT")")
CONF_STREAM_ACTIVITY_TEXT=$(ask "Streaming-Status Text" "$(get_or_default STREAM_ACTIVITY_TEXT "$DEFAULT_STREAM_ACTIVITY_TEXT")")
CONF_VOICE_STATUS_TEMPLATE=$(ask "Voice-Status Text" "$(get_or_default VOICE_STATUS_TEMPLATE "$DEFAULT_VOICE_STATUS_TEMPLATE")")

# ── [4/4] Zusammenfassung ─────────────────────────────────────
print_step 4 4 "Zusammenfassung"
echo "" >&2
echo -e "  ${BOLD}Deine Konfiguration:${NC}" >&2
echo "" >&2
echo -e "  ${DIM}Discord Token:${NC}     $(mask_secret "$CONF_TOKEN")" >&2
echo -e "  ${DIM}Erlaubte IDs:${NC}      ${CONF_ALLOWED_IDS:-nur Selfbot-Accounts}" >&2
echo -e "  ${DIM}Web Panel Port:${NC}    $FIXED_HOST_PORT (fest)" >&2
echo -e "  ${DIM}Zeitzone:${NC}          $CONF_TZ" >&2
echo -e "  ${DIM}Chat-Befehle:${NC}      $([ "$CONF_COMMANDS_ENABLED" = "1" ] && echo "Aktiv (${CONF_PREFIX}${CONF_PREFIX_ALIASES:+ + ${CONF_PREFIX_ALIASES}})" || echo "Aus")" >&2
echo -e "  ${DIM}Control-Bot:${NC}       $([ -n "$CONF_CONTROL_BOT_TOKEN" ] && echo "$(mask_secret "$CONF_CONTROL_BOT_TOKEN")" || echo "nicht gesetzt")" >&2
echo -e "  ${DIM}Panel Login:${NC}       $([ "$CONF_PANEL_AUTH_ENABLED" = "1" ] && echo "Aktiv (${CONF_PANEL_AUTH_USERNAME})" || echo "Aus")" >&2
echo -e "  ${DIM}yt-dlp Cookies:${NC}    ${CONF_YT_DLP_COOKIES_BROWSER:-${CONF_YT_DLP_COOKIES_FILE:-keine}}" >&2
echo -e "  ${DIM}Selfbot Name:${NC}      $CONF_PRIMARY_SELFBOT_NAME" >&2
echo -e "  ${DIM}Idle Status:${NC}       $CONF_IDLE_ACTIVITY_TEXT" >&2
echo -e "  ${DIM}Stream Status:${NC}     $CONF_STREAM_ACTIVITY_TEXT" >&2
echo "" >&2

CONFIRM=$(ask_yn "Konfiguration speichern und Installation starten?" "y")
if [ "$CONFIRM" = "0" ]; then
  print_warn "Abgebrochen."
  exit 0
fi

# ── .env schreiben ─────────────────────────────────────────────
mkdir -p "$DATA_DIR"
mkdir -p "$COOKIES_DIR"
mkdir -p "$DEPLOY_DIR/yt-dlp-cache"
touch "$DATA_DIR/.gitkeep" 2>/dev/null || true
touch "$COOKIES_DIR/.gitkeep" 2>/dev/null || true

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_BACKUP"
  print_info "Backup: $ENV_BACKUP"
fi

# yt-dlp und Scheduler mit Defaults (nicht abgefragt)
CONF_YT_DLP_FORMAT=$(get_or_default YT_DLP_FORMAT "$DEFAULT_YT_DLP_FORMAT")
CONF_YT_DLP_PACKAGE=$(get_or_default YT_DLP_PACKAGE "$DEFAULT_YT_DLP_PACKAGE")
CONF_SCHEDULER_POLL=$(get_or_default SCHEDULER_POLL_MS "$DEFAULT_SCHEDULER_POLL_MS")
CONF_STARTUP_TIMEOUT=$(get_or_default STARTUP_TIMEOUT_MS "$DEFAULT_STARTUP_TIMEOUT_MS")
CONF_PANEL_AUTH_REALM=$(get_or_default PANEL_AUTH_REALM "$DEFAULT_PANEL_AUTH_REALM")
CONF_PREFERRED_HW_ENCODER=$(get_or_default PREFERRED_HW_ENCODER "$DEFAULT_PREFERRED_HW_ENCODER")
CONF_FFMPEG_LOG_LEVEL=$(get_or_default FFMPEG_LOG_LEVEL "$DEFAULT_FFMPEG_LOG_LEVEL")
CONF_SELFBOT_CONFIG_FILE=$(get_or_default SELFBOT_CONFIG_FILE "$DEFAULT_SELFBOT_CONFIG_FILE")
CONF_IDLE_PRESENCE_STATUS=$(get_or_default IDLE_PRESENCE_STATUS "$DEFAULT_IDLE_PRESENCE_STATUS")
CONF_IDLE_ACTIVITY_TYPE=$(get_or_default IDLE_ACTIVITY_TYPE "$DEFAULT_IDLE_ACTIVITY_TYPE")
CONF_STREAM_PRESENCE_STATUS=$(get_or_default STREAM_PRESENCE_STATUS "$DEFAULT_STREAM_PRESENCE_STATUS")
CONF_STREAM_ACTIVITY_TYPE=$(get_or_default STREAM_ACTIVITY_TYPE "$DEFAULT_STREAM_ACTIVITY_TYPE")

umask 077
cat > "$ENV_FILE" << ENVEOF
# Discord Stream Selfbot - Konfiguration
# Generiert am $(date '+%Y-%m-%d %H:%M:%S')
DISCORD_TOKEN=$CONF_TOKEN
HOST_PORT=$FIXED_HOST_PORT
PORT=$FIXED_PORT
TZ=$CONF_TZ
DATA_FILE=/app/examples/control-panel/data/control-panel-state.json
SELFBOT_CONFIG_FILE=$CONF_SELFBOT_CONFIG_FILE
PRIMARY_SELFBOT_NAME=$CONF_PRIMARY_SELFBOT_NAME
DISCORD_COMMANDS_ENABLED=$CONF_COMMANDS_ENABLED
COMMAND_PREFIX=$CONF_PREFIX
COMMAND_PREFIX_ALIASES=$CONF_PREFIX_ALIASES
CONTROL_BOT_TOKEN=$CONF_CONTROL_BOT_TOKEN
COMMAND_ALLOWED_AUTHOR_IDS=$CONF_ALLOWED_IDS
IDLE_PRESENCE_STATUS=$CONF_IDLE_PRESENCE_STATUS
IDLE_ACTIVITY_TYPE=$CONF_IDLE_ACTIVITY_TYPE
IDLE_ACTIVITY_TEXT=$CONF_IDLE_ACTIVITY_TEXT
STREAM_PRESENCE_STATUS=$CONF_STREAM_PRESENCE_STATUS
STREAM_ACTIVITY_TYPE=$CONF_STREAM_ACTIVITY_TYPE
STREAM_ACTIVITY_TEXT=$CONF_STREAM_ACTIVITY_TEXT
VOICE_STATUS_TEMPLATE=$CONF_VOICE_STATUS_TEMPLATE
PANEL_AUTH_ENABLED=$CONF_PANEL_AUTH_ENABLED
PANEL_AUTH_USERNAME=$CONF_PANEL_AUTH_USERNAME
PANEL_AUTH_PASSWORD=$CONF_PANEL_AUTH_PASSWORD
PANEL_AUTH_REALM=$CONF_PANEL_AUTH_REALM
YT_DLP_COOKIES_FROM_BROWSER=$CONF_YT_DLP_COOKIES_BROWSER
YT_DLP_COOKIES_FILE=$CONF_YT_DLP_COOKIES_FILE
YT_DLP_PACKAGE=$CONF_YT_DLP_PACKAGE
YT_DLP_FORMAT=$CONF_YT_DLP_FORMAT
PREFERRED_HW_ENCODER=$CONF_PREFERRED_HW_ENCODER
FFMPEG_LOG_LEVEL=$CONF_FFMPEG_LOG_LEVEL
SCHEDULER_POLL_MS=$CONF_SCHEDULER_POLL
STARTUP_TIMEOUT_MS=$CONF_STARTUP_TIMEOUT
ENVEOF

print_success "Konfiguration gespeichert: $ENV_FILE"

if [ ! -f "$SELFBOT_PROFILES_FILE" ]; then
  cat > "$SELFBOT_PROFILES_FILE" << 'PROFILESEOF'
# Zusatz-Selfbots (tab-getrennt)
# id	name	token	idle_status_text	stream_status_text	voice_status_text	enabled	command_enabled
PROFILESEOF
  print_success "Zusatz-Selfbot Datei angelegt: $SELFBOT_PROFILES_FILE"
fi

echo "" >&2
echo -e "  ${BOLD}Baue Docker Image frisch...${NC}" >&2
echo "" >&2
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull --no-cache 2>&1 | while IFS= read -r line; do
  echo "  $line" >&2
done

echo "" >&2
echo -e "  ${BOLD}Starte Docker Container...${NC}" >&2
echo "" >&2
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d 2>&1 | while IFS= read -r line; do
  echo "  $line" >&2
done

echo "" >&2
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps 2>&1 | while IFS= read -r line; do
  echo "  $line" >&2
done

YT_DLP_VERSION=$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T control-panel yt-dlp --version 2>/dev/null || true)
if [ -n "$YT_DLP_VERSION" ]; then
  echo "" >&2
  print_success "yt-dlp im Container: $YT_DLP_VERSION"
fi

echo "" >&2
echo -e "${GREEN}${BOLD}" >&2
echo "  ╔══════════════════════════════════════════════════════╗" >&2
echo "  ║                                                      ║" >&2
echo "  ║   Installation abgeschlossen!                        ║" >&2
echo "  ║                                                      ║" >&2
echo "  ╚══════════════════════════════════════════════════════╝" >&2
echo -e "${NC}" >&2
echo -e "  ${BOLD}Control Panel:${NC}  http://localhost:${FIXED_HOST_PORT}" >&2
echo "" >&2
echo -e "  ${DIM}Nuetzliche Befehle:${NC}" >&2
echo -e "  ${CYAN}./config.sh${NC}   - Einstellungen aendern" >&2
echo -e "  ${CYAN}./update.sh${NC}   - Auf neueste Version updaten" >&2
echo "" >&2
