---
name: k8s-kind-helm
description: Run the system locally on a kind cluster with Helm charts and HPA, including the Windows/Docker-Desktop ctr import image-loading trick. Use when working on container images, Kubernetes manifests, Helm, or autoscaling.
---

# Containers, Kubernetes - kind + Helm + HPA

Local Kubernetes for the scaling and resilience lessons. State: images and the chart are built and
verified; the cluster run is pending until `kindest/node:v1.37.0` is available (see docs/TASKS.md).

## Images first, then the cluster

- `infra/docker/`: one parameterised `node-service.Dockerfile` (`SERVICE` arg) for the NestJS services,
  `transcoder.Dockerfile` (bootJar + static ffmpeg binaries), `web.Dockerfile` (Vite build on nginx that
  also proxies `/api`, `/search-api`, `/ws`). Base `alpine:latest` (what is available); run as uid 10001.
- Build with `pnpm images:build` (`scripts/build-images.mjs`): `~/.npmrc` and the CA file it names go in
  as BuildKit secrets (`--mount=type=secret,required=false`), plus a pnpm store cache mount. Verify after
  building: no `.npmrc` in the image, nothing in `docker history`.
- Prove the images with `pnpm start:c:all` (`infra/docker-compose-local-apps.yaml`) before any cluster.

## Two addresses for everything

In containers/pods a service uses `minio:9000` / `keycloak:8180`; the browser uses `localhost`. Keep both:
`STORAGE_PUBLIC_ENDPOINT` (sign presigned URLs for the browser host; the signature covers the host),
`OIDC_JWKS_URL` (keys over the internal network, issuer stays public), `TRUST_PROXY_HOPS` (client IP
behind nginx / an ingress).

## Topology

- kind: 1 control plane + 2 workers (`infra/kind/cluster.yaml`), node port 30090 → host 8090 (web).
- Helm: umbrella `infra/helm/youtube-clone`, a thin subchart per service in `charts/`, all depending on
  the library chart `infra/helm/yt-common` (Deployment, Service, ConfigMap, Secret, HPA templates).
  Helm 4 wants every subchart in `charts/` listed under `dependencies` (with `condition: <name>.enabled`).
- Infrastructure stays in Docker Compose; `infra/kind/connect-infra` joins those containers to kind's
  network with their compose names as aliases, so chart addresses equal the compose-apps addresses.
- Migrations: pre-install/pre-upgrade hook Job (`prisma migrate deploy`).

## HPA - the payoff lesson

- CPU (and memory) `autoscaling/v2` HPAs; requests are mandatory (utilisation is relative to them), no
  CPU limit (throttling), scale-down stabilisation 300 s. Omit `replicas` in the Deployment while an HPA
  owns it, or every `helm upgrade` resets the count.
- Transcoder's real signal is queue depth: KEDA `ScaledObject` (rabbitmq `QueueLength`) behind
  `queueScaling.enabled`; when on, the chart's CPU HPA must disappear (two autoscalers fight).
- Needs metrics-server (CPU) and KEDA (queue) in the cluster. Drive it with `tests/load/cpu.ts` and
  `throughput.ts` (k6).

## Windows / Docker Desktop image-loading trick

BuildKit images carry an attestation manifest; `kind load docker-image` then fails with "content digest
not found". Import into every node with containerd instead (`infra/kind/load-images.ps1` / `.sh`):

```bash
docker save -o images.tar yt/upload-service:local ...
docker cp images.tar <node>:/images.tar      # PowerShell pipes mangle binary, so copy, don't pipe
docker exec <node> ctr --namespace=k8s.io images import --no-unpack --all-platforms /images.tar
```

Use `imagePullPolicy: IfNotPresent` with the plain local tags.

## Checking without a cluster

`pnpm k8s:check` (`scripts/check-helm.mjs`): dependency build, `helm lint --strict`, `helm template`, then
assertions on the rendered objects (selectors match pod labels, envFrom targets exist, probes/resources/
securityContext, HPA vs replicas, node port, proxies point at real Services, hook Job, secrets only in
Secrets, registry/tag overrides, the KEDA switch). Quote values that YAML could misread
(`path: {{ .path | quote }}` - `?` broke a flow map; a `description:` containing a colon and a space broke Chart.yaml).
