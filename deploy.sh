#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/scripts/lib/common.sh"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
IMAGE_TAG="${IMAGE_BASE}:${TIMESTAMP}"

echo "Building ${IMAGE_TAG}..."
docker build -t "$IMAGE_TAG" -t "${IMAGE_BASE}:latest" "$SCRIPT_DIR"

stop_container_if_exists
run_container "$IMAGE_TAG"
if ! run_health_check; then
  echo "Health check failed. Container left running for inspection." >&2
  exit 1
fi
record_image_state "$IMAGE_TAG"

echo "Deployment complete. Current image: $(cat "$CURRENT_FILE")"
