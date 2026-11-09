# docker build -f infra/docker/web.Dockerfile .   (or scripts/build-images.mjs)
FROM alpine:latest AS build
RUN apk add --no-cache nodejs npm
WORKDIR /repo
COPY . .
# Vite bakes these into the bundle; they are public, browser-side settings.
ARG VITE_API_BASE_URL=/api
ARG VITE_SEARCH_BASE_URL=/search-api
ARG VITE_NOTIFICATIONS_PATH=/ws
ARG VITE_OIDC_AUTHORITY=http://localhost:8180/realms/youtube-clone
ARG VITE_OIDC_CLIENT_ID=yt-web
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=secret,id=npm_ca,target=/run/secrets/npm_ca,required=false \
    --mount=type=cache,id=yt-pnpm-store,target=/root/.local/share/pnpm/store \
    if [ -f /run/secrets/npm_ca ]; then export npm_config_cafile=/run/secrets/npm_ca NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi && \
    npm install -g pnpm@12.15.0 && \
    pnpm install --frozen-lockfile --filter "@yt/web..." && \
    pnpm --filter @yt/web build

# Same nginx as the HLS edge: serves the app and proxies the APIs, as the Vite dev server does.
FROM nginx:1.26.3
COPY --from=build /repo/apps/web/dist /usr/share/nginx/yt-web
COPY infra/docker/web/nginx.conf /etc/nginx/nginx.conf.template
COPY infra/docker/web/entrypoint.sh /entrypoint.sh
ENV UPLOAD_SERVICE_URL=http://upload-service:3001 \
    SEARCH_SERVICE_URL=http://search-service:3003 \
    NOTIFICATION_SERVICE_URL=http://notification-service:3004
EXPOSE 8080
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
