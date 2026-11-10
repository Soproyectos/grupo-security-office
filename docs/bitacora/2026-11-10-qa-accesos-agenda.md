# Despliegue QA de accesos y agenda — 10/11/2026

## Alcance y autorización

El usuario autorizó push y despliegue, y confirmó que el destino es QA. Se publicó `codex/compact-access-agenda`; versión funcional desplegada: `114e17d4a2c71bbe13d64a69f7e532e04bc770b6` (incluye `7b53d83` y `a2de439`). No se hizo merge a main ni se ejecutó CD productivo.

Se reemplazaron únicamente `gs-test-demo-api` y `gs-test-demo-web` en `gs-test-demo-net`, conservando sus IP y el alias `api`. No se modificaron producción, la API paralela de marketing, contenedores de bases ni esquemas. No se ejecutaron migraciones ni se crearon tareas, sesiones o concesiones de prueba.

## Compilación reproducible

Fuentes extraídas con `git archive` desde el commit, sin ignorados, entornos locales, prototipos ni node_modules. SHA-256 de archivos transferidos:

- Backend: `9280a173f62e3073de38324dce86539acff7fa583742caaa22175bcc9325b8ce`.
- Frontend: `8f7648ed93021da8d159b1ff3bef2213de14e687761122faf2f345e882a364be`.

En `/tmp/gs-agenda-qa-114e17d/src/backend`, `docker build --target build -t gs-test-demo-api:agenda-build-114e17d .` terminó con salida 0. `npm run build` generó ambos clientes Prisma 6.19.3, compiló Nest y copió el cliente de biblioteca. Después `docker build -t gs-test-demo-api:agenda-114e17d .` terminó con salida 0.

En el directorio frontend de la misma extracción, `docker build -t gs-test-demo-web:agenda-114e17d .` terminó con salida 0 (TypeScript y Vite incluidos).

La generación limpia en Linux resolvió los bloqueos de tipos de clientes generados observados en la instalación local. Vite local seguía fallando por acceso denegado al eliminar temporales de esbuild; no se reutilizó su salida parcial.

## Aplicación y verificaciones

Procedimiento versionado en `deploy/qa/agenda-114e17d-swap.py`; comprobación de servicios de solo lectura en `deploy/qa/agenda-114e17d-readonly.cjs`. Son específicos de esta versión: no constituyen un deploy genérico ni deben ejecutarse de nuevo sobre el estado ya aplicado.

Se validó sintaxis y `--preflight` antes de detener servicios. Las variables y el inspect original permanecen solo en la VPS, en `/tmp/gs-agenda-release-114e17d` (directorio 0700; archivos 0600); no se descargaron ni registraron secretos. Se preservaron configuración de ejecución y archivos `uploads` mediante tar, verificado por manifiesto de contenido SHA-256, modos y propietarios. El chequeo de salud web usa loopback IPv4, corrigiendo el chequeo localhost que antes la marcaba unhealthy.

La API anterior se detuvo antes de arrancar su reemplazo; no se añadió una instancia simultánea de esa API. El reemplazo se verificó antes de cambiar la web. Existe una API de marketing previa; quedó intacta, sin certificar ni alterar su programación.

Imágenes activas:

- API: `sha256:7950299c883609baa8f9da40a36541689bf7048c0adc82fb77a3351dae9330f7`.
- Web: `sha256:14b43292458a60054c1e4fdfcbc12e3f95dae2bedecdbbb6507cef235c1acd77`.

Resultado: ambos contenedores healthy, cero reinicios posteriores, rollback no utilizado. Desde el proxy web: `/` 200, `/api/health` 200 con `status=ok` y `database=connected`, `/api/users` sin sesión 401. Se comprobó la presencia del CSS `agenda-current-time` y del código backend `teamAgendaGrantsForRoles` en los contenedores activos.

Comprobación de servicios sobre datos QA, sin escribir:

- 3 usuarios internos activos evaluados; lectura propia autorizada para los 3.
- 1 responsable con subordinados activos; asignación derivada autorizada.
- 1 destino fuera de su rama rechazado.
- La fuente jerárquica no concedió completar tareas ajenas.

Esta comprobación usa servicios reales y datos QA, no suplanta sesiones HTTP ni prueba el formulario con cada cuenta. El recorrido interactivo completo con usuarios QA queda pendiente. Las pruebas locales anteriores (193 frontend y 132 backend focalizadas) están documentadas en el traspaso. Las integraciones PostgreSQL locales que antes no pudieron ejecutarse no se declaran aprobadas por este despliegue.

## Respaldo y reversión

Quedaron detenidos y desconectados de la red, sin borrarlos:

- `gs-test-demo-api-pre-agenda-114e17d`.
- `gs-test-demo-web-pre-agenda-114e17d`.

El estado privado contiene los IDs originales, configuración y archivo verificado de uploads. El script revierte automáticamente si falla su aplicación; no se necesitó. Para una reversión posterior, obtener la autorización correspondiente, detener primero los candidatos, conservar cualquier upload nuevo desde el despliegue y restaurar originales por sus IDs con la IP/aliases guardados. Verificar salud/proxy. No restaurar bases ni ejecutar migraciones. No ejecutar de nuevo el script principal: rechaza sobrescribir el estado y los respaldos existentes.

La publicación usa las imágenes y los contenedores QA explícitos; no se modificó Compose ni CD. No recrear QA desde sus tags antiguos sin aplicar este procedimiento/versionar el cambio de configuración de despliegue.
