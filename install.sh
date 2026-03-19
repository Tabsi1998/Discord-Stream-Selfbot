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
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"

# ── Defaults ────────────────────────────────────────────────────
DEFAULT_HOST_PORT=3099
DEFAULT_PORT=3099
DEFAULT_TZ="Europe/Vienna"
DEFAULT_COMMAND_PREFIX='$panel'
DEFAULT_YT_DLP_FORMAT='bestvideo[vcodec!=none]+bestaudio[acodec!=none]/best[vcodec!=none][acodec!=none]/best*[vcodec!=none][acodec!=none]/best'
DEFAULT_SCHEDULER_POLL_MS=1000
DEFAULT_STARTUP_TIMEOUT_MS=15000

# ── Helper Funktionen ──────────────────────────────────────────
print_banner() {
  clear
  echo ""
  echo -e "${MAGENTA}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║                                                      ║"
  echo "  ║   Discord Stream Selfbot - Installation              ║"
  echo "  ║                                                      ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""
}

print_step() {
  local step=$1
  local total=$2
  local title=$3
  echo ""
  echo -e "${CYAN}${BOLD}  [$step/$total] $title${NC}"
  echo -e "${DIM}  ─────────────────────────────────────────────${NC}"
}

print_success() {
  echo -e "  ${GREEN}✓${NC} $1"
}

print_info() {
  echo -e "  ${BLUE}i${NC} $1"
}

print_warn() {
  echo -e "  ${YELLOW}!${NC} $1"
}

print_error() {
  echo -e "  ${RED}✗${NC} $1"
}

# Eingabe mit Default-Wert
prompt_input() {
  local label=$1
  local default=$2
  local result

  if [ -n "$default" ]; then
    echo -en "  ${BOLD}$label${NC} ${DIM}[$default]${NC}: "
  else
    echo -en "  ${BOLD}$label${NC}: "
  fi
  read -r result
  if [ -z "$result" ]; then
    result="$default"
  fi
  echo "$result"
}

# Geheime Eingabe (Token etc.)
prompt_secret() {
  local label=$1
  local current=$2
  local result

  if [ -n "$current" ]; then
    local masked="${current:0:8}...${current: -4}"
    echo -en "  ${BOLD}$label${NC} ${DIM}[aktuell: $masked | Enter = behalten]${NC}: "
  else
    echo -en "  ${BOLD}$label${NC}: "
  fi

  # Versteckte Eingabe wenn Terminal vorhanden
  if [ -t 0 ] && command -v stty &>/dev/null; then
    stty -echo
    read -r result
    stty echo
    echo ""
  else
    read -r result
  fi

  if [ -z "$result" ]; then
    result="$current"
  fi
  echo "$result"
}

# Ja/Nein Frage
prompt_yn() {
  local label=$1
  local default=$2
  local result

  if [ "$default" = "y" ]; then
    echo -en "  ${BOLD}$label${NC} ${DIM}[J/n]${NC}: "
  else
    echo -en "  ${BOLD}$label${NC} ${DIM}[j/N]${NC}: "
  fi
  read -r result
  result=$(echo "$result" | tr '[:upper:]' '[:lower:]')

  if [ -z "$result" ]; then
    result="$default"
  fi

  case "$result" in
    j|y|ja|yes) echo "1" ;;
    *) echo "0" ;;
  esac
}

# Positive Zahl pruefen
validate_number() {
  local name=$1
  local value=$2

  if ! [[ "$value" =~ ^[1-9][0-9]*$ ]]; then
    print_error "$name muss eine positive Zahl sein (eingegeben: $value)"
    exit 1
  fi
}

# Bestehende .env lesen
read_env_value() {
  local key=$1
  if [ -f "$ENV_FILE" ]; then
    grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true
  fi
}

current_or_default() {
  local key=$1
  local fallback=$2
  local value
  value=$(read_env_value "$key")
  if [ -n "$value" ]; then
    echo "$value"
  else
    echo "$fallback"
  fi
}

# ── Voraussetzungen pruefen ────────────────────────────────────
check_requirements() {
  local ok=true

  echo -e "  Pruefe Voraussetzungen..."
  echo ""

  if command -v docker &>/dev/null; then
    print_success "Docker gefunden: $(docker --version 2>/dev/null | head -1)"
  else
    print_error "Docker ist nicht installiert"
    print_info "Installiere Docker: https://docs.docker.com/get-docker/"
    ok=false
  fi

  if docker compose version &>/dev/null 2>&1; then
    print_success "Docker Compose gefunden"
  else
    print_error "Docker Compose ist nicht installiert"
    ok=false
  fi

  if [ ! -f "$COMPOSE_FILE" ]; then
    print_error "docker-compose.yml nicht gefunden: $COMPOSE_FILE"
    ok=false
  fi

  if [ "$ok" = false ]; then
    echo ""
    print_error "Voraussetzungen nicht erfuellt. Installation abgebrochen."
    exit 1
  fi

  echo ""
  print_success "Alle Voraussetzungen erfuellt!"
}

