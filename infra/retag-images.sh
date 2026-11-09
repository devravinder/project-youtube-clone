#!/usr/bin/env bash
# Linux/macOS twin of retag-images.ps1: tags pulled images with plain names so compose stays portable.
# Usage: IMAGE_REGISTRY="<host[:port]>" ./infra/retag-images.sh   (or: ./infra/retag-images.sh <host[:port]>)
# Paths that differ in your registry go in infra/retag-images.local.json, same file as the PowerShell script.
set -euo pipefail

registry="${1:-${IMAGE_REGISTRY:-}}"
if [[ -z "$registry" ]]; then
  echo "Set IMAGE_REGISTRY (or pass it as the first argument) to your registry host, e.g. host:5000" >&2
  exit 1
fi

# "registry path=plain name used in compose"; keep in step with retag-images.ps1.
defaults=(
  "postgres:latest=postgres:latest"
  "minio/minio:latest=minio/minio:latest"
  "minio/mc:latest=minio/mc:latest"
  "keycloak/keycloak:latest=keycloak/keycloak:latest"
  "rabbitmq/rabbitmq:3.12.13-management=rabbitmq:3.12.13-management"
  "bitnami/kafka:3.5.1=bitnami/kafka:3.5.1"
  "elastic/elasticsearch:8.19.16=elasticsearch:8.19.16"
  "redis:6.2.24=redis:6.2.24"
  "nginx:v1=nginx:v1"
  "2462402/otel-lgtm:1.3=grafana/otel-lgtm:1.3"
  "mwader/static-ffmpeg:latest=mwader/static-ffmpeg:latest"
  "nginx:1.26.3=nginx:1.26.3"
  "kindest/node:v1.37.0=kindest/node:v1.37.0"
)

# Local overrides replace the default entry for the same plain name. Node is a prerequisite anyway.
local_map="$(dirname "$0")/retag-images.local.json"
overrides=()
if [[ -f "$local_map" ]]; then
  while IFS= read -r line; do overrides+=("$line"); done < <(
    node -e 'for (const [k, v] of Object.entries(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")))) console.log(`${k}=${v}`)' "$local_map"
  )
fi

entries=()
for entry in "${defaults[@]}"; do
  target="${entry#*=}"
  replaced=false
  for o in "${overrides[@]+"${overrides[@]}"}"; do [[ "${o#*=}" == "$target" ]] && replaced=true; done
  $replaced || entries+=("$entry")
done
entries+=("${overrides[@]+"${overrides[@]}"}")

missing=0
for entry in "${entries[@]}"; do
  source="$registry/${entry%%=*}"
  target="${entry#*=}"
  if docker image inspect "$source" >/dev/null 2>&1; then
    docker tag "$source" "$target"
    printf '\033[32mOK      %s  <-  %s\033[0m\n' "$target" "$source"
  else
    printf '\033[33mMISSING %s (not pulled yet)\033[0m\n' "$source"
    missing=$((missing + 1))
  fi
done

if ((missing > 0)); then
  printf '\n\033[33m%d image(s) not pulled yet. Pull them, then re-run.\033[0m\n' "$missing"
fi
