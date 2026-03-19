#!/bin/sh

set -eu

. "$(dirname "$0")/deploy/deploy-lib.sh"

require_command git
require_docker_compose

if [ ! -d "$REPO_DIR/.git" ]; then
  printf 'This checkout is not a git repository: %s\n' "$REPO_DIR" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  printf 'Missing %s. Run ./install.sh first.\n' "$ENV_FILE" >&2
  exit 1
fi

dirty=$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)
if [ -n "$dirty" ]; then
  printf 'Tracked files have local changes. Commit or stash them before running update.sh.\n' >&2
  exit 1
fi

branch=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)
printf 'Pulling latest changes for branch %s.\n' "$branch" >&2
git -C "$REPO_DIR" pull --ff-only

printf 'Rebuilding and restarting the control-panel container.\n' >&2
compose up -d --build
compose ps

host_port=$(current_or_default HOST_PORT "$DEFAULT_HOST_PORT")
printf 'Updated control panel URL: http://localhost:%s\n' "$host_port"
