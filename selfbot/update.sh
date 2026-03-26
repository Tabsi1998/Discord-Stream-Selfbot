#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  Discord Stream Selfbot - Updater
#  Git-Update ohne Verlust von Token, User-ID und Konfiguration
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
ENV_BACKUP="$DEPLOY_DIR/.env.pre-update"
DATA_DIR="$DEPLOY_DIR/data"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
STATE_FILE="$DATA_DIR/control-panel-state.json"
STATE_BACKUP="$DATA_DIR/control-panel-state.pre-update.json"

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

read_env() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true
  fi
}

# ══════════════════════════════════════════════════════════════════

clear
echo "" >&2
echo -e "${CYAN}${BOLD}" >&2
echo "  ╔══════════════════════════════════════════════════════╗" >&2
echo "  ║                                                      ║" >&2
echo "  ║   Discord Stream Selfbot - Updater                   ║" >&2
echo "  ║                                                      ║" >&2
echo "  ╚══════════════════════════════════════════════════════╝" >&2
echo -e "${NC}" >&2

# ── [1/5] Voraussetzungen ─────────────────────────────────────
print_step 1 5 "Voraussetzungen pruefen"

if ! command -v git &>/dev/null; then print_error "Git fehlt"; exit 1; fi
print_success "Git gefunden"

if ! command -v docker &>/dev/null; then print_error "Docker fehlt"; exit 1; fi
print_success "Docker gefunden"

if ! docker compose version &>/dev/null 2>&1; then print_error "Docker Compose fehlt"; exit 1; fi
print_success "Docker Compose gefunden"

if [ ! -d "$SCRIPT_DIR/.git" ]; then
  print_error "Kein Git Repo in: $SCRIPT_DIR"
  print_info "Repo mit 'git clone' herunterladen"
  exit 1
fi
print_success "Git Repository OK"

if [ ! -f "$ENV_FILE" ]; then
  print_error "Keine Konfiguration ($ENV_FILE) - zuerst ./install.sh"
  exit 1
fi
print_success "Konfiguration vorhanden"

# ── [2/5] Aktueller Stand ────────────────────────────────────
print_step 2 5 "Aktueller Stand"

CURRENT_BRANCH=$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
CURRENT_COMMIT=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")
CURRENT_DATE=$(git -C "$SCRIPT_DIR" log -1 --format="%ci" 2>/dev/null | cut -d' ' -f1,2 || echo "?")

echo "" >&2
echo -e "  ${BOLD}Aktuell:${NC}" >&2
echo -e "  ${DIM}Branch:${NC}  $CURRENT_BRANCH" >&2
echo -e "  ${DIM}Commit:${NC}  $CURRENT_COMMIT" >&2
echo -e "  ${DIM}Datum:${NC}   $CURRENT_DATE" >&2

# Lokale Aenderungen?
DIRTY=$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=no 2>/dev/null || true)
STASHED=false

if [ -n "$DIRTY" ]; then
  echo "" >&2
  print_warn "Lokale Aenderungen gefunden:"
  echo "" >&2
  git -C "$SCRIPT_DIR" status --porcelain --untracked-files=no 2>/dev/null | while IFS= read -r line; do
    echo -e "    ${YELLOW}$line${NC}" >&2
  done
  echo "" >&2

  STASH_IT=$(ask_yn "Aenderungen sichern (git stash) und weiter?" "y")
  if [ "$STASH_IT" = "1" ]; then
    git -C "$SCRIPT_DIR" stash push -m "update-backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null
    print_success "Gesichert (git stash) - spaeter: git stash pop"
    STASHED=true
  else
    print_warn "Abbruch. Committe oder stashe deine Aenderungen."
    exit 0
  fi
else
  print_success "Keine lokalen Aenderungen"
fi

# Auf Updates pruefen
echo "" >&2
print_info "Pruefe auf Updates..."
git -C "$SCRIPT_DIR" fetch origin "$CURRENT_BRANCH" 2>/dev/null

LOCAL_HEAD=$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null)
REMOTE_HEAD=$(git -C "$SCRIPT_DIR" rev-parse "origin/$CURRENT_BRANCH" 2>/dev/null || echo "")

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
  echo "" >&2
  print_success "Bereits auf neuestem Stand!"
  echo "" >&2
  REBUILD=$(ask_yn "Container trotzdem neu bauen?" "n")
  if [ "$REBUILD" = "0" ]; then
    [ "$STASHED" = true ] && git -C "$SCRIPT_DIR" stash pop 2>/dev/null || true
    print_info "Nichts zu tun."
    exit 0
  fi
else
  BEHIND=$(git -C "$SCRIPT_DIR" rev-list --count HEAD..origin/$CURRENT_BRANCH 2>/dev/null || echo "?")
  echo "" >&2
  echo -e "  ${GREEN}${BOLD}$BEHIND neue Commit(s) verfuegbar!${NC}" >&2
  echo "" >&2
  git -C "$SCRIPT_DIR" log --oneline HEAD..origin/$CURRENT_BRANCH 2>/dev/null | head -15 | while IFS= read -r line; do
    echo -e "    ${GREEN}+${NC} $line" >&2
  done
