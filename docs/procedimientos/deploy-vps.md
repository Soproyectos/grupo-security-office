# Runbook: despliegue en el VPS (GitHub Actions, GHCR y SSH)

Procedimiento para publicar la aplicación web en el VPS de OVH (`57.131.50.38`, `dev.gruposecurity.cloud`). Sustituye a [postgres-hostinger.md](postgres-hostinger.md) para producción. Las acciones que requieren `sudo`, secretos de GitHub o claves SSH las ejecuta una persona autorizada; ninguna se automatiza desde el repositorio.

## Arquitectura

```text
push a main ──► CI ──(verde)──► CD (GitHub Actions)
                                  ├─ build api + frontend ──► GHCR  ghcr.io/soproyectos/grupo-security-office/{api,frontend}:<sha8>
                                  └─ SSH (usuario deploy) ──► VPS /opt/grupo-security
                                        1. copia docker-compose.prod.yml y deploy/vps
                                        2. deploy/vps/deploy.sh <sha8>
                                              pull ► dump previo ► prisma migrate deploy ► up ► espera de salud ► rollback si falla
                                  └─ smoke test contra vars.DEPLOY_URL
```

- Nginx del host es dueño de los puertos 80/443 y hace proxy a `127.0.0.1:3001` (API) y `127.0.0.1:8080` (frontend). Los contenedores solo escuchan en `127.0.0.1`.
- Contenedores: `gs-api`, `gs-frontend`, `gs-db` (`postgres:18-alpine`). Proyecto Compose: `grupo-security`. Volúmenes: `grupo-security_pgdata` y `grupo-security_uploads`.
- Netdata y los demás servicios del host quedan fuera de este procedimiento.

| Archivo | Función |
| --- | --- |
| `docker-compose.prod.yml` | Base: imágenes de GHCR (`IMAGE_TAG`, por defecto `latest`), base de datos, volúmenes y variables obligatorias. |
| `deploy/vps/docker-compose.override.yml` | Específico del VPS: deja fuera el nginx incluido (perfil `docker-proxy`), publica puertos en `127.0.0.1` y exige `MFA_ENCRYPTION_KEY`. |
| `deploy/vps/docker-compose.build.yml` | Plan B: construye las imágenes en el VPS en lugar de bajarlas de GHCR. |
| `deploy/vps/deploy.sh` | Despliegue en el VPS (lo invoca CD; también se puede usar a mano). |
| `deploy/vps/bootstrap-vps.sh` | Preparación única del VPS (usuario, grupo, directorios, temporizador). |
| `deploy/vps/gs-db-backup.sh` + `systemd/gs-db-backup.*` | Copia diaria de la base de datos. |
| `deploy/vps/nginx-*.conf`, `setup-*.sh`, `renew-ip-cert.sh`, `check-renewal.sh`, `maintenance.html`, `systemd/gs-certbot-renew.*` | Plantillas y scripts de nginx y TLS del host (copiados tal como están en producción). |

## Configuración inicial (una sola vez)

1. **Generar el par de claves de despliegue** en una máquina de confianza (nunca en el VPS ni en el repositorio):

   ```bash
   ssh-keygen -t ed25519 -N "" -C "gh-actions-deploy" -f ./gs-deploy-key
   ```

2. **Preparar el VPS** copiando solo la clave pública y ejecutando el bootstrap con `sudo` desde una copia del repositorio:

   ```bash
   sudo deploy/vps/bootstrap-vps.sh /ruta/a/gs-deploy-key.pub
   ```

   El script es idempotente y no toca `sshd_config`, el firewall, Netdata ni nginx. Crea el grupo `gsops` y el usuario `deploy` (grupos `docker` y `gsops`), instala la clave, ajusta permisos de `/opt/grupo-security` (grupo `gsops`, setgid, `.env` en modo 640), crea `/var/backups/grupo-security/{daily,pre-deploy}` y activa el temporizador `gs-db-backup.timer`. El usuario operador (`dev`) queda en `gsops`; hace falta iniciar sesión de nuevo para que el cambio de grupo aplique.

3. **Comprobar el acceso** desde la máquina de confianza:

   ```bash
   ssh -i ./gs-deploy-key deploy@57.131.50.38 'id && docker ps --format "{{.Names}}"'
   ```

4. **Revisar `/opt/grupo-security/.env`** (no se versiona). Variables obligatorias: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `MFA_ENCRYPTION_KEY`. Opcionales: `POSTGRES_DB` (por defecto `grupo_security`), `JWT_EXPIRES_IN` (por defecto `8h`).

