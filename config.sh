#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  Discord Stream Selfbot - Konfiguration aendern
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
print_success() { echo -e "  ${GREEN}✓${NC} $1" >&2; }
print_info()    { echo -e "  ${BLUE}i${NC} $1" >&2; }
print_warn()    { echo -e "  ${YELLOW}!${NC} $1" >&2; }
print_error()   { echo -e "  ${RED}✗${NC} $1" >&2; }

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
  [ -z "$answer" ] && answer="$default"
  printf '%s' "$answer"
}

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
  case "$answer" in j|y|ja|yes) printf '1' ;; *) printf '0' ;; esac
}

read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] && grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true
}

# ══════════════════════════════════════════════════════════════════

clear
echo "" >&2
echo -e "${MAGENTA}${BOLD}" >&2
echo "  ╔══════════════════════════════════════════════════════╗" >&2
echo "  ║   Discord Stream Selfbot - Konfiguration            ║" >&2
echo "  ╚══════════════════════════════════════════════════════╝" >&2
echo -e "${NC}" >&2

if [ ! -f "$ENV_FILE" ]; then
  print_error "Keine Konfiguration - zuerst ./install.sh"
  exit 1
fi

# Aktuelle Werte
CUR_TOKEN=$(read_env "DISCORD_TOKEN")
CUR_TZ=$(read_env "TZ")
CUR_CMD=$(read_env "DISCORD_COMMANDS_ENABLED")
CUR_PREFIX=$(read_env "COMMAND_PREFIX")
CUR_IDS=$(read_env "COMMAND_ALLOWED_AUTHOR_IDS")
CUR_YTDLP=$(read_env "YT_DLP_FORMAT")
CUR_POLL=$(read_env "SCHEDULER_POLL_MS")
CUR_TIMEOUT=$(read_env "STARTUP_TIMEOUT_MS")

echo "" >&2
echo -e "  ${BOLD}Aktuelle Konfiguration:${NC}" >&2
echo -e "  ${DIM}─────────────────────────────────────────────${NC}" >&2
echo -e "  ${DIM}1)${NC} Discord Token:     ${CUR_TOKEN:0:8}...${CUR_TOKEN: -4}" >&2
echo -e "  ${DIM}2)${NC} Zeitzone:          $CUR_TZ" >&2
echo -e "  ${DIM}3)${NC} Chat-Befehle:      $([ "$CUR_CMD" = "1" ] && echo "Aktiv ($CUR_PREFIX)" || echo "Aus")" >&2
echo -e "  ${DIM}4)${NC} Erlaubte User-IDs: ${CUR_IDS:-nur du selbst}" >&2
echo -e "  ${DIM}5)${NC} yt-dlp Format:     ${CUR_YTDLP:0:40}..." >&2
echo -e "  ${DIM}6)${NC} Scheduler:         Poll ${CUR_POLL}ms / Timeout ${CUR_TIMEOUT}ms" >&2
echo "" >&2
echo -e "  ${BOLD}Was aendern?${NC}" >&2
echo "" >&2
echo -e "  ${CYAN}1${NC} - Discord Token       ${CYAN}4${NC} - Erlaubte User-IDs" >&2
echo -e "  ${CYAN}2${NC} - Zeitzone            ${CYAN}5${NC} - yt-dlp Format" >&2
echo -e "  ${CYAN}3${NC} - Chat-Befehle        ${CYAN}6${NC} - Scheduler" >&2
echo -e "  ${CYAN}a${NC} - Alles               ${CYAN}q${NC} - Abbrechen" >&2
echo "" >&2
printf "  ${BOLD}Auswahl${NC}: " >&2
read -r CHOICE

# Backup
cp "$ENV_FILE" "$ENV_BACKUP"

