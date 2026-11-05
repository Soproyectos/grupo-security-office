# T03 — Intento aislado detenido y limpieza verificada

22/10/2026 · Codex · Esnaider/nifty-robinson-8a8974 · HEAD cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00.

Tras recibir «Sí, aviso realizado», se verificaron acceso SSH existente/host estricto, recursos, imagen ya presente y ausencia de colisiones, salida 0. Se compararon cinco hashes locales completos y se transfirieron únicamente los dos artefactos aprobados. Hashes remotos y payload conformes. No se leyó la clave ni se copiaron secretos.

El único lanzamiento del procedimiento exacto terminó con salida 2, entre 2026-10-22T21:48:31.019Z y 2026-10-22T21:48:38.386Z. La primera sesión SQL falló inesperadamente en destino.sql:22: P0001 GS_T03_DESTINO_RECHAZADO. La condición individual no se imprimió, por lo que no se afirma una causa específica. No se alcanzó vacío/DDL/inspección ni ZX003 deliberado; fases 2 y 3 no comenzaron, 0/19 FK probadas. No se corrigió SQL/script ni se reintentó.

El trap eliminó los contenedores y red de IDs propios y los dos env. Cierre de solo lectura por esos IDs confirmó ausencia, salida 0. Se conservan únicamente los artefactos y evidencia sintética previstos, detallados en el informe. No hubo prune ni borrados de terceros. No se inspeccionó producción ni se afirma su integridad total.

Archivos: índice/estado README, anotación de continuación en prerrequisitos, nuevo [informe de ejecución](../biblioteca-dominio/t03-ejecucion-postgresql18.md), logs/comandos/JSON/hashes en [evidencia/t03-ejecucion](../biblioteca-dominio/evidencia/t03-ejecucion/) y esta bitácora. Los artefactos ejecutables, manifiesto preparado, esquema/SQL/complemento y T00 no se modificaron.

T03 permanece **no validada en PostgreSQL**. No hubo instalaciones, cambios productivos, commit/push, despliegue ni T04. Siguiente tarea concreta: autorización separada para diagnosticar y corregir localmente la guarda y preparar nuevos hashes; cualquier repetición en VPS requerirá también autorización.

Reversión documental: retirar solo este informe/bitácora/evidencia nuevos y restaurar exclusivamente los párrafos de estado de esta ejecución. No hay recursos de ejecución activos que revertir; no borrar evidencia remota retenida sin un alcance explícito.

## Repetición única autorizada, 22:28 UTC

El usuario autorizó paquete 5450c8abf16a349d469e8063593e790a673b32ab22745a277da768e4e6616dd1 y ejecutor f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e, y confirmó vigencia del aviso seguridad/Netdata. Se verificaron hashes locales/miembros, recursos, imagen y nombres/rutas libres; se transfirieron solo los dos artefactos a rutas nuevas. Preflight y transferencias terminaron en 0. Se preservó toda la evidencia previa.

Único lanzamiento 22:28:36.260Z–22:28:46.350Z: salida 3. Pasaron destino, esquema vacío, dos inspecciones físicas, rollback DDL deliberado, aplicación atómica, datos válidos en 23 tablas, defaults, 19/19 FK inválidas, siete estados y doce negativas adicionales. Falló datos.sql:89: expect_error esperaba 23503/products_brandId_fkey y capturó 23001/products_brandId_fkey, lanzando P0001. El borrado fue rechazado, pero la expectativa del caso no se cumplió. No se corrigió ni reintentó. Acciones posteriores, ROLLBACK explícito/tablas vacías y reinspección final no se verificaron.

El trap limpió los dos contenedores, red y env propios. Cierre independiente por IDs, salida 0, confirmó ausencia; logs/payload y artefactos sintéticos se retienen conforme al plan. Se recuperaron cinco archivos sin secretos. No se inspeccionó ni modificó producción, T00 o datos reales; sin instalaciones, T04, commit/push o despliegue.

Actualizados informe, índice y esta bitácora; añadida evidencia separada en [t03-ejecucion-ip](../biblioteca-dominio/evidencia/t03-ejecucion-ip/), con comandos, hashes, resultados por caso, 19 FK, error y limpieza. [Informe actual](../biblioteca-dominio/t03-ejecucion-postgresql18.md). Estructura y rollback DDL comprobados en PostgreSQL 18 aislado; T03 no cerrada. Siguiente: esperar autorización para revisar la expectativa de RESTRICT localmente. No avanzar a integración/carga ni repetir automáticamente.

Reversión de este registro: retirar solo esta sección y la nueva evidencia, y restaurar los párrafos de estado de esta repetición. No hay recursos activos propios pendientes; se conserva evidencia remota prevista sin borrados generales.

## Corrección local autorizada de la expectativa RESTRICT

Se confirmó products_brandId_fkey en migration.sql:619, products.brandId → brands.id con ON DELETE RESTRICT/ON UPDATE CASCADE, y 23001 con esa FK en el log anterior. La documentación/código oficial PostgreSQL 18 confirma restrict_violation, distinto de la referencia hija inválida 23503. Se corrigió únicamente datos.sql: SQLSTATE exacto 23001 y nombre obligatorio de FK; helper estricto también ante NULL; aserción de marca/producto conservados; efectos CASCADE/SET NULL con EXISTS para evitar aserciones omitidas por cero filas. Los 19 intentos de FK hija inválida siguen exigiendo 23503 y su FK concreta.

Se preparó localmente el paquete separado prueba-t03-corregida-restrict.tar.gz (dce033a7a39a83311c4cb39313686db49ec6c8775e34fa6b82757ad0a09596e7). Solo datos.sql/SHA256SUMS difieren del paquete IP anterior. Ejecutor, modelo, DDL/complemento y FK sin cambios; paquetes y evidencia previos conservados. No se ejecutó SQL ni se accedió a la VPS. Las nuevas aserciones quedan preparadas, no probadas en PostgreSQL.

Actualizados informe/índice y esta bitácora; añadidos diff mínimo y manifiesto de corrección en evidencia/t03-correccion-restrict.patch y .json. El informe propone un único ensayo completo con las tres fases, acciones pendientes, ROLLBACK de fixtures y 23 tablas vacías, sujeto a autorización del nuevo hash. Sin instalaciones, T00, T04, commit/push o cambios productivos. Reversión local: aplicar al revés solo ese diff, retirar el paquete nuevo/registro de corrección y restaurar los párrafos de estado; no hay recursos remotos de esta corrección que limpiar.

## Cierre aprobado y mandato de continuidad

El usuario autorizó el paquete RESTRICT corregido y entregó el mandato de continuar autónomamente toda la construcción en desarrollo/pruebas, sin producción/datos reales/commit/push/despliegue. Confirmó que el aviso de seguridad cubre esta ventana. T03 se ejecutó una vez con preflight/hashes conformes y terminó con salida 0, GS_T03_PRUEBA_OK. Pasaron los casos pendientes, ROLLBACK de fixtures, 23 tablas vacías y reinspección. Limpieza propia independiente verificada; evidencia en t03-ejecucion-restrict, conservando los dos intentos anteriores. No hubo conexión o cambio productivo. Se cierra T03 para estos 23 modelos, no la biblioteca completa; se continúa T04/T05 bajo el mandato.