5. **Configurar GitHub** (Settings ► Environments ► `production`):

   | Tipo | Nombre | Valor |
   | --- | --- | --- |
   | Secret | `DEPLOY_HOST` | `57.131.50.38` |
   | Secret | `DEPLOY_USER` | `deploy` |
   | Secret | `DEPLOY_SSH_KEY` | contenido de la clave **privada** `gs-deploy-key` |
   | Secret (opcional) | `DEPLOY_PORT` | puerto SSH si no es 22 |
   | Variable | `DEPLOY_URL` | `https://dev.gruposecurity.cloud` |
   | Variable (opcional) | `DISCORD_WEBHOOK_URL` | webhook de notificación |

   Se recomienda restringir el entorno `production` a la rama `main` (Deployment branches) y, si se desea una aprobación manual, añadir revisores. Sin `DEPLOY_HOST` el workflow publica las imágenes pero omite el despliegue y lo avisa en el resumen.

6. **Paquetes en GHCR.** El primer CD crea `api` y `frontend`. Las imágenes llevan la etiqueta `org.opencontainers.image.source`, que enlaza cada paquete con el repositorio; así el `GITHUB_TOKEN` del job (`packages: read`) puede bajarlas y no se guarda ningún PAT en el VPS. Si un pull falla con `denied`, abrir el paquete ► Package settings ► Manage Actions access y añadir este repositorio con rol Read. Eliminar la clave privada local cuando esté cargada en GitHub.

## Despliegue normal

1. Un merge o push a `main` ejecuta CI. Si termina en verde, arranca CD con ese mismo commit.
2. CD construye y publica `api:<sha8>` y `frontend:<sha8>` (más `latest`), copia `docker-compose.prod.yml` y `deploy/vps` al VPS y ejecuta `deploy.sh <sha8>`.
3. `deploy.sh`:
   1. baja las imágenes;
   2. hace un `pg_dump` verificado en `/var/backups/grupo-security/pre-deploy/<fecha>-<tag>.dump` (se conservan los 10 más recientes);
   3. aplica `prisma migrate deploy` con la imagen nueva;
   4. recrea `api` y `frontend` y espera hasta 180 s a que ambos estén `healthy`;
   5. si todo va bien, guarda el tag en `/opt/grupo-security/.deployed-tag`.
4. Si falla la salud, el script repone el tag anterior, avisa de que **las migraciones no se revierten**, muestra la ruta del dump previo y termina con error (el job queda en rojo).
5. CD ejecuta `scripts/smoke-test.sh` contra `DEPLOY_URL`.

Las migraciones se aplican antes de recrear los contenedores, así que el código anterior corre unos segundos contra el esquema nuevo: las migraciones deben ser compatibles hacia atrás (agregar primero, eliminar en un despliegue posterior).

Despliegue manual: Actions ► CD ► Run workflow. Con el campo `tag` vacío se construye y despliega el commit seleccionado.

## Rollback

- **Desde GitHub (recomendado):** Actions ► CD ► Run workflow, con `tag` = el `<sha8>` anterior (`git rev-parse --short=8 <commit>`). No se construye nada; solo se despliega esa etiqueta ya publicada.
- **Desde el VPS:** `/opt/grupo-security/deploy/vps/deploy.sh <tag-anterior>`. El tag desplegado ahora figura en `cat /opt/grupo-security/.deployed-tag`.
- **Esquema de base de datos:** las migraciones solo avanzan. Si el esquema también debe retroceder, restaurar el dump previo (ver abajo) y después desplegar el tag anterior.

## Plan B: construir en el VPS (sin GitHub)

Cuando GitHub o GHCR no estén disponibles. Requiere un checkout actualizado del repositorio (por defecto `/home/dev/grupo-security-office`; otra ruta con `GS_SOURCE_DIR`). Tomar antes un dump (sección siguiente).

```bash
cd /opt/grupo-security
export IMAGE_TAG="local-$(git -C /home/dev/grupo-security-office rev-parse --short=8 HEAD)"
C="docker compose -p grupo-security -f docker-compose.prod.yml -f deploy/vps/docker-compose.override.yml -f deploy/vps/docker-compose.build.yml"
$C build
$C run --rm --no-deps -T api node_modules/.bin/prisma migrate deploy
$C up -d --no-deps api frontend
docker inspect -f '{{.Name}} {{.State.Health.Status}}' gs-api gs-frontend
```

