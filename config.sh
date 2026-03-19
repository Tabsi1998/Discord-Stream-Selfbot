#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  Discord Stream Selfbot - Konfiguration aendern
#  Aendere Einstellungen ohne Neuinstallation
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
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"

# ── Helper ──────────────────────────────────────────────────────
print_success() { echo -e "  ${GREEN}✓${NC} $1"; }
print_info()    { echo -e "  ${BLUE}i${NC} $1"; }
print_warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
print_error()   { echo -e "  ${RED}✗${NC} $1"; }

prompt_input() {
  local label=$1; local default=$2; local result
  if [ -n "$default" ]; then
    echo -en "  ${BOLD}$label${NC} ${DIM}[$default]${NC}: "
  else
    echo -en "  ${BOLD}$label${NC}: "
  fi
  read -r result
  [ -z "$result" ] && result="$default"
  echo "$result"
}

prompt_secret() {
  local label=$1; local current=$2; local result
  if [ -n "$current" ]; then
    local masked="${current:0:8}...${current: -4}"
    echo -en "  ${BOLD}$label${NC} ${DIM}[aktuell: $masked | Enter = behalten]${NC}: "
  else
    echo -en "  ${BOLD}$label${NC}: "
  fi
  if [ -t 0 ] && command -v stty &>/dev/null; then
    stty -echo; read -r result; stty echo; echo ""
  else
    read -r result
  fi
  [ -z "$result" ] && result="$current"
  echo "$result"
}

prompt_yn() {
  local label=$1; local default=$2; local result
  if [ "$default" = "y" ]; then
    echo -en "  ${BOLD}$label${NC} ${DIM}[J/n]${NC}: "
  else
    echo -en "  ${BOLD}$label${NC} ${DIM}[j/N]${NC}: "
  fi
  read -r result
  result=$(echo "$result" | tr '[:upper:]' '[:lower:]')
  [ -z "$result" ] && result="$default"
  case "$result" in j|y|ja|yes) echo "1" ;; *) echo "0" ;; esac
}

read_env_value() {
  local key=$1
  [ -f "$ENV_FILE" ] && grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true
}

# ══════════════════════════════════════════════════════════════════

clear
echo ""
echo -e "${MAGENTA}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║   Discord Stream Selfbot - Konfiguration            ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

if [ ! -f "$ENV_FILE" ]; then
  print_error "Keine Konfiguration gefunden. Zuerst ./install.sh ausfuehren."
  exit 1
fi

# Aktuelle Werte laden
CUR_TOKEN=$(read_env_value "DISCORD_TOKEN")
CUR_PORT=$(read_env_value "HOST_PORT")
CUR_IPORT=$(read_env_value "PORT")
CUR_TZ=$(read_env_value "TZ")
CUR_CMD=$(read_env_value "DISCORD_COMMANDS_ENABLED")
CUR_PREFIX=$(read_env_value "COMMAND_PREFIX")
CUR_IDS=$(read_env_value "COMMAND_ALLOWED_AUTHOR_IDS")
CUR_YTDLP=$(read_env_value "YT_DLP_FORMAT")
CUR_POLL=$(read_env_value "SCHEDULER_POLL_MS")
CUR_TIMEOUT=$(read_env_value "STARTUP_TIMEOUT_MS")

echo ""
echo -e "  ${BOLD}Aktuelle Konfiguration:${NC}"
echo -e "  ${DIM}─────────────────────────────────────────────${NC}"
echo -e "  ${DIM}1)${NC} Discord Token:     ${CUR_TOKEN:0:8}...${CUR_TOKEN: -4}"
echo -e "  ${DIM}2)${NC} Web Panel Port:    $CUR_PORT"
echo -e "  ${DIM}3)${NC} Zeitzone:          $CUR_TZ"
echo -e "  ${DIM}4)${NC} Chat-Befehle:      $([ "$CUR_CMD" = "1" ] && echo "Aktiv ($CUR_PREFIX)" || echo "Aus")"
echo -e "  ${DIM}5)${NC} Erlaubte User-IDs: ${CUR_IDS:-nur du selbst}"
echo -e "  ${DIM}6)${NC} yt-dlp Format:     ${CUR_YTDLP:0:40}..."
echo -e "  ${DIM}7)${NC} Scheduler Poll:    ${CUR_POLL}ms"
echo ""

echo -e "  ${BOLD}Was moechtest du aendern?${NC}"
echo ""
echo -e "  ${CYAN}1${NC} - Discord Token"
echo -e "  ${CYAN}2${NC} - Web Panel Port"
echo -e "  ${CYAN}3${NC} - Zeitzone"
echo -e "  ${CYAN}4${NC} - Chat-Befehle"
echo -e "  ${CYAN}5${NC} - Erlaubte User-IDs"
echo -e "  ${CYAN}6${NC} - yt-dlp Format"
echo -e "  ${CYAN}7${NC} - Scheduler Einstellungen"
echo -e "  ${CYAN}a${NC} - Alles aendern"
echo -e "  ${CYAN}q${NC} - Abbrechen"
echo ""
echo -en "  ${BOLD}Auswahl${NC}: "
read -r CHOICE

# Backup
cp "$ENV_FILE" "$ENV_BACKUP"

