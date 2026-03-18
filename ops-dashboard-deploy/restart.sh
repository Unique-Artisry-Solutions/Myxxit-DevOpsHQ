#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/scripts/lib/common.sh"

[[ -f "$CURRENT_FILE" && -s "$CURRENT_FILE" ]] || { echo "No recorded image found in $CURRENT_FILE. Deploy at least once before restarting." >&2; exit 1; }

IMAGE_TAG=$(cat "$CURRENT_FILE")

echo "Recreating ${CONTAINER_NAME} using ${IMAGE_TAG}..."
stop_container_if_exists
run_container "$IMAGE_TAG"
if ! run_health_check; then
  echo "Health check failed during restart. Container left running for inspection." >&2
  exit 1
fi

echo "${CONTAINER_NAME} restarted from ${IMAGE_TAG}."
