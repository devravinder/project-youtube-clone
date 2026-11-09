# Joins the compose infrastructure containers to kind's Docker network under their compose names, so
# pods reach postgres:5432, kafka:9092, ... exactly as the containers in docker-compose-local-apps.yaml do.
# Run after `kind create cluster` and `pnpm start:l:pods`. Linux/macOS: infra/kind/connect-infra.sh
$ErrorActionPreference = "Stop"
$map = [ordered]@{
  "yt-postgres" = "postgres"; "yt-minio" = "minio"; "yt-rabbitmq" = "rabbitmq"; "yt-kafka" = "kafka"
  "yt-redis" = "redis"; "yt-elasticsearch" = "elasticsearch"; "yt-keycloak" = "keycloak"; "yt-edge" = "edge"
}
foreach ($container in $map.Keys) {
  $networks = docker inspect $container --format "{{json .NetworkSettings.Networks}}" | ConvertFrom-Json
  if ($networks.PSObject.Properties.Name -contains "kind") {
    Write-Host "already  $container ($($map[$container]))"
    continue
  }
  docker network connect --alias $map[$container] kind $container
  Write-Host "joined   $container as $($map[$container])" -ForegroundColor Green
}