case "$CHOICE" in
  1)
    NEW_TOKEN=$(prompt_secret "Neuer Discord Token" "$CUR_TOKEN")
    sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=$NEW_TOKEN|" "$ENV_FILE"
    print_success "Token aktualisiert"
    ;;
  2)
    NEW_PORT=$(prompt_input "Neuer Web Panel Port" "$CUR_PORT")
    NEW_IPORT=$(prompt_input "Neuer Container Port" "$CUR_IPORT")
    sed -i "s|^HOST_PORT=.*|HOST_PORT=$NEW_PORT|" "$ENV_FILE"
    sed -i "s|^PORT=.*|PORT=$NEW_IPORT|" "$ENV_FILE"
    print_success "Port aktualisiert"
    ;;
  3)
    NEW_TZ=$(prompt_input "Neue Zeitzone" "$CUR_TZ")
    sed -i "s|^TZ=.*|TZ=$NEW_TZ|" "$ENV_FILE"
    print_success "Zeitzone aktualisiert"
    ;;
  4)
    CMD_DEF="y"; [ "$CUR_CMD" = "0" ] && CMD_DEF="n"
    NEW_CMD=$(prompt_yn "Chat-Befehle aktivieren?" "$CMD_DEF")
    NEW_PREFIX=$(prompt_input "Befehl-Prefix" "$CUR_PREFIX")
    sed -i "s|^DISCORD_COMMANDS_ENABLED=.*|DISCORD_COMMANDS_ENABLED=$NEW_CMD|" "$ENV_FILE"
    sed -i "s|^COMMAND_PREFIX=.*|COMMAND_PREFIX=$NEW_PREFIX|" "$ENV_FILE"
    print_success "Chat-Befehle aktualisiert"
    ;;
  5)
    NEW_IDS=$(prompt_input "Erlaubte User-IDs (komma-getrennt)" "$CUR_IDS")
    sed -i "s|^COMMAND_ALLOWED_AUTHOR_IDS=.*|COMMAND_ALLOWED_AUTHOR_IDS=$NEW_IDS|" "$ENV_FILE"
    print_success "User-IDs aktualisiert"
    ;;
  6)
    NEW_YTDLP=$(prompt_input "yt-dlp Format" "$CUR_YTDLP")
    sed -i "s|^YT_DLP_FORMAT=.*|YT_DLP_FORMAT=$NEW_YTDLP|" "$ENV_FILE"
    print_success "yt-dlp Format aktualisiert"
    ;;
  7)
    NEW_POLL=$(prompt_input "Scheduler Poll (ms)" "$CUR_POLL")
    NEW_TIMEOUT=$(prompt_input "Startup Timeout (ms)" "$CUR_TIMEOUT")
    sed -i "s|^SCHEDULER_POLL_MS=.*|SCHEDULER_POLL_MS=$NEW_POLL|" "$ENV_FILE"
    sed -i "s|^STARTUP_TIMEOUT_MS=.*|STARTUP_TIMEOUT_MS=$NEW_TIMEOUT|" "$ENV_FILE"
    print_success "Scheduler aktualisiert"
    ;;
  a|A)
    # Alles - wie install.sh aber kompakt
    echo ""
    NEW_TOKEN=$(prompt_secret "Discord Token" "$CUR_TOKEN")
    NEW_PORT=$(prompt_input "Web Panel Port" "$CUR_PORT")
    NEW_TZ=$(prompt_input "Zeitzone" "$CUR_TZ")
    CMD_DEF="y"; [ "$CUR_CMD" = "0" ] && CMD_DEF="n"
    NEW_CMD=$(prompt_yn "Chat-Befehle aktivieren?" "$CMD_DEF")
    NEW_PREFIX=$(prompt_input "Befehl-Prefix" "$CUR_PREFIX")
    NEW_IDS=$(prompt_input "Erlaubte User-IDs" "$CUR_IDS")
    sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=$NEW_TOKEN|" "$ENV_FILE"
    sed -i "s|^HOST_PORT=.*|HOST_PORT=$NEW_PORT|" "$ENV_FILE"
    sed -i "s|^TZ=.*|TZ=$NEW_TZ|" "$ENV_FILE"
    sed -i "s|^DISCORD_COMMANDS_ENABLED=.*|DISCORD_COMMANDS_ENABLED=$NEW_CMD|" "$ENV_FILE"
    sed -i "s|^COMMAND_PREFIX=.*|COMMAND_PREFIX=$NEW_PREFIX|" "$ENV_FILE"
    sed -i "s|^COMMAND_ALLOWED_AUTHOR_IDS=.*|COMMAND_ALLOWED_AUTHOR_IDS=$NEW_IDS|" "$ENV_FILE"
    print_success "Alle Einstellungen aktualisiert"
    ;;
  q|Q)
    print_info "Abgebrochen."
    exit 0
    ;;
  *)
    print_error "Ungueltige Auswahl"
    exit 1
    ;;
esac

echo ""
REBUILD=$(prompt_yn "Container mit neuer Konfiguration neu starten?" "y")
if [ "$REBUILD" = "1" ]; then
  print_info "Starte Container neu..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build 2>&1 | while IFS= read -r line; do echo "  $line"; done
  echo ""
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps 2>&1 | while IFS= read -r line; do echo "  $line"; done
  echo ""
  print_success "Container neu gestartet"
else
  print_warn "Container laeuft noch mit alter Konfiguration!"
  print_info "Starte manuell mit: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d --build"
fi

HOST_PORT=$(read_env_value "HOST_PORT")
echo ""
echo -e "  ${BOLD}Control Panel:${NC}  http://localhost:${HOST_PORT:-3099}"
echo ""