# ── .env schreiben ─────────────────────────────────────────────
write_env() {
  mkdir -p "$DATA_DIR"
  touch "$DATA_DIR/.gitkeep" 2>/dev/null || true

  # Backup falls vorhanden
  if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_BACKUP"
    print_info "Backup der alten Konfiguration: $ENV_BACKUP"
  fi

  umask 077
  cat > "$ENV_FILE" << ENVEOF
# Discord Stream Selfbot - Konfiguration
# Generiert am $(date '+%Y-%m-%d %H:%M:%S')
# ═══════════════════════════════════════════

# Discord Self-Token (GEHEIM - niemals teilen!)
DISCORD_TOKEN=${CONF_TOKEN}

# Web Panel
HOST_PORT=${CONF_HOST_PORT}
PORT=${CONF_PORT}

# Zeitzone
TZ=${CONF_TZ}

# Datenspeicher
DATA_FILE=/app/examples/control-panel/data/control-panel-state.json

# Discord Chat-Befehle
DISCORD_COMMANDS_ENABLED=${CONF_COMMANDS_ENABLED}
COMMAND_PREFIX=${CONF_PREFIX}
COMMAND_ALLOWED_AUTHOR_IDS=${CONF_ALLOWED_IDS}

# yt-dlp Einstellungen
YT_DLP_FORMAT=${CONF_YT_DLP_FORMAT}

# Scheduler
SCHEDULER_POLL_MS=${CONF_SCHEDULER_POLL}
STARTUP_TIMEOUT_MS=${CONF_STARTUP_TIMEOUT}
ENVEOF
}

# ══════════════════════════════════════════════════════════════════
#  HAUPTPROGRAMM
# ══════════════════════════════════════════════════════════════════

print_banner

# Bestehende Installation erkennen
if [ -f "$ENV_FILE" ]; then
  echo -e "  ${YELLOW}${BOLD}Bestehende Konfiguration gefunden!${NC}"
  echo ""
  REINSTALL=$(prompt_yn "Bestehende Einstellungen als Basis verwenden?" "y")
  if [ "$REINSTALL" = "0" ]; then
    print_warn "Starte mit leeren Einstellungen"
    rm -f "$ENV_FILE"
  else
    print_success "Verwende bestehende Werte als Defaults"
  fi
fi

# ──────────────────────────────────────────────────────────────
print_step 1 5 "Voraussetzungen pruefen"
check_requirements

# ──────────────────────────────────────────────────────────────
print_step 2 5 "Discord Konfiguration"
echo ""
print_info "Du benoetigst deinen Discord Self-Token."
print_info "Diesen findest du in den Browser DevTools unter:"
print_info "  Discord Web -> F12 -> Network -> Beliebige Request -> Authorization Header"
echo ""
print_warn "ACHTUNG: Dein Token ist wie ein Passwort. Niemals teilen!"
echo ""

CURRENT_TOKEN=$(read_env_value "DISCORD_TOKEN")
CONF_TOKEN=$(prompt_secret "Discord Self-Token" "$CURRENT_TOKEN")

if [ -z "$CONF_TOKEN" ]; then
  print_error "Discord Token ist erforderlich!"
  exit 1
fi
print_success "Token gespeichert"

echo ""
print_info "Erlaubte Discord User-IDs fuer Chat-Befehle"
print_info "  Komma-getrennt, leer = nur du selbst"
CURRENT_ALLOWED=$(current_or_default "COMMAND_ALLOWED_AUTHOR_IDS" "")
CONF_ALLOWED_IDS=$(prompt_input "Erlaubte User-IDs" "$CURRENT_ALLOWED")

# ──────────────────────────────────────────────────────────────
print_step 3 5 "Web Panel Einstellungen"
echo ""
print_info "Port fuer das Control Panel im Browser"
echo ""

CONF_HOST_PORT=$(prompt_input "Web Panel Port" "$(current_or_default HOST_PORT $DEFAULT_HOST_PORT)")
CONF_PORT=$(prompt_input "Container Port (intern)" "$(current_or_default PORT $DEFAULT_PORT)")
CONF_TZ=$(prompt_input "Zeitzone" "$(current_or_default TZ $DEFAULT_TZ)")

validate_number "Web Panel Port" "$CONF_HOST_PORT"
validate_number "Container Port" "$CONF_PORT"

print_success "Panel wird auf Port $CONF_HOST_PORT laufen"

