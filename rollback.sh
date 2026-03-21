#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/scripts/lib/common.sh"

[[ -f "$PREVIOUS_FILE" && -s "$PREVIOUS_FILE" ]] || { echo "No previous image recorded. Deploy once before attempting rollback." >&2; exit 1; }

PREV_IMAGE=$(cat "$PREVIOUS_FILE")

echo "Rolling back ${CONTAINER_NAME} to ${PREV_IMAGE}..."
docker image inspect "$PREV_IMAGE" >/dev/null 2>&1 || { echo "Image ${PREV_IMAGE} not found locally." >&2; exit 1; }

stop_container_if_exists
run_container "$PREV_IMAGE"
if ! run_health_check; then
  echo "Health check failed after rollback. Container left running for inspection." >&2
  exit 1
fi
record_image_state "$PREV_IMAGE"

echo "Rollback complete. Running image: $(cat "$CURRENT_FILE"). Previous image pointer now $(cat "$PREVIOUS_FILE" 2>/dev/null || echo 'unset')."
