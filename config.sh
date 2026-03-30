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

resolve_selfbot_profiles_file() {
  local configured
  configured=$(read_env "SELFBOT_CONFIG_FILE")
  local file_name
  file_name=$(basename "${configured:-/app/examples/control-panel/data/selfbot-profiles.tsv}")
  printf '%s/%s' "$DEPLOY_DIR/data" "$file_name"
}

ensure_selfbot_profiles_file() {
  local file
  file=$(resolve_selfbot_profiles_file)
  mkdir -p "$(dirname "$file")"
  if [ ! -f "$file" ]; then
    cat > "$file" << 'PROFILESEOF'
# Zusatz-Selfbots (tab-getrennt)
# id	name	token	idle_status_text	stream_status_text	voice_status_text	enabled	command_enabled
PROFILESEOF
  fi
}

count_selfbot_profiles() {
  local file
  file=$(resolve_selfbot_profiles_file)
  if [ ! -f "$file" ]; then
    printf '0'
    return
  fi
  awk 'BEGIN { count = 0 } /^[[:space:]]*#/ { next } /^[[:space:]]*$/ { next } { count += 1 } END { print count }' "$file" 2>/dev/null || printf '0'
}

sanitize_profile_field() {
  printf '%s' "$1" | tr '\t' ' ' | sed 's/[[:space:]]\+$//'
}

append_selfbot_profile() {
  local id="$1"
  local name="$2"
  local token="$3"
  local idle_text="$4"
  local stream_text="$5"
  local voice_text="$6"
  local file
  file=$(resolve_selfbot_profiles_file)
  ensure_selfbot_profiles_file
  printf '%s\t%s\t%s\t%s\t%s\t%s\t1\t0\n' \
    "$(sanitize_profile_field "$id")" \
    "$(sanitize_profile_field "$name")" \
    "$(sanitize_profile_field "$token")" \
    "$(sanitize_profile_field "$idle_text")" \
    "$(sanitize_profile_field "$stream_text")" \
    "$(sanitize_profile_field "$voice_text")" >> "$file"
}

remove_selfbot_profile() {
  local id="$1"
  local file temp
  file=$(resolve_selfbot_profiles_file)
  temp="${file}.tmp"
  awk -F '\t' -v target="$id" 'BEGIN { removed = 0 } /^#/ { print; next } $1 == target { removed = 1; next } { print } END { if (!removed) exit 7 }' "$file" > "$temp" || return 1
  mv "$temp" "$file"
}

