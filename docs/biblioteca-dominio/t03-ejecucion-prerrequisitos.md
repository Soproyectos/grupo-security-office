# T03 · Autorización recibida, ejecución no iniciada

> **Actualización posterior, 22/10/2026:** el usuario confirmó el aviso y se ejecutó un único intento, detenido por P0001 antes del DDL. Limpieza de contenedores/red propios verificada. Este texto/JSON conserva el corte previo; el estado actual y la evidencia están en [resultado de ejecución](./t03-ejecucion-postgresql18.md).

**22/10/2026 — Preparada para prueba; no validada en PostgreSQL.** El usuario autorizó transferir y ejecutar exclusivamente el procedimiento T03 y su manifiesto en gs-test-* de la VPS. Esta autorización sigue vigente dentro de ese alcance; no se solicita otra aprobación de ejecución por defecto. [Procedimiento congelado](./t03-prueba-postgresql18.md) · [Evidencia local de prerrequisitos](./evidencia/t03-ejecucion-prerrequisitos.json) · [Bitácora](../bitacora/2026-10-22-T03-preflight-ejecucion.md).

## Punto de espera real

El procedimiento de aislamiento al que remite T03, `C:\Users\sopor\traspaso-codex-biblioteca\candidata\plan-prueba-temporal-vps.md`, sección 11, exige: **«Tú: avisar al equipo de seguridad (Netdata) de la ventana de prueba.»** El usuario pidió confirmar que ese aviso esté realizado antes de comenzar. No hay confirmación recibida en esta ejecución; se preguntó al usuario y no se presume que autorización de prueba equivalga a aviso realizado.

Por ese prerrequisito, **no se inició SSH, transferencia, preflight remoto ni prueba**. No se intentó sustituir el aviso por una comunicación automática al equipo. La única información de acceso consultada fue historial de configuración existente y presencia de archivos locales; no se leyeron claves privadas ni se cambiaron permisos, configuración o credenciales. Existe una ruta SSH usada anteriormente y los archivos locales esperados, pero su funcionamiento actual aún no está comprobado.

## Comprobado localmente

- Carpeta, rama y HEAD siguen siendo los de la entrega: `Esnaider/nifty-robinson-8a8974`, `cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00`. Estado Git compatible con los cambios recibidos, sin operaciones de integración.
- Procedimiento y manifiesto actuales leídos. Hash SHA-256 completo de esquema, SQL, complemento, script y paquete comparado con el manifiesto: **cinco coincidencias**.
- Los nueve miembros del tar se leyeron sin extraerlos a la VPS y sus hashes coinciden. No se regeneró el paquete ni se modificó ningún byte autorizado.
- `ssh` y `scp` instalados; comprobación de existencia de archivos locales de acceso y known_hosts, sin leer sus contenidos. No se comprobó todavía autenticación ni identidad remota.

Huellas principales confirmadas:

- Esquema: `5f6bc6835e7d775929006b3da7a85b46cd1cb2d5ab06ec63bbeaae3dccd396a4`.
- SQL: `c6b6c38425bfd3321f8610d3311fe3a7a08a7c748ef172df047d63f2e37ea36b`.
- Complemento: `43541773a8f0d51d33a8d97774114a300a83022ce7c2954e257cf1611c0e70e2`.
- Script: `f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e`.
- Paquete: `b00fc5d08dcf0487d8a0f42c063c901b378d11cf64095d97ed2404b03c59a37b`.

## No comprobado ni ejecutado

Disponibilidad actual de CPU/RAM/disco, Docker/imagen local de la VPS, acceso SSH actual y ausencia de colisiones gs-test-* están **pendientes de preflight remoto**, no aprobados por una observación anterior. PostgreSQL/imagen/psql remotos no se ejecutaron para consultar versiones.

Todos los casos —estructura física/NOT NULL/default, datos válidos e inválidos, unicidad normalizada, 19 FK, CHECK/enums, rollback DDL y rollback de fixtures— quedan **no ejecutados**. No hubo errores SQL deliberados ni inesperados: ninguna sesión SQL se abrió. No se transfirieron artefactos ni se crearon recursos; limpieza no aplicable. No se inspeccionaron contenedores, servicios ni datos productivos y no se afirma integridad de producción.

## Reanudación dentro de la autorización existente

Primero recibir confirmación del aviso realizado. Después comprobar acceso por la ruta existente con autenticación no interactiva y validación estricta del host; no solicitar secretos en el chat. Continuar solo si el acceso y el preflight remoto confirman recursos suficientes, imagen ya presente y nombres libres, sin instalaciones, descargas, reutilización de recursos ni cambios de servicios.

Si todo está cumplido, transferir únicamente script y paquete ya autorizados, verificar hashes de nuevo en destino y ejecutar los comandos exactos del procedimiento. Ante fallo inesperado, conservar evidencia, limpiar únicamente recursos propios y detenerse sin modificar SQL/procedimiento ni reintentar de otra forma. Si falta acceso o hay que cambiar el procedimiento, informar el impedimento concreto y esperar instrucción.

T04, conexión web, datos reales, T00, commit/push y despliegue permanecen fuera de alcance. Este registro no altera script, paquete, SQL, complemento ni comandos autorizados.
