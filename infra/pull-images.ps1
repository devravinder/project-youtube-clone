# Pre-pull all Docker images used across the project, in parallel.
# Usage:  pwsh -File infra/pull-images.ps1
# Adjust any tag that is not available in your registry (e.g. pin a specific version).

$images = @(
  # Phase 0 — foundations
  "postgres:latest",
  "minio/minio:latest",
  "minio/mc:latest",
  "quay.io/keycloak/keycloak:latest",

  # Phase 1 — async transcoding
  "rabbitmq:management",

  # Phase 2 / 4 — edge / CDN
  "nginx:latest",

  # Phase 3 — events & search
  "bitnami/kafka:3.5.1",
  "docker.elastic.co/elasticsearch/elasticsearch:9.0.0",

  # Phase 4 — scale & resilience
  "redis:latest",

  # Phase 5 — observability
  "grafana/otel-lgtm:latest"
)

Write-Host "Pulling $($images.Count) images in parallel..." -ForegroundColor Cyan

$jobs = foreach ($img in $images) {
  Start-Job -ScriptBlock { param($i) docker pull $i } -ArgumentList $img
}

$jobs | Wait-Job | Out-Null

foreach ($j in $jobs) {
  Receive-Job $j | Out-Null
  $name = $images[$jobs.IndexOf($j)]
  if ($j.State -eq "Completed") {
    Write-Host "OK   $name" -ForegroundColor Green
  } else {
    Write-Host "FAIL $name" -ForegroundColor Red
  }
}

$jobs | Remove-Job
Write-Host "Done. Run 'docker images' to verify." -ForegroundColor Cyan
