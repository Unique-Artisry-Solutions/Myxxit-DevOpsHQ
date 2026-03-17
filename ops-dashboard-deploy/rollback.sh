#!/usr/bin/env bash
set -euo pipefail

STATE_DIR=".deploy"
CURRENT_FILE="$STATE_DIR/current_image"
PREVIOUS_FILE="$STATE_DIR/previous_image"
CONTAINER_NAME="${CONTAINER_NAME:-myxxit-ops-dashboard}"
HOST_PORT="${HOST_PORT:-4311}"
APP_PORT="${PORT:-4311}"
DATA_DIR="${DATA_DIR:-/opt/myxxit-ops-dashboard/data}"

mkdir -p "$DATA_DIR"
[[ -f "$PREVIOUS_FILE" && -s "$PREVIOUS_FILE" ]] || { echo "No previous image recorded. Deploy once before attempting rollback." >&2; exit 1; }

PREV_IMAGE=$(cat "$PREVIOUS_FILE")
CUR_IMAGE=$(cat "$CURRENT_FILE" 2>/dev/null || true)

echo "Rolling back ${CONTAINER_NAME} to ${PREV_IMAGE}..."
docker image inspect "$PREV_IMAGE" >/dev/null 2>&1 || { echo "Image ${PREV_IMAGE} not found locally." >&2; exit 1; }

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker stop "$CONTAINER_NAME" >/dev/null || true
  docker rm "$CONTAINER_NAME" >/dev/null || true
fi

docker run -d --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${HOST_PORT}:${APP_PORT}" \
  -v "${DATA_DIR}:/app/data" \
  "$PREV_IMAGE"

[[ -n "$CUR_IMAGE" ]] && echo "$CUR_IMAGE" > "$PREVIOUS_FILE" || rm -f "$PREVIOUS_FILE"
echo "$PREV_IMAGE" > "$CURRENT_FILE"

echo "Rollback complete. Running image: $(cat "$CURRENT_FILE")."
