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
print_banner() {
  clear
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║                                                      ║"
  echo "  ║   Discord Stream Selfbot - Updater                   ║"
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

print_success() { echo -e "  ${GREEN}✓${NC} $1"; }
print_info()    { echo -e "  ${BLUE}i${NC} $1"; }
print_warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
print_error()   { echo -e "  ${RED}✗${NC} $1"; }

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
  [ -z "$result" ] && result="$default"
  case "$result" in
    j|y|ja|yes) echo "1" ;;
    *) echo "0" ;;
  esac
}

read_env_value() {
  local key=$1
  if [ -f "$ENV_FILE" ]; then
    grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true
  fi
}

# ══════════════════════════════════════════════════════════════════
#  HAUPTPROGRAMM
# ══════════════════════════════════════════════════════════════════

print_banner

# ──────────────────────────────────────────────────────────────
print_step 1 5 "Voraussetzungen pruefen"

# Git pruefen
if ! command -v git &>/dev/null; then
  print_error "Git ist nicht installiert"
  exit 1
fi
print_success "Git gefunden"

# Docker pruefen
if ! command -v docker &>/dev/null; then
  print_error "Docker ist nicht installiert"
  exit 1
fi
print_success "Docker gefunden"

if ! docker compose version &>/dev/null 2>&1; then
  print_error "Docker Compose nicht gefunden"
  exit 1
fi
print_success "Docker Compose gefunden"

# Git Repo pruefen
if [ ! -d "$SCRIPT_DIR/.git" ]; then
  print_error "Kein Git Repository gefunden in: $SCRIPT_DIR"
  print_info "Hast du das Repo mit 'git clone' heruntergeladen?"
  exit 1
fi
print_success "Git Repository gefunden"

# .env pruefen
if [ ! -f "$ENV_FILE" ]; then
  print_error "Keine Konfiguration gefunden ($ENV_FILE)"
  print_info "Fuehre zuerst ./install.sh aus"
  exit 1
fi
print_success "Konfiguration vorhanden"

# ──────────────────────────────────────────────────────────────
print_step 2 5 "Aktuelle Version und Aenderungen"

CURRENT_BRANCH=$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unbekannt")
CURRENT_COMMIT=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")
CURRENT_DATE=$(git -C "$SCRIPT_DIR" log -1 --format="%ci" 2>/dev/null | cut -d' ' -f1,2 || echo "?")

echo ""
echo -e "  ${BOLD}Aktueller Stand:${NC}"
echo -e "  ${DIM}Branch:${NC}  $CURRENT_BRANCH"
echo -e "  ${DIM}Commit:${NC}  $CURRENT_COMMIT"
echo -e "  ${DIM}Datum:${NC}   $CURRENT_DATE"
echo ""

# Lokale Aenderungen pruefen
DIRTY=$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=no 2>/dev/null || true)
if [ -n "$DIRTY" ]; then
  print_warn "Es gibt lokale Aenderungen an Dateien:"
  echo ""
  git -C "$SCRIPT_DIR" status --porcelain --untracked-files=no 2>/dev/null | while IFS= read -r line; do
    echo -e "    ${YELLOW}$line${NC}"
  done
  echo ""

  STASH_CHOICE=$(prompt_yn "Lokale Aenderungen temporaer sichern (git stash) und weiter?" "y")
  if [ "$STASH_CHOICE" = "1" ]; then
    git -C "$SCRIPT_DIR" stash push -m "update-backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null
    print_success "Aenderungen gesichert (git stash)"
    print_info "Wiederherstellen mit: git stash pop"
    STASHED=true
  else
    print_warn "Update abgebrochen. Committe oder stashe deine Aenderungen zuerst."
    exit 0
  fi
else
  print_success "Keine lokalen Aenderungen"
  STASHED=false
fi

# Verfuegbare Updates pruefen
echo ""
print_info "Pruefe auf Updates..."
git -C "$SCRIPT_DIR" fetch origin "$CURRENT_BRANCH" 2>/dev/null

LOCAL_HEAD=$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null)
REMOTE_HEAD=$(git -C "$SCRIPT_DIR" rev-parse "origin/$CURRENT_BRANCH" 2>/dev/null || echo "")

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
  echo ""
  print_success "Du bist bereits auf dem neuesten Stand!"
  echo ""

  REBUILD=$(prompt_yn "Container trotzdem neu bauen?" "n")
  if [ "$REBUILD" = "0" ]; then
    print_info "Nichts zu tun. Alles aktuell."
    exit 0
  fi
else
  # Aenderungen anzeigen
  COMMITS_BEHIND=$(git -C "$SCRIPT_DIR" rev-list --count HEAD..origin/$CURRENT_BRANCH 2>/dev/null || echo "?")
  echo ""
  echo -e "  ${GREEN}${BOLD}$COMMITS_BEHIND neue Commit(s) verfuegbar!${NC}"
  echo ""
  echo -e "  ${BOLD}Aenderungen:${NC}"
  git -C "$SCRIPT_DIR" log --oneline HEAD..origin/$CURRENT_BRANCH 2>/dev/null | head -20 | while IFS= read -r line; do
    echo -e "    ${GREEN}+${NC} $line"
  done
  echo ""
