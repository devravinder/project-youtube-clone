# Tags pulled images with plain names so compose stays portable.
# Usage: $env:IMAGE_REGISTRY = "<host[:port]>"; pwsh -File infra/retag-images.ps1
# Paths that differ in your registry go in infra/retag-images.local.json (see below).

param(
  [string]$Registry = $env:IMAGE_REGISTRY
)

if (-not $Registry) {
  Write-Error "Set IMAGE_REGISTRY (or pass -Registry) to your registry host, e.g. host:5000"
  exit 1
}

# Registry path = plain name used in compose.
$map = [ordered]@{
  "postgres:latest"                       = "postgres:latest"
  "minio/minio:latest"                    = "minio/minio:latest"
  "minio/mc:latest"                       = "minio/mc:latest"
  "keycloak/keycloak:latest"              = "keycloak/keycloak:latest"
  "rabbitmq/rabbitmq:3.12.13-management"  = "rabbitmq:3.12.13-management"
  "bitnami/kafka:3.5.1"                   = "bitnami/kafka:3.5.1"
  "elastic/elasticsearch:8.19.16"         = "elasticsearch:8.19.16"
  "redis:6.2.24"                          = "redis:6.2.24"
  "nginx:v1"                              = "nginx:v1"
  "2462402/otel-lgtm:1.3"                 = "grafana/otel-lgtm:1.3"
  # Transcoder runs ffmpeg/ffprobe from this image locally (verified with ffmpeg 9.0.2).
  "mwader/static-ffmpeg:latest"           = "mwader/static-ffmpeg:latest"
  # Edge cache for HLS (infra/edge).
  "nginx:1.26.3"                          = "nginx:1.26.3"
}

# Registry-specific paths stay on this machine: infra/retag-images.local.json (git-ignored),
# e.g. { "team/images/nginx:1.26.3-build7": "nginx:1.26.3" }. Entries override the defaults.
$localMap = Join-Path $PSScriptRoot "retag-images.local.json"
if (Test-Path $localMap) {
  $extra = Get-Content -Raw $localMap | ConvertFrom-Json -AsHashtable
  foreach ($key in $extra.Keys) {
    foreach ($old in @($map.Keys | Where-Object { $map[$_] -eq $extra[$key] })) { $map.Remove($old) }
    $map[$key] = $extra[$key]
  }
}

$missing = @()

foreach ($entry in $map.GetEnumerator()) {
  $source = "$Registry/$($entry.Key)"
  docker image inspect $source *> $null
  if ($LASTEXITCODE -eq 0) {
    docker tag $source $entry.Value
    Write-Host "OK      $($entry.Value)  <-  $source" -ForegroundColor Green
  } else {
    Write-Host "MISSING $source (not pulled yet)" -ForegroundColor Yellow
    $missing += $entry.Key
  }
}

if ($missing.Count -gt 0) {
  Write-Host "`n$($missing.Count) image(s) not pulled yet. Pull them, then re-run." -ForegroundColor Yellow
}
