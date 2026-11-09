#!/usr/bin/env bash
# Linux/macOS twin of connect-infra.ps1: compose infrastructure joins kind's network under compose names.
set -euo pipefail
pairs=(yt-postgres:postgres yt-minio:minio yt-rabbitmq:rabbitmq yt-kafka:kafka yt-redis:redis
  yt-elasticsearch:elasticsearch yt-keycloak:keycloak yt-edge:edge)
for pair in "${pairs[@]}"; do
  container="${pair%%:*}" alias="${pair#*:}"
  if docker inspect "$container" --format '{{json .NetworkSettings.Networks}}' | grep -q '"kind"'; then
    echo "already  $container ($alias)"
  else
    docker network connect --alias "$alias" kind "$container"
    echo "joined   $container as $alias"
  fi
done