fi

# ── [3/5] Konfiguration sichern ──────────────────────────────
print_step 3 5 "Daten sichern"

TOKEN=$(read_env "DISCORD_TOKEN")
echo "" >&2
echo -e "  ${BOLD}Wird gesichert:${NC}" >&2
echo -e "  ${DIM}Token:${NC}      ${TOKEN:0:8}...${TOKEN: -4}" >&2
echo -e "  ${DIM}Port:${NC}       $(read_env HOST_PORT)" >&2
echo -e "  ${DIM}Zeitzone:${NC}   $(read_env TZ)" >&2
echo -e "  ${DIM}User-IDs:${NC}   $(read_env COMMAND_ALLOWED_AUTHOR_IDS)" >&2
echo "" >&2

cp "$ENV_FILE" "$ENV_BACKUP"
print_success ".env gesichert: $ENV_BACKUP"

if [ -f "$STATE_FILE" ]; then
  cp "$STATE_FILE" "$STATE_BACKUP"
  print_success "Stream-Daten gesichert: $STATE_BACKUP"
fi

# ── [4/5] Update ─────────────────────────────────────────────
print_step 4 5 "Update durchfuehren"

echo "" >&2
DO_IT=$(ask_yn "Jetzt updaten?" "y")
if [ "$DO_IT" = "0" ]; then
  [ "$STASHED" = true ] && git -C "$SCRIPT_DIR" stash pop 2>/dev/null || true
  print_warn "Abgebrochen."
  exit 0
fi

echo "" >&2
print_info "Lade neueste Version..."
if git -C "$SCRIPT_DIR" pull --ff-only 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done; then
  NEW_COMMIT=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")
  print_success "Aktualisiert auf: $NEW_COMMIT"
else
  print_error "Git Pull fehlgeschlagen!"
  [ -f "$ENV_BACKUP" ] && cp "$ENV_BACKUP" "$ENV_FILE" && print_success ".env wiederhergestellt"
  exit 1
fi

# .env sicher stellen
if [ ! -f "$ENV_FILE" ] && [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$ENV_FILE"
  print_success ".env aus Backup wiederhergestellt"
else
  print_success "Konfiguration beibehalten"
fi

# Stash zurueck?
if [ "$STASHED" = true ]; then
  echo "" >&2
  RESTORE=$(ask_yn "Lokale Aenderungen wiederherstellen?" "y")
  if [ "$RESTORE" = "1" ]; then
    if git -C "$SCRIPT_DIR" stash pop 2>/dev/null; then
      print_success "Aenderungen wiederhergestellt"
    else
      print_warn "Konflikte - manuell: git stash pop"
    fi
  else
    print_info "Stash behalten. Spaeter: git stash pop"
  fi
fi

# ── [5/5] Container neu bauen ────────────────────────────────
print_step 5 5 "Container neu bauen"

echo "" >&2
print_info "Stoppe Container..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done

echo "" >&2
print_info "Baue Image frisch ohne Cache, damit yt-dlp und Systempakete wirklich aktualisiert werden..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull --no-cache 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done

echo "" >&2
print_info "Starte Container..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done

echo "" >&2
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps 2>&1 | while IFS= read -r line; do echo "  $line" >&2; done

YT_DLP_VERSION=$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T control-panel yt-dlp --version 2>/dev/null || true)
if [ -n "$YT_DLP_VERSION" ]; then
  echo "" >&2
  print_success "yt-dlp im Container: $YT_DLP_VERSION"
fi

HOST_PORT=$(read_env "HOST_PORT")

echo "" >&2
echo -e "${GREEN}${BOLD}" >&2
echo "  ╔══════════════════════════════════════════════════════╗" >&2
echo "  ║                                                      ║" >&2
echo "  ║   Update erfolgreich!                                ║" >&2
echo "  ║                                                      ║" >&2
echo "  ╚══════════════════════════════════════════════════════╝" >&2
echo -e "${NC}" >&2
echo -e "  ${BOLD}Vorher:${NC}  $CURRENT_COMMIT ($CURRENT_DATE)" >&2
echo -e "  ${BOLD}Jetzt:${NC}   $NEW_COMMIT" >&2
echo "" >&2
echo -e "  ${GREEN}✓${NC} Discord Token      - beibehalten" >&2
echo -e "  ${GREEN}✓${NC} User-IDs           - beibehalten" >&2
echo -e "  ${GREEN}✓${NC} Alle Einstellungen - beibehalten" >&2
echo -e "  ${GREEN}✓${NC} Stream-Daten       - beibehalten" >&2
echo "" >&2
echo -e "  ${BOLD}Control Panel:${NC}  http://localhost:${HOST_PORT:-3099}" >&2
echo "" >&2