fi

# ──────────────────────────────────────────────────────────────
print_step 3 5 "Konfiguration sichern"

# .env Backup
echo ""
TOKEN=$(read_env_value "DISCORD_TOKEN")
TOKEN_DISPLAY="${TOKEN:0:8}...${TOKEN: -4}"

echo -e "  ${BOLD}Gesicherte Einstellungen:${NC}"
echo -e "  ${DIM}Discord Token:${NC}     $TOKEN_DISPLAY"
echo -e "  ${DIM}Port:${NC}              $(read_env_value HOST_PORT)"
echo -e "  ${DIM}Zeitzone:${NC}          $(read_env_value TZ)"
echo -e "  ${DIM}Chat-Befehle:${NC}      $([ "$(read_env_value DISCORD_COMMANDS_ENABLED)" = "1" ] && echo "Aktiv" || echo "Aus")"
echo -e "  ${DIM}Prefix:${NC}            $(read_env_value COMMAND_PREFIX)"
echo -e "  ${DIM}Erlaubte IDs:${NC}      $(read_env_value COMMAND_ALLOWED_AUTHOR_IDS)"
echo ""

cp "$ENV_FILE" "$ENV_BACKUP"
print_success "Konfiguration gesichert: $ENV_BACKUP"

# State Backup (wenn vorhanden)
if [ -f "$STATE_FILE" ]; then
  cp "$STATE_FILE" "$STATE_BACKUP"
  print_success "Stream-Daten gesichert: $STATE_BACKUP"
fi

# ──────────────────────────────────────────────────────────────
print_step 4 5 "Update durchfuehren"
echo ""

CONFIRM=$(prompt_yn "Update jetzt durchfuehren?" "y")
if [ "$CONFIRM" = "0" ]; then
  # Restore stash if we stashed
  if [ "$STASHED" = true ]; then
    git -C "$SCRIPT_DIR" stash pop 2>/dev/null || true
    print_info "Lokale Aenderungen wiederhergestellt"
  fi
  print_warn "Update abgebrochen."
  exit 0
fi

# Git Pull
echo ""
print_info "Lade neueste Version..."
if git -C "$SCRIPT_DIR" pull --ff-only 2>&1 | while IFS= read -r line; do echo "  $line"; done; then
  NEW_COMMIT=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")
  print_success "Code aktualisiert auf: $NEW_COMMIT"
else
  print_error "Git Pull fehlgeschlagen!"
  echo ""
  print_info "Moegliche Loesung: git stash && git pull && git stash pop"

  # Restore .env
  if [ -f "$ENV_BACKUP" ]; then
    cp "$ENV_BACKUP" "$ENV_FILE"
    print_success "Konfiguration wiederhergestellt"
  fi
  exit 1
fi

# .env wiederherstellen (wird durch git pull NICHT ueberschrieben da in .gitignore)
if [ ! -f "$ENV_FILE" ] && [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$ENV_FILE"
  print_success "Konfiguration aus Backup wiederhergestellt"
else
  print_success "Konfiguration beibehalten"
fi

# Stash wiederherstellen (optional)
if [ "$STASHED" = true ]; then
  echo ""
  RESTORE_STASH=$(prompt_yn "Deine lokalen Aenderungen wiederherstellen?" "y")
  if [ "$RESTORE_STASH" = "1" ]; then
    if git -C "$SCRIPT_DIR" stash pop 2>/dev/null; then
      print_success "Lokale Aenderungen wiederhergestellt"
    else
      print_warn "Stash konnte nicht angewendet werden (Konflikte?)"
      print_info "Manuell wiederherstellen mit: git stash pop"
    fi
  else
    print_info "Stash beibehalten. Wiederherstellen mit: git stash pop"
  fi
fi

# ──────────────────────────────────────────────────────────────
print_step 5 5 "Container neu bauen"
echo ""

print_info "Stoppe laufende Container..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

echo ""
print_info "Baue und starte Container neu..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

echo ""
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

HOST_PORT=$(read_env_value "HOST_PORT")

echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║                                                      ║"
echo "  ║   Update erfolgreich!                                ║"
echo "  ║                                                      ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Vorher:${NC}  $CURRENT_COMMIT ($CURRENT_DATE)"
echo -e "  ${BOLD}Jetzt:${NC}   $NEW_COMMIT"
echo ""
echo -e "  ${BOLD}Deine Daten:${NC}"
echo -e "  ${GREEN}✓${NC} Discord Token      - beibehalten"
echo -e "  ${GREEN}✓${NC} User-IDs           - beibehalten"
echo -e "  ${GREEN}✓${NC} Alle Einstellungen - beibehalten"
echo -e "  ${GREEN}✓${NC} Stream-Daten       - beibehalten"
echo ""
echo -e "  ${BOLD}Control Panel:${NC}  http://localhost:${HOST_PORT:-3099}"
echo ""
echo -e "  ${DIM}Backup-Dateien:${NC}"
echo -e "  ${DIM}  $ENV_BACKUP${NC}"
[ -f "$STATE_BACKUP" ] && echo -e "  ${DIM}  $STATE_BACKUP${NC}"
echo ""
