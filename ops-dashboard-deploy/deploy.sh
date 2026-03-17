#!/usr/bin/env bash
set -euo pipefail

APP_NAME="myxxit-ops-dashboard"
IMAGE_BASE="myxxit/ops-dashboard"
CONTAINER_NAME="myxxit-ops-dashboard"
STATE_DIR=".deploy"
CURRENT_FILE="$STATE_DIR/current_image"
PREVIOUS_FILE="$STATE_DIR/previous_image"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
IMAGE_TAG="${IMAGE_BASE}:${TIMESTAMP}"
HOST_PORT="${HOST_PORT:-4311}"
APP_PORT="${PORT:-4311}"
DATA_DIR="${DATA_DIR:-/opt/myxxit-ops-dashboard/data}"
USERNAME="${MYXXIT_DASHBOARD_USERNAME:-travis}"
PASSWORD="${MYXXIT_DASHBOARD_PASSWORD:-}"

mkdir -p "$STATE_DIR"
mkdir -p "$DATA_DIR"

if [[ ! -f "$DATA_DIR/auth.json" ]]; then
  if [[ -z "$PASSWORD" ]]; then
    echo "ERROR: No auth.json exists yet. Set MYXXIT_DASHBOARD_PASSWORD (>=12 chars) before running deploy.sh" >&2
    exit 1
  fi
  docker run --rm \
    -v "$PWD":/src \
    -v "$DATA_DIR":/data \
    node:20-alpine \
    node /src/scripts/bootstrap-auth.mjs /data/auth.json "$USERNAME" "$PASSWORD"
fi

if [[ ! -f "$DATA_DIR/state.json" ]]; then
  printf '{"tasks":[]}' > "$DATA_DIR/state.json"
fi

echo "\nBuilding ${IMAGE_TAG}..."
docker build -t "$IMAGE_TAG" -t "${IMAGE_BASE}:latest" .

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Stopping existing container ${CONTAINER_NAME}..."
  docker stop "$CONTAINER_NAME" >/dev/null || true
  echo "Removing existing container ${CONTAINER_NAME}..."
  docker rm "$CONTAINER_NAME" >/dev/null || true
fi

echo "Starting ${CONTAINER_NAME} on port ${HOST_PORT} -> ${APP_PORT} using ${DATA_DIR} volume..."
docker run -d --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${HOST_PORT}:${APP_PORT}" \
  -v "${DATA_DIR}:/app/data" \
  "$IMAGE_TAG"

if [[ -f "$CURRENT_FILE" ]]; then
  cp "$CURRENT_FILE" "$PREVIOUS_FILE"
fi
echo "$IMAGE_TAG" > "$CURRENT_FILE"

echo "Deployment complete. Current image: $(cat "$CURRENT_FILE")"
