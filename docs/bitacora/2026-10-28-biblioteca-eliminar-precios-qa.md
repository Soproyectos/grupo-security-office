# Limpieza autorizada de precios en QA — 2026-10-28

**Entorno:** rama `Esnaider/validacion-biblioteca`, HEAD `cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00`; API `gs-test-demo-api`, DB `gs-test-demo-ops-db`, base `gs_api_copy`, modo `legacy`, `NODE_ENV=development`.

## Alcance y resultado comprobado

Se eliminaron 2.338 filas vigentes de `prices` en una transacción. No se usó `TRUNCATE` ni `CASCADE`. La tabla quedó con 0 filas. Se conservaron 5.056 productos, 41 listas, 26 marcas, 89 categorías y 7 tarifas (`price_lists`), con las mismas huellas agregadas antes y después. `quotes` y `quote_items` estaban vacías antes y después. La única FK que referencia `prices` es `quote_items.priceId`, `ON DELETE SET NULL`; no había filas afectables.

Se conservaron las 5 revisiones históricas de importación (3 `GUARDADA`, 2 `APLICADA`) y los snapshots relacionados. Las revisiones pendientes no se borraron. El ejecutor toma bloqueos transaccionales sobre revisiones, precios y tablas protegidas para que una aplicación concurrente no repueble precios durante esta operación.

## Respaldo

Respaldo completo anterior a la operación, solo en la VPS: `/home/dev/qa-backups/gs-prices-clear-20261028-164525/gs_api_copy-before.dump` (12.972.395 bytes, modo `600`, modificado `2026-10-28 16:45:28 UTC`). SHA-256: `9a147fca03f6466a4508ee6a4f845ac15120e9372b635947da338499a13e0e78`. `pg_restore --list`, ejecutado dentro del contenedor PostgreSQL compatible, produjo 492 entradas. Esto valida que el archivo se puede listar; no se ejecutó una restauración de prueba.

## Ejecutable y comprobaciones

El ejecutor específico es `scripts/eliminar-precios-qa.cjs` (SHA-256 `ea0ffd739afed85473b04acc406cf558a2326474589e4a3fe8a03f788f02f163`). Exige coincidencia exacta de entorno, host y base; crea un plan dry-run sin escrituras; y en aplicación compara conteos, huellas, revisiones y FK dentro de la transacción antes de `DELETE FROM prices`.

Comprobaciones reales:

- `node --check scripts/eliminar-precios-qa.cjs`: correcto.
- `--dry-run` previo: 2.338 filas objetivo y huellas base registradas.
- `--apply` con el plan: eliminó 2.338; las huellas protegidas no cambiaron.
- `--dry-run` posterior: 0 filas objetivo; operación idempotente al planificar de nuevo.
- Ejecución con `NODE_ENV=production`: rechazada por la guarda antes de conectar o escribir.
- `GET http://127.0.0.1:3001/api/health`: `status=ok`, `database=connected`, `environment=development`.

Un primer intento de aplicación falló por sintaxis de `LOCK TABLE`; PostgreSQL lo rechazó antes de borrar. Se corrigió a bloqueos separados y la aplicación posterior pasó.

## Evidencia y límites

Los recibos dry-run, apply, postcheck, health y rechazo de guarda están en `data/biblioteca-precios-limpieza-20261028/` (ignorado por Git a propósito). No se probaron restauración del respaldo ni suites completas de la aplicación. No se modificó esquema, historial, catálogo ni configuración de servicios. No hubo commit ni push.