print_selfbot_profiles() {
  local file
  file=$(resolve_selfbot_profiles_file)
  ensure_selfbot_profiles_file
  local count=0
  while IFS=$'\t' read -r id name _ idle_text stream_text voice_text enabled _; do
    [ -z "${id:-}" ] && continue
    [[ "$id" =~ ^# ]] && continue
    count=$((count + 1))
    echo -e "  ${DIM}- ${id}${NC} | ${name} | Idle: ${idle_text:-standard} | Stream: ${stream_text:-standard} | Voice: ${voice_text:-standard} | ${enabled:-1}" >&2
  done < "$file"
  if [ "$count" -eq 0 ]; then
    print_info "Keine Zusatz-Selfbots eingetragen"
  fi
}

# ── Helper ──────────────────────────────────────────────────────
print_success() { echo -e "  ${GREEN}✓${NC} $1" >&2; }
print_info()    { echo -e "  ${BLUE}i${NC} $1" >&2; }
print_warn()    { echo -e "  ${YELLOW}!${NC} $1" >&2; }
print_error()   { echo -e "  ${RED}✗${NC} $1" >&2; }

set_env_value() {
  local key="$1"
  local value="$2"
  local escaped_value
  escaped_value=$(printf '%s' "$value" | sed 's/[&|]/\\&/g')
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${escaped_value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

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
CUR_YTDLP_BROWSER=$(read_env "YT_DLP_COOKIES_FROM_BROWSER")
CUR_YTDLP_COOKIE_FILE=$(read_env "YT_DLP_COOKIES_FILE")
CUR_YTDLP_PACKAGE=$(read_env "YT_DLP_PACKAGE")
CUR_YTDLP=$(read_env "YT_DLP_FORMAT")
CUR_POLL=$(read_env "SCHEDULER_POLL_MS")
CUR_TIMEOUT=$(read_env "STARTUP_TIMEOUT_MS")
CUR_PANEL_AUTH=$(read_env "PANEL_AUTH_ENABLED")
CUR_PANEL_USER=$(read_env "PANEL_AUTH_USERNAME")
CUR_PANEL_PASSWORD=$(read_env "PANEL_AUTH_PASSWORD")
CUR_PRIMARY_SELFBOT_NAME=$(read_env "PRIMARY_SELFBOT_NAME")
CUR_IDLE_ACTIVITY_TEXT=$(read_env "IDLE_ACTIVITY_TEXT")
CUR_STREAM_ACTIVITY_TEXT=$(read_env "STREAM_ACTIVITY_TEXT")
CUR_VOICE_STATUS_TEMPLATE=$(read_env "VOICE_STATUS_TEMPLATE")
CUR_SELFBOT_CONFIG_FILE=$(read_env "SELFBOT_CONFIG_FILE")
CUR_SELFBOT_COUNT=$(count_selfbot_profiles)

echo "" >&2
echo -e "  ${BOLD}Aktuelle Konfiguration:${NC}" >&2
echo -e "  ${DIM}─────────────────────────────────────────────${NC}" >&2
echo -e "  ${DIM}1)${NC} Discord Token:     $(mask_secret "$CUR_TOKEN")" >&2
echo -e "  ${DIM}2)${NC} Zeitzone:          $CUR_TZ" >&2
echo -e "  ${DIM}3)${NC} Chat-Befehle:      $([ "$CUR_CMD" = "1" ] && echo "Aktiv ($CUR_PREFIX)" || echo "Aus")" >&2
echo -e "  ${DIM}4)${NC} Erlaubte User-IDs: ${CUR_IDS:-nur du selbst}" >&2
echo -e "  ${DIM}5)${NC} yt-dlp Cookies:    ${CUR_YTDLP_BROWSER:-${CUR_YTDLP_COOKIE_FILE:-keine}}" >&2
echo -e "  ${DIM}6)${NC} yt-dlp Paket:     ${CUR_YTDLP_PACKAGE:-yt-dlp[default]}" >&2
echo -e "  ${DIM}7)${NC} yt-dlp Format:     ${CUR_YTDLP:0:40}..." >&2
echo -e "  ${DIM}8)${NC} Scheduler:         Poll ${CUR_POLL}ms / Timeout ${CUR_TIMEOUT}ms" >&2
echo -e "  ${DIM}9)${NC} Panel Login:       $([ "$CUR_PANEL_AUTH" = "1" ] && echo "Aktiv (${CUR_PANEL_USER:-unbekannt})" || echo "Aus")" >&2
echo -e "  ${DIM}10)${NC} Selfbots:         ${CUR_PRIMARY_SELFBOT_NAME:-Primary Selfbot} | Zusatzbots ${CUR_SELFBOT_COUNT}" >&2
echo "" >&2
echo -e "  ${BOLD}Was aendern?${NC}" >&2
echo "" >&2
echo -e "  ${CYAN}1${NC} - Discord Token       ${CYAN}4${NC} - Erlaubte User-IDs" >&2
echo -e "  ${CYAN}2${NC} - Zeitzone            ${CYAN}5${NC} - yt-dlp Cookies" >&2
echo -e "  ${CYAN}3${NC} - Chat-Befehle        ${CYAN}6${NC} - yt-dlp Paket" >&2
echo -e "  ${CYAN}7${NC} - yt-dlp Format       ${CYAN}8${NC} - Scheduler" >&2
echo -e "  ${CYAN}9${NC} - Web-Panel Login" >&2
echo -e "  ${CYAN}10${NC} - Selfbot Status / Zusatzbots" >&2
echo -e "  ${CYAN}a${NC} - Alles               ${CYAN}q${NC} - Abbrechen" >&2
echo "" >&2
printf "  ${BOLD}Auswahl${NC}: " >&2
read -r CHOICE

# Backup
cp "$ENV_FILE" "$ENV_BACKUP"

case "$CHOICE" in
  1)
    NEW_TOKEN=$(ask_secret "Neuer Discord Token" "$CUR_TOKEN")
    set_env_value "DISCORD_TOKEN" "$NEW_TOKEN"
    print_success "Token aktualisiert"
    ;;
  2)
    NEW_TZ=$(ask "Neue Zeitzone" "$CUR_TZ")
    set_env_value "TZ" "$NEW_TZ"
    print_success "Zeitzone aktualisiert"
    ;;
  3)
    CMD_DEF="y"; [ "$CUR_CMD" = "0" ] && CMD_DEF="n"
    NEW_CMD=$(ask_yn "Chat-Befehle aktivieren?" "$CMD_DEF")
    NEW_PREFIX=$(ask "Prefix" "$CUR_PREFIX")
    set_env_value "DISCORD_COMMANDS_ENABLED" "$NEW_CMD"
    set_env_value "COMMAND_PREFIX" "$NEW_PREFIX"
    print_success "Chat-Befehle aktualisiert"
    ;;
  4)
    NEW_IDS=$(ask "Erlaubte User-IDs (komma-getrennt)" "$CUR_IDS")
    set_env_value "COMMAND_ALLOWED_AUTHOR_IDS" "$NEW_IDS"
    print_success "User-IDs aktualisiert"
    ;;
  5)
    NEW_BROWSER=$(ask "yt-dlp Browser-Cookies (optional)" "$CUR_YTDLP_BROWSER")
    NEW_COOKIE_FILE=$(ask "yt-dlp Cookie-Datei (optional)" "$CUR_YTDLP_COOKIE_FILE")
    set_env_value "YT_DLP_COOKIES_FROM_BROWSER" "$NEW_BROWSER"
    set_env_value "YT_DLP_COOKIES_FILE" "$NEW_COOKIE_FILE"
    print_success "yt-dlp Cookies aktualisiert"
    ;;
  6)
    NEW_YTDLP_PACKAGE=$(ask "yt-dlp Paket/Spec" "${CUR_YTDLP_PACKAGE:-yt-dlp[default]}")
    set_env_value "YT_DLP_PACKAGE" "$NEW_YTDLP_PACKAGE"
    print_success "yt-dlp Paket aktualisiert"
    ;;
  7)
    NEW_YTDLP=$(ask "yt-dlp Format" "$CUR_YTDLP")
    set_env_value "YT_DLP_FORMAT" "$NEW_YTDLP"
    print_success "yt-dlp Format aktualisiert"
    ;;
  8)
    NEW_POLL=$(ask "Scheduler Poll (ms)" "$CUR_POLL")
    NEW_TIMEOUT=$(ask "Startup Timeout (ms)" "$CUR_TIMEOUT")
    set_env_value "SCHEDULER_POLL_MS" "$NEW_POLL"
    set_env_value "STARTUP_TIMEOUT_MS" "$NEW_TIMEOUT"
    print_success "Scheduler aktualisiert"
    ;;
  9)
    PANEL_DEF="n"; [ "$CUR_PANEL_AUTH" = "1" ] && PANEL_DEF="y"
    NEW_PANEL_AUTH=$(ask_yn "Web-Panel mit Login absichern?" "$PANEL_DEF")
    NEW_PANEL_USER=""
    NEW_PANEL_PASSWORD=""
    if [ "$NEW_PANEL_AUTH" = "1" ]; then
      NEW_PANEL_USER=$(ask "Panel Benutzername" "${CUR_PANEL_USER:-admin}")
      NEW_PANEL_PASSWORD=$(ask_secret "Panel Passwort" "$CUR_PANEL_PASSWORD")
    fi
    validate_panel_auth "$NEW_PANEL_AUTH" "$NEW_PANEL_USER" "$NEW_PANEL_PASSWORD"
    set_env_value "PANEL_AUTH_ENABLED" "$NEW_PANEL_AUTH"
    set_env_value "PANEL_AUTH_USERNAME" "$NEW_PANEL_USER"
    set_env_value "PANEL_AUTH_PASSWORD" "$NEW_PANEL_PASSWORD"
    print_success "Panel Login aktualisiert"
    ;;
  10)
    ensure_selfbot_profiles_file
    NEW_PRIMARY_SELFBOT_NAME=$(ask "Primaerer Selfbot Name" "${CUR_PRIMARY_SELFBOT_NAME:-Primary Selfbot}")
    NEW_IDLE_ACTIVITY_TEXT=$(ask "Idle-Status Text" "${CUR_IDLE_ACTIVITY_TEXT:-THE LION SQUAD - eSPORTS}")
    NEW_STREAM_ACTIVITY_TEXT=$(ask "Streaming-Status Text" "${CUR_STREAM_ACTIVITY_TEXT:-{{title}}}")
    NEW_VOICE_STATUS_TEMPLATE=$(ask "Voice-Status Text" "${CUR_VOICE_STATUS_TEMPLATE:-Now streaming: {{title}}}")
    set_env_value "SELFBOT_CONFIG_FILE" "${CUR_SELFBOT_CONFIG_FILE:-/app/examples/control-panel/data/selfbot-profiles.tsv}"
    set_env_value "PRIMARY_SELFBOT_NAME" "$NEW_PRIMARY_SELFBOT_NAME"
    set_env_value "IDLE_ACTIVITY_TEXT" "$NEW_IDLE_ACTIVITY_TEXT"
    set_env_value "STREAM_ACTIVITY_TEXT" "$NEW_STREAM_ACTIVITY_TEXT"
    set_env_value "VOICE_STATUS_TEMPLATE" "$NEW_VOICE_STATUS_TEMPLATE"
    echo "" >&2
    print_info "Zusatz-Selfbots:"
    print_selfbot_profiles
    echo "" >&2
    EXTRA_ACTION=$(ask "Zusatzbots: (a) Hinzufuegen, (r) Entfernen, (l) Anzeigen, Enter = fertig" "")
    case "$EXTRA_ACTION" in
      a|A)
        EXTRA_ID=$(ask "Selfbot ID" "")
        EXTRA_NAME=$(ask "Selfbot Name" "")
        EXTRA_TOKEN=$(ask_secret "Selfbot Token" "")
        EXTRA_IDLE=$(ask "Idle-Status Text" "$NEW_IDLE_ACTIVITY_TEXT")
        EXTRA_STREAM=$(ask "Streaming-Status Text" "$NEW_STREAM_ACTIVITY_TEXT")
        EXTRA_VOICE=$(ask "Voice-Status Text" "$NEW_VOICE_STATUS_TEMPLATE")
        if [ -z "$EXTRA_ID" ] || [ -z "$EXTRA_NAME" ] || [ -z "$EXTRA_TOKEN" ]; then
          print_error "ID, Name und Token sind fuer Zusatz-Selfbots Pflicht"
          exit 1
        fi
        append_selfbot_profile "$EXTRA_ID" "$EXTRA_NAME" "$EXTRA_TOKEN" "$EXTRA_IDLE" "$EXTRA_STREAM" "$EXTRA_VOICE"
        print_success "Zusatz-Selfbot gespeichert"
        ;;
      r|R)
        REMOVE_ID=$(ask "Selfbot ID zum Entfernen" "")
        if [ -z "$REMOVE_ID" ]; then
          print_error "Bitte eine Selfbot ID angeben"
          exit 1
        fi
        if remove_selfbot_profile "$REMOVE_ID"; then
          print_success "Zusatz-Selfbot entfernt"
        else
          print_error "Selfbot ID nicht gefunden: $REMOVE_ID"
          exit 1
        fi
        ;;
      l|L)
        print_selfbot_profiles
        print_success "Selfbot-Status aktualisiert"
        ;;
      "")
        print_success "Selfbot-Status aktualisiert"
        ;;
      *)
        print_error "Ungueltige Zusatzbot-Auswahl: $EXTRA_ACTION"
        exit 1
        ;;
    esac
    ;;
  a|A)
    echo "" >&2
    NEW_TOKEN=$(ask_secret "Discord Token" "$CUR_TOKEN")
    NEW_TZ=$(ask "Zeitzone" "$CUR_TZ")
    CMD_DEF="y"; [ "$CUR_CMD" = "0" ] && CMD_DEF="n"
    NEW_CMD=$(ask_yn "Chat-Befehle aktivieren?" "$CMD_DEF")
    NEW_PREFIX=$(ask "Prefix" "$CUR_PREFIX")
    NEW_IDS=$(ask "Erlaubte User-IDs" "$CUR_IDS")
    PANEL_DEF="n"; [ "$CUR_PANEL_AUTH" = "1" ] && PANEL_DEF="y"
    NEW_PANEL_AUTH=$(ask_yn "Web-Panel mit Login absichern?" "$PANEL_DEF")
    NEW_PANEL_USER=""
    NEW_PANEL_PASSWORD=""
    if [ "$NEW_PANEL_AUTH" = "1" ]; then
      NEW_PANEL_USER=$(ask "Panel Benutzername" "${CUR_PANEL_USER:-admin}")
      NEW_PANEL_PASSWORD=$(ask_secret "Panel Passwort" "$CUR_PANEL_PASSWORD")
    fi
    NEW_BROWSER=$(ask "yt-dlp Browser-Cookies (optional)" "$CUR_YTDLP_BROWSER")
    NEW_COOKIE_FILE=$(ask "yt-dlp Cookie-Datei (optional)" "$CUR_YTDLP_COOKIE_FILE")
    NEW_YTDLP_PACKAGE=$(ask "yt-dlp Paket/Spec" "${CUR_YTDLP_PACKAGE:-yt-dlp[default]}")
    NEW_YTDLP=$(ask "yt-dlp Format" "$CUR_YTDLP")
    NEW_POLL=$(ask "Scheduler Poll (ms)" "$CUR_POLL")
    NEW_TIMEOUT=$(ask "Startup Timeout (ms)" "$CUR_TIMEOUT")
    NEW_PRIMARY_SELFBOT_NAME=$(ask "Primaerer Selfbot Name" "${CUR_PRIMARY_SELFBOT_NAME:-Primary Selfbot}")
    NEW_IDLE_ACTIVITY_TEXT=$(ask "Idle-Status Text" "${CUR_IDLE_ACTIVITY_TEXT:-THE LION SQUAD - eSPORTS}")
    NEW_STREAM_ACTIVITY_TEXT=$(ask "Streaming-Status Text" "${CUR_STREAM_ACTIVITY_TEXT:-{{title}}}")
    NEW_VOICE_STATUS_TEMPLATE=$(ask "Voice-Status Text" "${CUR_VOICE_STATUS_TEMPLATE:-Now streaming: {{title}}}")
    validate_panel_auth "$NEW_PANEL_AUTH" "$NEW_PANEL_USER" "$NEW_PANEL_PASSWORD"
    set_env_value "DISCORD_TOKEN" "$NEW_TOKEN"
    set_env_value "TZ" "$NEW_TZ"
    set_env_value "DISCORD_COMMANDS_ENABLED" "$NEW_CMD"
    set_env_value "COMMAND_PREFIX" "$NEW_PREFIX"
    set_env_value "COMMAND_ALLOWED_AUTHOR_IDS" "$NEW_IDS"
    set_env_value "PANEL_AUTH_ENABLED" "$NEW_PANEL_AUTH"
    set_env_value "PANEL_AUTH_USERNAME" "$NEW_PANEL_USER"
    set_env_value "PANEL_AUTH_PASSWORD" "$NEW_PANEL_PASSWORD"
    set_env_value "SELFBOT_CONFIG_FILE" "${CUR_SELFBOT_CONFIG_FILE:-/app/examples/control-panel/data/selfbot-profiles.tsv}"
    set_env_value "PRIMARY_SELFBOT_NAME" "$NEW_PRIMARY_SELFBOT_NAME"
    set_env_value "IDLE_ACTIVITY_TEXT" "$NEW_IDLE_ACTIVITY_TEXT"
    set_env_value "STREAM_ACTIVITY_TEXT" "$NEW_STREAM_ACTIVITY_TEXT"
    set_env_value "VOICE_STATUS_TEMPLATE" "$NEW_VOICE_STATUS_TEMPLATE"
    set_env_value "YT_DLP_COOKIES_FROM_BROWSER" "$NEW_BROWSER"
    set_env_value "YT_DLP_COOKIES_FILE" "$NEW_COOKIE_FILE"
    set_env_value "YT_DLP_PACKAGE" "$NEW_YTDLP_PACKAGE"
    set_env_value "YT_DLP_FORMAT" "$NEW_YTDLP"
    set_env_value "SCHEDULER_POLL_MS" "$NEW_POLL"
    set_env_value "STARTUP_TIMEOUT_MS" "$NEW_TIMEOUT"
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
  print_info "Starte Container mit neuer Konfiguration neu (kein Rebuild noetig)..." >&2
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done
  echo "" >&2
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done
  echo "" >&2
  YT_DLP_VERSION=$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T control-panel yt-dlp --version 2>/dev/null || true)
  if [ -n "$YT_DLP_VERSION" ]; then
    print_success "yt-dlp im Container: $YT_DLP_VERSION"
  fi
  print_success "Container neu gestartet (nur Konfiguration aktualisiert, kein Image-Neubau)"
else
  print_warn "Container laeuft mit alter Konfiguration!"
fi

HOST_PORT=$(read_env "HOST_PORT")
echo "" >&2
echo -e "  ${BOLD}Control Panel:${NC}  http://localhost:${HOST_PORT:-3099}" >&2
echo "" >&2
