#!/usr/bin/env bash
set -euo pipefail

STATE_DIR=".deploy"
CURRENT_FILE="$STATE_DIR/current_image"
PREVIOUS_FILE="$STATE_DIR/previous_image"
CONTAINER_NAME="${CONTAINER_NAME:-myxxit-ops-dashboard}"
HOST_PORT="${HOST_PORT:-4311}"
APP_PORT="${PORT:-4311}"
DATA_DIR="${DATA_DIR:-/opt/myxxit-ops-dashboard/data}"
TRAEFIK_HOST="${TRAEFIK_HOST:-ops.myxxit.dev}"
TRAEFIK_ENTRYPOINT="${TRAEFIK_ENTRYPOINT:-websecure}"
TRAEFIK_RESOLVER="${TRAEFIK_RESOLVER:-letsencrypt}"

: "${SUPABASE_URL:?Set SUPABASE_URL before running rollback}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY before running rollback}"
if [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
  echo 'WARNING: SUPABASE_ANON_KEY is not set. Continuing, but anon client flows may be limited.' >&2
fi

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
  -e SUPABASE_URL \
  -e SUPABASE_ANON_KEY \
  -e SUPABASE_SERVICE_ROLE_KEY \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.myxxit-ops.rule=Host(\`${TRAEFIK_HOST}\`)" \
  --label "traefik.http.routers.myxxit-ops.entrypoints=${TRAEFIK_ENTRYPOINT}" \
  --label "traefik.http.routers.myxxit-ops.tls=true" \
  --label "traefik.http.routers.myxxit-ops.tls.certresolver=${TRAEFIK_RESOLVER}" \
  --label "traefik.http.services.myxxit-ops.loadbalancer.server.port=${APP_PORT}" \
  "$PREV_IMAGE"

[[ -n "$CUR_IMAGE" ]] && echo "$CUR_IMAGE" > "$PREVIOUS_FILE" || rm -f "$PREVIOUS_FILE"
echo "$PREV_IMAGE" > "$CURRENT_FILE"

echo "Rollback complete. Running image: $(cat "$CURRENT_FILE")."
