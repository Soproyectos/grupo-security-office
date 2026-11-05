# Validación navegable de la rama Biblioteca

Fecha: 26/10/2026. Rama: `Esnaider/validacion-biblioteca`.

## Solicitud y alcance

El usuario pidió dejar corriendo el servidor de esta rama para validar la página. Indicó que ya existe una base de pruebas en la VPS y autorizó revisarla. No autorizó crear otra base ni ejecutar migraciones.

## Entorno comprobado

- Frontend de este worktree en `http://127.0.0.1:5173`, con Vite y recarga de cambios. Proxy `/api` y `/uploads` hacia `http://127.0.0.1:3001`.
- Túnel SSH propio, ligado solo a loopback en el puerto 3001, hacia la API existente `gs-test-demo-api` de la VPS. No se transfieren credenciales de servicio al equipo local.
- Contenedores de pruebas encontrados: `gs-test-demo-api`, `gs-test-demo-web`, `gs-test-demo-ops-db` y `gs-test-biblioteca-gs-test-biblioteca-db-1`. No se modificaron.
- API de demostración antes de actualizar: `NODE_ENV=development`, `LIBRARY_DATABASE_MODE=legacy`, catálogo `panels-20261019-3` y seis paquetes anteriores. Inicialmente no servía el backend actual de la rama. La actualización confirmada se registra más abajo.
- Base operativa de pruebas: `gs_api_copy`, alojada en `gs-test-demo-ops-db`: 5.056 productos, 4 usuarios y 52 concesiones, comprobados con consultas de conteo de solo lectura. Existe además `gs_test_biblioteca_dev`; la API de demostración no la usa en modo legacy.

No se eligieron por su nombre las bases locales encontradas: no había evidencia para clasificarlas como el entorno recordado por el usuario. No se consultaron filas con datos personales ni contraseñas.

## Verificación real

- Backend: `src/backend/node_modules/.bin/nest.cmd build`, salida 0.
- Frontend HTTP: respuesta 200 y cliente Vite presente.
- Módulo servido por Vite: contiene `biblioteca-consulta` y `Accesos anteriores`, correspondientes al código actual.
- `GET http://127.0.0.1:3001/api/health`: `status=ok`, `database=connected`, `environment=development`.
- La misma comprobación a través de `http://127.0.0.1:5173/api/health` pasa.
- Se abrió la página local en el navegador de Codex. No se inició sesión ni se afirmó un recorrido interactivo completo.

## Preparación de actualización de la API de pruebas

Paquete local `biblioteca-api-current-branch.tgz` en el directorio de artefactos de esta conversación. Incluye `dist/src`, excluyendo pruebas/integraciones; no incluye entornos, credenciales ni node_modules.

SHA-256: `D8D7268840CD794D1BF9BB0FC834070FA55E70593568D775BB4C80224CEC7F77`.

La propuesta solicitó actualizar y reiniciar únicamente `gs-test-demo-api`, conservando configuración/bases y una copia recuperable del código anterior, sin migraciones ni cambios productivos. El usuario pidió «inyectarle la nueva configuración» y aclaró usar la API de pruebas que ya se estaba manejando. Se aplicó a ese mismo contenedor, según se registra a continuación.

## Actualización confirmada de la API existente

- Destino exclusivo: `gs-test-demo-api`, directorio `/app/dist/src`; imagen original identificada antes del cambio como `sha256:f3762a9c8905704e5450b3e695dade7bd016b1875cae6d9afa401642832b9e32`.
- Paquete transferido a `/tmp/gs-test-biblioteca-api-20261026-d8d72688.tgz`; hash SHA-256 verificado en la VPS antes de aplicarlo.
- Primer intento de preparación dentro del contenedor: su usuario normal no podía crear una carpeta en `/app/dist`; falló antes de cambiar código o reiniciar.
- Procedimiento aplicado: extracción del paquete en `/tmp/gs-test-biblioteca-release-d8d72688/current`, copia del código anterior con `docker cp` a `/tmp/gs-test-biblioteca-release-d8d72688/previous-src`, copia del código nuevo con `docker cp` y `docker restart gs-test-demo-api`. Sin usuario root adicional dentro del contenedor, cambios de credenciales, migraciones ni comandos de borrado.
- Tras reiniciar, la API declara catálogo **`panels-20261026-1`** y los paquetes `biblioteca-consulta` (Productos), `biblioteca-actualizacion` (Actualización) y `biblioteca-publicacion` (Publicación).
- Salud por el proxy local: `status=ok`, `database=connected`, `environment=development`; uptime reiniciado, comprobado de nuevo tras un minuto.
- `GET /api/products` sin sesión devuelve **401**.
- Conteos antes/después: **5.056 productos, 4 usuarios, 52 concesiones**. No se aplicaron asignaciones nuevas ni migraciones. Los conteos no equivalen a una comparación completa de contenido.
- Conserva `LIBRARY_DATABASE_MODE=legacy`; esta actualización no realiza el corte a la base dedicada.

Vite escucha solo en loopback, PID inicial 28580; túnel HTTP propio, PID inicial 17088. Ambos se comprobaron activos después de verificar la API. Los PID pueden cambiar en un arranque posterior; consultar los archivos `.pid` propios y verificar el proceso antes de detenerlo.

### Reversión de la API de pruebas

Restaurar exclusivamente `/tmp/gs-test-biblioteca-release-d8d72688/previous-src/.` a `gs-test-demo-api:/app/dist/src` mediante `docker cp` y reiniciar ese único contenedor con la autorización correspondiente. No restaurar bases ni cambiar otros servicios. El despliegue actual vive en la capa escribible del contenedor: persiste al reiniciar, pero recrear el contenedor desde su imagen anterior perdería esta actualización. Empaquetarlo en una imagen reproducible queda pendiente; no se cambió el compose ni el tag original.

## Rechazo de aprobación automática

El primer procedimiento propuesto arrancaba una API local reutilizando secretos del contenedor de pruebas solo en memoria. La revisión automática lo rechazó por trasladar ese payload desde la VPS al equipo local. No se ejecutó ni se transfirieron secretos. Se retiró el script y el interruptor de cron que se habían preparado para esa alternativa. El procedimiento vigente usa únicamente el túnel HTTP a la API existente y mantiene los secretos en la VPS.

## Persistencia y reversión

Vite y el túnel se iniciaron como procesos ocultos en segundo plano, con PID/logs en los artefactos locales de la conversación. Siguen disponibles mientras el equipo y la conexión SSH permanezcan activos; no se instaló un servicio de arranque automático. Para detener este entorno, identificar y detener solo esos PID propios, nunca todos los procesos Node/SSH. No se cambió configuración de servicios remotos, proxy público, DNS ni firewall.

## Pendientes de Biblioteca

Completar escalafones configurables entre API/plantillas/frontend y sus pruebas; comprobar permisos por acción sin cargo/Listas y transición de accesos; hacer operativa Publicación desde su bandeja; construir Historial global; filtros/conteos de pendientes globales, medios y previsualizaciones reales; recorrido navegador/API con usuarios de prueba. El corte a base dedicada conserva sus bloqueos independientes de consistencia/referencias y decisiones comerciales/archivos. Este preview en legacy no demuestra que esos bloqueos estén cerrados.
