#!/usr/bin/env bash
set -euo pipefail

SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_LIB_DIR}/../.." && pwd)"

DEFAULT_ENV_FILE="${DEPLOY_ENV_FILE:-${PROJECT_ROOT}/.deploy/env}"

load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    echo "→ Loading environment overrides from ${env_file}"
    set -a
    # shellcheck source=/dev/null
    source "$env_file"
    set +a
  fi
}

ENV_FILE="${ENV_FILE:-$DEFAULT_ENV_FILE}"
if [[ -z "${MYXXIT_DEPLOY_ENV_LOADED:-}" ]]; then
  load_env_file "$ENV_FILE"
  export MYXXIT_DEPLOY_ENV_LOADED=1
fi

STATE_DIR="${STATE_DIR:-${PROJECT_ROOT}/.deploy}"
CURRENT_FILE="${CURRENT_FILE:-${STATE_DIR}/current_image}"
PREVIOUS_FILE="${PREVIOUS_FILE:-${STATE_DIR}/previous_image}"
AUTH_SNAPSHOT="${AUTH_SNAPSHOT:-${STATE_DIR}/auth.snapshot.json}"
APP_NAME="${APP_NAME:-myxxit-ops-dashboard}"
IMAGE_BASE="${IMAGE_BASE:-myxxit/ops-dashboard}"
CONTAINER_NAME="${CONTAINER_NAME:-myxxit-ops-dashboard}"
HOST_PORT="${HOST_PORT:-4311}"
APP_PORT="${PORT:-4311}"
DATA_DIR="${DATA_DIR:-/opt/myxxit-ops-dashboard/data}"
USERNAME="${MYXXIT_DASHBOARD_USERNAME:-travis}"
PASSWORD="${MYXXIT_DASHBOARD_PASSWORD:-}"
TRAEFIK_HOST="${TRAEFIK_HOST:-ops.myxxit.dev}"
TRAEFIK_ENTRYPOINT="${TRAEFIK_ENTRYPOINT:-websecure}"
TRAEFIK_RESOLVER="${TRAEFIK_RESOLVER:-letsencrypt}"
TRAEFIK_ROUTER_NAME="${TRAEFIK_ROUTER_NAME:-myxxit-ops}"
TRAEFIK_SERVICE_NAME="${TRAEFIK_SERVICE_NAME:-${TRAEFIK_ROUTER_NAME}}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:${HOST_PORT}/healthz}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-10}"
HEALTHCHECK_INTERVAL="${HEALTHCHECK_INTERVAL:-3}"
HEALTHCHECK_STRICT="${HEALTHCHECK_STRICT:-1}"
SKIP_HEALTHCHECK="${SKIP_HEALTHCHECK:-0}"

REQUIRED_ENV_VARS=(SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY TRAEFIK_HOST TRAEFIK_ROUTER_NAME)

traefik_label_args=(
  --label "traefik.enable=true"
  --label "traefik.http.routers.${TRAEFIK_ROUTER_NAME}.rule=Host(\`${TRAEFIK_HOST}\`)"
  --label "traefik.http.routers.${TRAEFIK_ROUTER_NAME}.entrypoints=${TRAEFIK_ENTRYPOINT}"
  --label "traefik.http.routers.${TRAEFIK_ROUTER_NAME}.tls=true"
  --label "traefik.http.routers.${TRAEFIK_ROUTER_NAME}.tls.certresolver=${TRAEFIK_RESOLVER}"
  --label "traefik.http.services.${TRAEFIK_SERVICE_NAME}.loadbalancer.server.port=${APP_PORT}"
)

env_exports=(
  -e SUPABASE_URL
  -e SUPABASE_ANON_KEY
  -e SUPABASE_SERVICE_ROLE_KEY
  -e DATA_DIR=/app/data
  -e PORT="${APP_PORT}"
)

ensure_required_env() {
  local missing=()
  for var in "$@"; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("$var")
    fi
  done
  if (( ${#missing[@]} )); then
    echo "ERROR: Missing required environment variables: ${missing[*]}" >&2
    exit 1
  fi
}

ensure_directories() {
  mkdir -p "$STATE_DIR"
  mkdir -p "$DATA_DIR"
}

stop_container_if_exists() {
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping existing container ${CONTAINER_NAME}..."
    docker stop "$CONTAINER_NAME" >/dev/null || true
    echo "Removing existing container ${CONTAINER_NAME}..."
    docker rm "$CONTAINER_NAME" >/dev/null || true
  fi
}

ensure_auth_file() {
  local auth_path="${DATA_DIR}/auth.json"
  if [[ ! -f "$auth_path" ]]; then
    if [[ -f "$AUTH_SNAPSHOT" ]]; then
      echo "Restoring auth.json from snapshot ${AUTH_SNAPSHOT}"
      cp "$AUTH_SNAPSHOT" "$auth_path"
    else
      if [[ -z "$PASSWORD" ]]; then
        echo "ERROR: auth.json missing and MYXXIT_DASHBOARD_PASSWORD not set." >&2
        exit 1
      fi
      echo "Seeding auth.json for ${USERNAME}..."
      docker run --rm \
        -v "${PROJECT_ROOT}":/src \
        -v "${DATA_DIR}":/data \
        node:20-alpine \
        node /src/scripts/bootstrap-auth.mjs /data/auth.json "$USERNAME" "$PASSWORD"
    fi
  fi
  cp "$auth_path" "$AUTH_SNAPSHOT"
}

run_container() {
  local image_tag="$1"
  echo "Starting ${CONTAINER_NAME} from image ${image_tag} on ${HOST_PORT}->${APP_PORT}"
  docker run -d --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "${HOST_PORT}:${APP_PORT}" \
    -v "${DATA_DIR}:/app/data" \
    "${env_exports[@]}" \
    "${traefik_label_args[@]}" \
    "$image_tag"
}

record_image_state() {
  local new_image="$1"
  if [[ -f "$CURRENT_FILE" ]]; then
    cp "$CURRENT_FILE" "$PREVIOUS_FILE"
  fi
  echo "$new_image" > "$CURRENT_FILE"
}

run_health_check() {
  if [[ "$SKIP_HEALTHCHECK" == "1" ]]; then
    echo "Health check skipped via SKIP_HEALTHCHECK"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl not found; skipping health check" >&2
    return 0
  fi
  echo "Running health check against ${HEALTHCHECK_URL}"
  local attempt=1
  while (( attempt <= HEALTHCHECK_RETRIES )); do
    if curl --fail --silent --show-error "$HEALTHCHECK_URL" >/dev/null; then
      echo "Health check passed on attempt ${attempt}."
      return 0
    fi
    echo "Health check attempt ${attempt} failed, retrying in ${HEALTHCHECK_INTERVAL}s..."
    sleep "$HEALTHCHECK_INTERVAL"
    ((attempt++))
  done
  echo "Health check failed after ${HEALTHCHECK_RETRIES} attempts." >&2
  if [[ "$HEALTHCHECK_STRICT" == "1" ]]; then
    return 1
  fi
  return 0
}

ensure_required_env "${REQUIRED_ENV_VARS[@]}"
ensure_directories
ensure_auth_file
