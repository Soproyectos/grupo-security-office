#!/usr/bin/env bash
set -euo pipefail

domain=dev.gruposecurity.cloud
ip=57.131.50.38
source_dir=/opt/grupo-security/deploy/vps
cert_dir=/etc/letsencrypt/live/$domain
site_link=/etc/nginx/sites-enabled/grupo-security-dev.conf
ip_site=/etc/nginx/sites-available/grupo-security-ip.conf

if (( EUID != 0 )); then
    echo 'Ejecuta este script con sudo.' >&2
    exit 1
fi

test -f "$source_dir/nginx-dev.conf"
test -f "$source_dir/nginx-ip.conf"
test -f "$ip_site"
systemctl is-active --quiet nginx
systemctl is-active --quiet docker

if [[ -e "$site_link" || -L "$site_link" ]]; then
    echo 'El sitio del subdominio ya está instalado; no se reemplazará automáticamente.' >&2
    exit 1
fi
if ! getent ahostsv4 "$domain" | awk '{print $1}' | grep -Fxq "$ip"; then
    echo 'El registro A aún no apunta a este VPS.' >&2
    exit 1
fi

probe=$(openssl rand -hex 12)
probe_path=/var/www/html/.well-known/acme-challenge/$probe
printf '%s' "$probe" > "$probe_path"
trap 'rm -f "$probe_path"' EXIT
served=$(curl --noproxy '*' --fail --silent --show-error --max-time 10 "http://$domain/.well-known/acme-challenge/$probe")
if [[ "$served" != "$probe" ]]; then
    echo 'Nginx no entrega el desafío HTTP desde el subdominio.' >&2
    exit 1
fi
rm -f "$probe_path"
trap - EXIT

certbot_args=(
    --rm
    --volume /etc/letsencrypt:/etc/letsencrypt
    --volume /var/lib/letsencrypt:/var/lib/letsencrypt
    --volume /var/log/letsencrypt:/var/log/letsencrypt
    --volume /var/www/html:/var/www/html
    certbot/certbot:v5.8.0
    certonly --non-interactive --agree-tos --register-unsafely-without-email
    --webroot --webroot-path /var/www/html
    --domains "$domain" --cert-name "$domain"
)
if [[ ! -s "$cert_dir/fullchain.pem" || ! -s "$cert_dir/privkey.pem" ]]; then
    echo 'Probando el certificado del subdominio en el entorno de ensayo...'
    docker run "${certbot_args[@]}" --dry-run
    echo 'Solicitando el certificado público del subdominio...'
    docker run "${certbot_args[@]}"
fi
test -s "$cert_dir/fullchain.pem"
test -s "$cert_dir/privkey.pem"

ip_backup=$(mktemp /etc/nginx/sites-available/grupo-security-ip.conf.XXXXXX)
cp -p "$ip_site" "$ip_backup"
install -m 0644 "$source_dir/nginx-ip.conf" "$ip_site"
install -m 0644 "$source_dir/nginx-dev.conf" /etc/nginx/sites-available/grupo-security-dev.conf
ln -s ../sites-available/grupo-security-dev.conf "$site_link"
if ! nginx -t || ! systemctl reload nginx; then
    unlink "$site_link"
    cp -p "$ip_backup" "$ip_site"
    nginx -t
    systemctl reload nginx
    echo 'Nginx volvió a la configuración anterior.' >&2
    exit 1
fi

echo "Subdominio listo: https://$domain/"
echo "Copia de la configuración anterior de IP: $ip_backup"
