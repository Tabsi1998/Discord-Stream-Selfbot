#!/bin/sh

set -eu

. "$(dirname "$0")/deploy/deploy-lib.sh"

require_docker_compose

if [ ! -f "$ENV_EXAMPLE_FILE" ]; then
  printf 'Missing %s\n' "$ENV_EXAMPLE_FILE" >&2
  exit 1
fi

printf 'Preparing Docker deployment for Discord-Stream-SelfBot.\n' >&2
configure_env

printf 'Building and starting the control-panel container.\n' >&2
compose up -d --build
compose ps

host_port=$(current_or_default HOST_PORT "$DEFAULT_HOST_PORT")
printf 'Control panel should be available on http://localhost:%s\n' "$host_port"
