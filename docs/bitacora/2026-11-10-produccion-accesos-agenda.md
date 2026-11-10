# Producción VPS: accesos y agenda — 10/11/2026

## Autorización y regla persistente

El usuario confirmó que pedir una actualización en la VPS significa actualizar **producción**. QA se usa solo cuando lo pide expresamente. Regla incorporada a `AGENTS.md`; no autoriza migraciones, rotación de credenciales ni cambios de datos ajenos al encargo.

Versión funcional desplegada: `114e17d4a2c71bbe13d64a69f7e532e04bc770b6`, que incorpora asignación compacta de paneles, calendario semanal/mes y permisos derivados de jerarquía. Los commits posteriores documentan la ejecución y la regla; no cambian las imágenes funcionales.

## Incidencia inicial y recuperación sin rotación

`gs-api` estaba reiniciándose con la imagen de revisión `89046564`. Sus etiquetas Compose indicaban solo `docker-compose.prod.yml`, sin el override VPS. No recibía `MFA_ENCRYPTION_KEY` ni publicaba los puertos loopback esperados; el frontend estaba saludable dentro del contenedor pero tampoco publicaba el puerto del proxy del host.

`.env` contenía dos entradas MFA: la última sobrescribía la anterior y no autenticaba el registro MFA existente. La comprobación aislada en la VPS verificó todas las entradas existentes contra los ciphertexts de producción, mostrando solo conteos: 2 candidatas, 1 registro MFA, 1 autenticación correcta con la entrada anterior; 0 registros Notion. No se imprimieron claves, ciphertexts ni plaintexts.

Se recuperó esa entrada existente, se quitó el duplicado que la sobrescribía y se inyectó mediante los **dos archivos Compose existentes**, sin reemplazarlos ni cambiar sus permisos. No se generó una clave nueva ni se recifraron/borraron registros. El valor efectivo MFA se conservó y la comprobación posterior confirmó que la variable del contenedor coincide con la clave autenticada.

## Build, respaldo y aplicación

Las imágenes son exactamente las construidas y validadas en Linux durante la entrega QA (`docs/bitacora/2026-11-10-qa-accesos-agenda.md`). Backend genera ambos clientes Prisma 6.19.3, compila Nest y copia el cliente de Biblioteca; frontend pasa TypeScript y Vite. Builds con salida 0.

- API: `sha256:7950299c883609baa8f9da40a36541689bf7048c0adc82fb77a3351dae9330f7`.
- Frontend: `sha256:14b43292458a60054c1e4fdfcbc12e3f95dae2bedecdbbb6507cef235c1acd77`.

Referencias locales de imágenes en la VPS: `ghcr.io/soproyectos/grupo-security-office/api:114e17d4` y `frontend:114e17d4`. Son etiquetas locales; no se ha publicado este tag en GHCR. No hacer `pull` de este tag ni eliminar las imágenes locales que conserva la reversión.

Antes de aplicar se hizo `pg_dump -Fc` de `gs-db`, verificado con `pg_restore --list`. Dump, configuración anterior e inspect se conservan solo en `/opt/grupo-security/releases/agenda-114e17d4`, con directorio 0700 y archivos 0600. No se descargaron datos productivos ni secretos.

Procedimiento versionado: `deploy/vps/agenda-114e17d4-crypto-probe.py`, `agenda-114e17d4-update.py` y `agenda-114e17d4-verify.py`. Son evidencia específica de esta entrega, no una automatización genérica ni scripts para ejecutar de nuevo: rechazan sobrescribir su estado previo.

La aplicación usa `docker compose --env-file /opt/grupo-security/.env -p grupo-security -f /opt/grupo-security/docker-compose.prod.yml -f /opt/grupo-security/deploy/vps/docker-compose.override.yml up -d --no-deps --pull never api frontend`, con `IMAGE_TAG=114e17d4`. `.env` y `.deployed-tag` quedaron fijados a esa versión. No se usó `deploy.sh`, no se ejecutaron migraciones ni se recreó `gs-db`. QA, marketing y el Nginx del host no se modificaron.

## Verificación final

- `gs-api` y `gs-frontend`: healthy, cero reinicios posteriores y digest esperado.
- Base conectada; mismo ID y fecha de inicio del contenedor PostgreSQL; conteo de migraciones igual antes/después.
- Mismos `DATABASE_URL`, `JWT_SECRET` y `CORS_ORIGIN`; clave MFA restaurada y válida; mismos montajes persistentes de uploads/importaciones.
- HTTPS público `https://dev.gruposecurity.cloud/`, `/agenda` y `/api/health`: 200. `/api/users` sin sesión: 401.
- CSS desplegado contiene `agenda-current-time`.
- Comprobación de servicios de solo lectura: 1 usuario interno activo con lectura propia autorizada; no hay responsables con subordinados activos en producción. No se crearon usuarios, equipos ni tareas para probarlo. La asignación jerárquica se ejercitó previamente en QA (1 responsable y rechazo de destino fuera de su rama) y en las pruebas unitarias.

No se hizo login interactivo con credenciales de usuarios ni se certifica un recorrido manual completo de cada cuenta.

## Reversión

Se conservaron las imágenes previas con tag local `pre-agenda-114e17d4` y el dump/configuración privada. El rollback automático no fue necesario. Si fallaba la nueva versión, el procedimiento restauraba esas imágenes con la configuración reparada y la clave autenticada: restaurar el Compose base aislado o la entrada MFA incorrecta reproduciría la incidencia original.

Una reversión futura requiere la autorización correspondiente. Usar ambos Compose, el tag previo local y `--no-deps --pull never api frontend`; verificar salud, HTTPS y montajes. No restaurar el dump, rotar claves ni ejecutar migraciones como parte automática del rollback. Los datos permanecen en sus volúmenes y bind existentes.