# ──────────────────────────────────────────────────────────────
print_step 4 5 "Discord Chat-Befehle & Streaming"
echo ""
print_info "Discord Chat-Befehle erlauben Steuerung per Nachricht"
print_info "  z.B. \$panel start, \$panel stop, \$panel status"
echo ""

CURRENT_CMD_ENABLED=$(read_env_value "DISCORD_COMMANDS_ENABLED")
CMD_DEFAULT="y"
if [ "$CURRENT_CMD_ENABLED" = "0" ]; then
  CMD_DEFAULT="n"
fi
CONF_COMMANDS_ENABLED=$(prompt_yn "Chat-Befehle aktivieren?" "$CMD_DEFAULT")
CONF_PREFIX=$(prompt_input "Befehl-Prefix" "$(current_or_default COMMAND_PREFIX "$DEFAULT_COMMAND_PREFIX")")

echo ""
print_info "yt-dlp Format bestimmt Qualitaet von YouTube/Twitch Streams"
SHOW_YTDLP=$(prompt_yn "yt-dlp Format anpassen? (Fortgeschritten)" "n")
if [ "$SHOW_YTDLP" = "1" ]; then
  CONF_YT_DLP_FORMAT=$(prompt_input "yt-dlp Format" "$(current_or_default YT_DLP_FORMAT "$DEFAULT_YT_DLP_FORMAT")")
else
  CONF_YT_DLP_FORMAT=$(current_or_default YT_DLP_FORMAT "$DEFAULT_YT_DLP_FORMAT")
  print_info "Verwende Standard-Format"
fi

echo ""
print_info "Scheduler prueft regelmaessig ob Events gestartet werden muessen"
SHOW_ADVANCED=$(prompt_yn "Erweiterte Scheduler-Einstellungen anpassen?" "n")
if [ "$SHOW_ADVANCED" = "1" ]; then
  CONF_SCHEDULER_POLL=$(prompt_input "Scheduler Poll-Intervall (ms)" "$(current_or_default SCHEDULER_POLL_MS $DEFAULT_SCHEDULER_POLL_MS)")
  CONF_STARTUP_TIMEOUT=$(prompt_input "Stream Startup-Timeout (ms)" "$(current_or_default STARTUP_TIMEOUT_MS $DEFAULT_STARTUP_TIMEOUT_MS)")
  validate_number "Scheduler Poll-Intervall" "$CONF_SCHEDULER_POLL"
  validate_number "Startup-Timeout" "$CONF_STARTUP_TIMEOUT"
else
  CONF_SCHEDULER_POLL=$(current_or_default SCHEDULER_POLL_MS $DEFAULT_SCHEDULER_POLL_MS)
  CONF_STARTUP_TIMEOUT=$(current_or_default STARTUP_TIMEOUT_MS $DEFAULT_STARTUP_TIMEOUT_MS)
  print_info "Verwende Standard-Werte"
fi

# ──────────────────────────────────────────────────────────────
print_step 5 5 "Zusammenfassung & Installation"
echo ""
echo -e "  ${BOLD}Deine Konfiguration:${NC}"
echo ""
echo -e "  ${DIM}Discord Token:${NC}     ${CONF_TOKEN:0:8}...${CONF_TOKEN: -4}"
echo -e "  ${DIM}Erlaubte IDs:${NC}      ${CONF_ALLOWED_IDS:-nur du selbst}"
echo -e "  ${DIM}Web Panel Port:${NC}    ${CONF_HOST_PORT}"
echo -e "  ${DIM}Zeitzone:${NC}          ${CONF_TZ}"
echo -e "  ${DIM}Chat-Befehle:${NC}      $([ "$CONF_COMMANDS_ENABLED" = "1" ] && echo "Aktiviert (${CONF_PREFIX})" || echo "Deaktiviert")"
echo -e "  ${DIM}Scheduler Poll:${NC}    ${CONF_SCHEDULER_POLL}ms"
echo ""

CONFIRM=$(prompt_yn "Konfiguration speichern und Installation starten?" "y")
if [ "$CONFIRM" = "0" ]; then
  print_warn "Installation abgebrochen."
  exit 0
fi

echo ""
write_env
print_success "Konfiguration gespeichert: $ENV_FILE"

echo ""
echo -e "  ${BOLD}Starte Docker Container...${NC}"
echo ""
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

echo ""
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║                                                      ║"
echo "  ║   Installation abgeschlossen!                        ║"
echo "  ║                                                      ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Control Panel:${NC}  http://localhost:${CONF_HOST_PORT}"
echo ""
echo -e "  ${DIM}Nuetzliche Befehle:${NC}"
echo -e "  ${CYAN}./config.sh${NC}   - Einstellungen aendern"
echo -e "  ${CYAN}./update.sh${NC}   - Update auf neueste Version"
echo ""
