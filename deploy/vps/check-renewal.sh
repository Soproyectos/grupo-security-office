#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
    echo 'Ejecuta este script con sudo.' >&2
    exit 1
fi

docker run --rm --name gs-certbot-check \
    --volume /etc/letsencrypt:/etc/letsencrypt \
    --volume /var/lib/letsencrypt:/var/lib/letsencrypt \
    --volume /var/log/letsencrypt:/var/log/letsencrypt \
    --volume /var/www/html:/var/www/html \
    certbot/certbot:v5.8.0 renew --dry-run --non-interactive
