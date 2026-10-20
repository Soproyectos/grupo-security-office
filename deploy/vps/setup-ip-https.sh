#!/usr/bin/env bash
set -euo pipefail

ip=57.131.50.38
source_dir=/opt/grupo-security/deploy/vps
cert_dir=/etc/letsencrypt/live/$ip
site_link=/etc/nginx/sites-enabled/grupo-security-ip.conf
default_link=/etc/nginx/sites-enabled/default

if (( EUID != 0 )); then
    echo 'Ejecuta este script con sudo.' >&2
    exit 1
fi

test -f "$source_dir/nginx-ip-bootstrap.conf"
test -f "$source_dir/maintenance.html"
test -f "$source_dir/renew-ip-cert.sh"
systemctl is-active --quiet nginx
systemctl is-active --quiet docker

if [[ -e "$site_link" || -L "$site_link" ]]; then
    echo 'El sitio Grupo Security ya está instalado; no se reemplazará automáticamente.' >&2
    exit 1
fi
if [[ ! -L "$default_link" ]]; then
    echo 'La configuración de Nginx cambió; revisa los sitios activos antes de continuar.' >&2
    exit 1
fi
default_target=$(readlink "$default_link")

install -d -m 0755 /var/www/html/.well-known/acme-challenge
probe=$(openssl rand -hex 12)
probe_path=/var/www/html/.well-known/acme-challenge/$probe
printf '%s' "$probe" > "$probe_path"
trap 'rm -f "$probe_path"' EXIT
served=$(curl --noproxy '*' --fail --silent --show-error --max-time 10 "http://$ip/.well-known/acme-challenge/$probe")
if [[ "$served" != "$probe" ]]; then
    echo 'Nginx no entrega el desafío HTTP desde /var/www/html.' >&2
    exit 1
fi
rm -f "$probe_path"
trap - EXIT

docker pull certbot/certbot:v5.8.0
certbot_args=(
    --rm
    --volume /etc/letsencrypt:/etc/letsencrypt
    --volume /var/lib/letsencrypt:/var/lib/letsencrypt
    --volume /var/log/letsencrypt:/var/log/letsencrypt
    --volume /var/www/html:/var/www/html
    certbot/certbot:v5.8.0
    certonly --non-interactive --agree-tos
    --preferred-profile shortlived
    --webroot --webroot-path /var/www/html
    --ip-address "$ip" --cert-name "$ip"
)
if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
    certbot_args+=(--email "$CERTBOT_EMAIL")
else
    certbot_args+=(--register-unsafely-without-email)
fi

if [[ ! -s "$cert_dir/fullchain.pem" || ! -s "$cert_dir/privkey.pem" ]]; then
    echo 'Probando la emisión con el entorno de ensayo de Let’s Encrypt...'
    docker run "${certbot_args[@]}" --dry-run
    echo 'Solicitando el certificado público para la IP...'
    docker run "${certbot_args[@]}"
fi
test -s "$cert_dir/fullchain.pem"
test -s "$cert_dir/privkey.pem"

install -d -m 0755 /var/www/grupo-security
install -m 0644 "$source_dir/maintenance.html" /var/www/grupo-security/_maintenance.html
install -m 0644 "$source_dir/nginx-ip-bootstrap.conf" /etc/nginx/sites-available/grupo-security-ip.conf
unlink "$default_link"
ln -s ../sites-available/grupo-security-ip.conf "$site_link"
if ! nginx -t || ! systemctl reload nginx; then
    unlink "$site_link"
    ln -s "$default_target" "$default_link"
    nginx -t
    systemctl reload nginx
    echo 'Nginx volvió a la configuración anterior.' >&2
    exit 1
fi

install -m 0755 "$source_dir/renew-ip-cert.sh" /usr/local/sbin/gs-renew-ip-cert
cat > /etc/systemd/system/gs-certbot-renew.service <<'UNIT'
[Unit]
Description=Renew Grupo Security IP certificate
Wants=network-online.target
After=network-online.target docker.service nginx.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/gs-renew-ip-cert
UNIT
cat > /etc/systemd/system/gs-certbot-renew.timer <<'TIMER'
[Unit]
Description=Check Grupo Security IP certificate renewal twice daily

[Timer]
OnCalendar=*-*-* 03,15:00:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable --now gs-certbot-renew.timer

echo 'HTTPS por IP configurado; Nginx redirige el puerto 80 al 443.'
echo 'El panel mostrará mantenimiento hasta que frontend y API estén activos.'
systemctl list-timers gs-certbot-renew.timer --no-pager