Las imágenes locales (`gs-api:local-*`) no sirven como destino de rollback automático: el siguiente despliegue desde CD no tendrá un tag previo de GHCR.

## Copias de seguridad y restauración

| Tipo | Ubicación | Frecuencia y retención |
| --- | --- | --- |
| Diaria | `/var/backups/grupo-security/daily/gs-db-<fecha>.dump` | `gs-db-backup.timer`, hacia las 03:30 (hora del servidor) con hasta 15 min de retraso aleatorio; 14 días |
| Previa a migrar | `/var/backups/grupo-security/pre-deploy/<fecha>-<tag>.dump` | en cada despliegue; los 10 más recientes |

Ambas copias están en el mismo disco; la copia de disco completo diaria de OVH sigue siendo la protección ante pérdida del VPS.

```bash
# Estado y registro del temporizador
systemctl list-timers gs-db-backup.timer
journalctl -u gs-db-backup.service -n 30 --no-pager
sudo systemctl start gs-db-backup.service        # copia inmediata

# Verificar un dump
docker exec -i gs-db pg_restore -l < /var/backups/grupo-security/daily/<archivo>.dump | head

# Ensayo de restauración en una base temporal (no toca producción)
docker exec gs-db sh -c 'createdb -U "$POSTGRES_USER" gs_restore_test'
docker exec -i gs-db sh -c 'pg_restore --no-owner -U "$POSTGRES_USER" -d gs_restore_test' < /var/backups/grupo-security/daily/<archivo>.dump
docker exec gs-db sh -c 'dropdb -U "$POSTGRES_USER" gs_restore_test'
```

**Restaurar sobre producción (destructivo; reemplaza la base completa, incluidas las tablas que el dump no contiene):**

```bash
cd /opt/grupo-security
C="docker compose -p grupo-security -f docker-compose.prod.yml -f deploy/vps/docker-compose.override.yml"
DUMP=/var/backups/grupo-security/pre-deploy/<archivo>.dump
$C exec -T db pg_restore -l < "$DUMP" > /dev/null          # debe terminar sin error
$C stop api
$C exec -T db sh -c 'dropdb --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
$C exec -T db sh -c 'pg_restore --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DUMP"
./deploy/vps/deploy.sh <tag>                               # vuelve a levantar la API; usar el tag acorde con el esquema restaurado (el actual está en .deployed-tag)
```

## Lo que no está versionado

- `/opt/grupo-security/.env` (secretos), certificados de Let's Encrypt y los sitios activos de nginx en `/etc/nginx` (las plantillas sí están en `deploy/vps`).
- `docker-compose.preview.yml` y `frontend-preview.conf`: proyecto de vista previa separado cuyo `container_name` choca con el de producción.
- `/opt/grupo-security/backups/` (copias antiguas, solo `root`) y los archivos `*.bak*`.
- Netdata y otros servicios del host.

## Solución de problemas

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| El job muestra "Deploy skipped" | Falta `DEPLOY_HOST` en el entorno `production` | Configurar los secretos (paso 5). |
| El paso de copia falla con `Operation not permitted` | Permisos de `/opt/grupo-security` | Repetir `bootstrap-vps.sh` con `sudo`. |
| `pull access denied` o `manifest unknown` | El paquete no da acceso al repositorio, o el tag no existe | Revisar Manage Actions access (paso 6) y el tag. |
| `another deploy is already running` | Otro despliegue sigue en curso | Esperar; es un bloqueo por directorio, se libera al terminar. |
| `prisma migrate deploy failed` | Migración con error (los contenedores no se tocaron) | Revisar el log; restaurar el dump previo si el esquema quedó a medias. Un error `P3009` bloquea nuevos despliegues hasta resolverlo. |
| Falla la salud y se hizo rollback | La imagen nueva no arranca | `docker logs gs-api --tail 100` y `docker inspect gs-api`; corregir y volver a publicar. |
| Smoke test en rojo con contenedores sanos | Nginx del host, certificado o `DEPLOY_URL` | `sudo nginx -t`, revisar el certificado y la URL. |
| La copia diaria no corre | Temporizador inactivo o falta el script | `systemctl status gs-db-backup.timer gs-db-backup.service`; comprobar que existe `/opt/grupo-security/deploy/vps/gs-db-backup.sh`. |
| El disco crece | Imágenes con tags antiguos acumuladas | `docker image ls`; eliminar a mano tags viejos, conservando el actual y el anterior. |
