#!/bin/sh
# Fills the upstream URLs into the nginx config (the image has no envsubst), then runs nginx.
set -eu
sed -e "s|__UPLOAD_SERVICE_URL__|${UPLOAD_SERVICE_URL}|g" \
    -e "s|__SEARCH_SERVICE_URL__|${SEARCH_SERVICE_URL}|g" \
    -e "s|__NOTIFICATION_SERVICE_URL__|${NOTIFICATION_SERVICE_URL}|g" \
    /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
exec nginx -g "daemon off;"
