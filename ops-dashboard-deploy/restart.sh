#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-myxxit-ops-dashboard}"

echo "Restarting ${CONTAINER_NAME}..."
docker restart "$CONTAINER_NAME"
echo "${CONTAINER_NAME} restarted."
