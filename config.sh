#!/bin/sh

set -eu

. "$(dirname "$0")/deploy/deploy-lib.sh"

require_docker_compose

printf 'Updating deployment settings.\n' >&2
configure_env

printf 'Rebuilding and restarting the control-panel container.\n' >&2
compose up -d --build
compose ps

host_port=$(current_or_default HOST_PORT "$DEFAULT_HOST_PORT")
printf 'Updated control panel URL: http://localhost:%s\n' "$host_port"
