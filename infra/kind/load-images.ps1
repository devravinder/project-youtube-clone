# Loads the app images into every kind node with containerd's ctr.
# Why not `kind load docker-image`: images built by BuildKit carry an attestation manifest, and on
# Docker Desktop (Windows) the default import then fails with "content digest ... not found". Importing
# with --no-unpack keeps the whole index; the kubelet unpacks the platform it needs on first use.
# Usage: pwsh -File infra/kind/load-images.ps1 [-Cluster yt] [-Tag local]. Linux/macOS: load-images.sh
param(
  [string]$Cluster = "yt",
  [string]$Tag = $(if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "local" })
)
$ErrorActionPreference = "Stop"
$images = "upload-service", "transcoder-service", "search-service", "notification-service", "web" |
  ForEach-Object { "yt/${_}:$Tag" }
$nodes = @(kind get nodes --name $Cluster)
if ($nodes.Count -eq 0) { throw "No nodes for kind cluster '$Cluster'. Create it with infra/kind/cluster.yaml." }

$archive = Join-Path ([IO.Path]::GetTempPath()) "yt-images-$Tag.tar"
try {
  docker save -o $archive @images
  if ($LASTEXITCODE -ne 0) { throw "docker save failed; build the images first (node scripts/build-images.mjs)" }
  foreach ($node in $nodes) {
    # PowerShell pipes mangle binary data, so the archive is copied into the node first.
    docker cp $archive "${node}:/yt-images.tar"
    docker exec $node ctr --namespace=k8s.io images import --no-unpack --all-platforms /yt-images.tar
    docker exec $node rm -f /yt-images.tar
    Write-Host "loaded into $node" -ForegroundColor Green
  }
} finally {
  Remove-Item $archive -ErrorAction SilentlyContinue
}
