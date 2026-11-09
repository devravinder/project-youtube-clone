# One image per NestJS service: docker build -f infra/docker/node-service.Dockerfile --build-arg SERVICE=upload-service .
# Use scripts/build-images.mjs, which also passes the npm registry settings as build secrets.
# Alpine because it is the base image available here (IMAGES.md); Node comes from its packages.
FROM alpine:latest AS build
ARG SERVICE
RUN apk add --no-cache nodejs npm
WORKDIR /repo
COPY . .
# Registry login and CA only live for this step; they never end up in a layer.
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=secret,id=npm_ca,target=/run/secrets/npm_ca,required=false \
    --mount=type=cache,id=yt-pnpm-store,target=/root/.local/share/pnpm/store \
    if [ -f /run/secrets/npm_ca ]; then export npm_config_cafile=/run/secrets/npm_ca NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi && \
    npm install -g pnpm@12.15.0 && \
    pnpm install --frozen-lockfile --filter "@yt/${SERVICE}..." && \
    pnpm --filter "@yt/${SERVICE}" --if-present db:generate

FROM alpine:latest
ARG SERVICE
RUN apk add --no-cache nodejs && adduser -D -u 10001 app
COPY --from=build --chown=app:app /repo /repo
USER app
ENV NODE_ENV=production SERVICE=${SERVICE}
WORKDIR /repo/apps/${SERVICE}
# Same entry as the dev scripts: tsx runs the TypeScript, the preload decides on telemetry.
CMD ["node", "--import", "tsx", "--import", "@yt/telemetry/register", "src/main.ts"]