case "$CHOICE" in
  1)
    NEW_TOKEN=$(ask "Neuer Discord Token" "$CUR_TOKEN")
    sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=$NEW_TOKEN|" "$ENV_FILE"
    print_success "Token aktualisiert"
    ;;
  2)
    NEW_TZ=$(ask "Neue Zeitzone" "$CUR_TZ")
    sed -i "s|^TZ=.*|TZ=$NEW_TZ|" "$ENV_FILE"
    print_success "Zeitzone aktualisiert"
    ;;
  3)
    CMD_DEF="y"; [ "$CUR_CMD" = "0" ] && CMD_DEF="n"
    NEW_CMD=$(ask_yn "Chat-Befehle aktivieren?" "$CMD_DEF")
    NEW_PREFIX=$(ask "Prefix" "$CUR_PREFIX")
    sed -i "s|^DISCORD_COMMANDS_ENABLED=.*|DISCORD_COMMANDS_ENABLED=$NEW_CMD|" "$ENV_FILE"
    sed -i "s|^COMMAND_PREFIX=.*|COMMAND_PREFIX=$NEW_PREFIX|" "$ENV_FILE"
    print_success "Chat-Befehle aktualisiert"
    ;;
  4)
    NEW_IDS=$(ask "Erlaubte User-IDs (komma-getrennt)" "$CUR_IDS")
    sed -i "s|^COMMAND_ALLOWED_AUTHOR_IDS=.*|COMMAND_ALLOWED_AUTHOR_IDS=$NEW_IDS|" "$ENV_FILE"
    print_success "User-IDs aktualisiert"
    ;;
  5)
    NEW_YTDLP=$(ask "yt-dlp Format" "$CUR_YTDLP")
    sed -i "s|^YT_DLP_FORMAT=.*|YT_DLP_FORMAT=$NEW_YTDLP|" "$ENV_FILE"
    print_success "yt-dlp Format aktualisiert"
    ;;
  6)
    NEW_POLL=$(ask "Scheduler Poll (ms)" "$CUR_POLL")
    NEW_TIMEOUT=$(ask "Startup Timeout (ms)" "$CUR_TIMEOUT")
    sed -i "s|^SCHEDULER_POLL_MS=.*|SCHEDULER_POLL_MS=$NEW_POLL|" "$ENV_FILE"
    sed -i "s|^STARTUP_TIMEOUT_MS=.*|STARTUP_TIMEOUT_MS=$NEW_TIMEOUT|" "$ENV_FILE"
    print_success "Scheduler aktualisiert"
    ;;
  a|A)
    echo "" >&2
    NEW_TOKEN=$(ask "Discord Token" "$CUR_TOKEN")
    NEW_TZ=$(ask "Zeitzone" "$CUR_TZ")
    CMD_DEF="y"; [ "$CUR_CMD" = "0" ] && CMD_DEF="n"
    NEW_CMD=$(ask_yn "Chat-Befehle aktivieren?" "$CMD_DEF")
    NEW_PREFIX=$(ask "Prefix" "$CUR_PREFIX")
    NEW_IDS=$(ask "Erlaubte User-IDs" "$CUR_IDS")
    sed -i "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=$NEW_TOKEN|" "$ENV_FILE"
    sed -i "s|^TZ=.*|TZ=$NEW_TZ|" "$ENV_FILE"
    sed -i "s|^DISCORD_COMMANDS_ENABLED=.*|DISCORD_COMMANDS_ENABLED=$NEW_CMD|" "$ENV_FILE"
    sed -i "s|^COMMAND_PREFIX=.*|COMMAND_PREFIX=$NEW_PREFIX|" "$ENV_FILE"
    sed -i "s|^COMMAND_ALLOWED_AUTHOR_IDS=.*|COMMAND_ALLOWED_AUTHOR_IDS=$NEW_IDS|" "$ENV_FILE"
    print_success "Alles aktualisiert"
    ;;
  q|Q)
    print_info "Abgebrochen."
    exit 0
    ;;
  *)
    print_error "Ungueltige Auswahl: $CHOICE"
    exit 1
    ;;
esac

echo "" >&2
REBUILD=$(ask_yn "Container mit neuer Konfiguration neu starten?" "y")
if [ "$REBUILD" = "1" ]; then
  print_info "Starte Container neu..." >&2
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done
  echo "" >&2
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done
  echo "" >&2
  print_success "Container neu gestartet"
else
  print_warn "Container laeuft mit alter Konfiguration!"
fi

HOST_PORT=$(read_env "HOST_PORT")
echo "" >&2
echo -e "  ${BOLD}Control Panel:${NC}  http://localhost:${HOST_PORT:-3099}" >&2
echo "" >&2
