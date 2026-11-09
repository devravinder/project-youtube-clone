#!/usr/bin/env bash
# Linux/macOS twin of load-images.ps1 (see there for why ctr --no-unpack instead of `kind load`).
# Usage: ./infra/kind/load-images.sh [cluster] [tag]
set -euo pipefail
cluster="${1:-yt}" tag="${2:-${IMAGE_TAG:-local}}"
images=()
for svc in upload-service transcoder-service search-service notification-service web; do images+=("yt/$svc:$tag"); done
mapfile -t nodes < <(kind get nodes --name "$cluster")
if ((${#nodes[@]} == 0)); then echo "No nodes for kind cluster '$cluster'" >&2; exit 1; fi
for node in "${nodes[@]}"; do
  docker save "${images[@]}" | docker exec -i "$node" ctr --namespace=k8s.io images import --no-unpack --all-platforms -
  echo "loaded into $node"
done
