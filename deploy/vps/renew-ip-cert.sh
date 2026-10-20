#!/usr/bin/env bash
set -euo pipefail

docker run --rm --name gs-certbot-renew \
    --volume /etc/letsencrypt:/etc/letsencrypt \
    --volume /var/lib/letsencrypt:/var/lib/letsencrypt \
    --volume /var/log/letsencrypt:/var/log/letsencrypt \
    --volume /var/www/html:/var/www/html \
    certbot/certbot:v5.8.0 renew --non-interactive

nginx -t
systemctl reload nginx
