# Importación de precios con listas mixtas

Estado: backend implementado en la rama `feat/price-import-rules-2` (2026-10-20). La pantalla de 3 pasos y el panel de compras llegan en un bloque posterior. Decisiones de producto: `odd/tasks/price-import-rules.md` y la enmienda de `docs/adr/ADR-20261014-producto-una-sola-lista.md`.

## Cruce por SKU, sin lista destino (R1)

- El archivo se cruza solo por SKU. La petición ya no necesita `listaId`; si llega, se ignora (el campo es opcional y está marcado como obsoleto).
- La coincidencia usa la misma regla que el índice único normalizado de productos: se ignoran mayúsculas y espacios internos. Se usa `findProductMatchesBySkus` (variante de `findProductsBySkus` que devuelve todos los candidatos para no adivinar).
- Un producto conserva su única lista y la importación nunca lo mueve. Un producto sin lista se actualiza y se marca `SIN_LISTA` (no se vincula automáticamente).

## Resultado por fila

| Situación | Código de incidencia | Fila |
| --- | --- | --- |
| SKU inexistente | `UNKNOWN_REFERENCE` (`resolution: PENDING_PRODUCT`, `listaState: UNKNOWN`) | rechazada, no bloquea el resto |
| Varios productos con el mismo SKU normalizado | `AMBIGUOUS_REFERENCE` | rechazada |
| Producto de una lista sin permiso para la persona | `LISTA_FORBIDDEN` | rechazada; mensaje genérico |
| Lista inactiva, archivada, en eliminación o no COP | `LISTA_UNAVAILABLE` | rechazada |
| Restricción explícita sobre el producto | `REFERENCE_UNAVAILABLE` | rechazada |

`LISTA_FORBIDDEN` no revela nombre ni id de la lista, ni precios, ni ofrece crear un borrador. Esas filas solo se cuentan en `summary.rowsInInaccessibleListas`. El resumen añade `byLista` (solo listas que la persona puede ver), `unlistedRows`, `unknownRows` y `rejectedRows`.

## Autorización por lista

- Vista previa y guardado: `prices:preview`, `prices:save` y `prices:read` como puerta general; después, `prices:read` sobre la lista de cada producto (decisión `decideCatalogResourceAccessFromGrants`, igual que `AclService`). Un producto sin lista solo se cubre con una concesión de alcance global.
- La autorización de aplicar (`prices:apply` por lista) se documenta en la sección de aplicación.

## Alerta de cambio grande (R3)

- Para cada precio con valor anterior se calcula `|nuevo - anterior| / anterior * 100` con aritmética decimal. Se marca (`largeChange`) solo si supera el umbral de forma estricta, tanto al subir como al bajar: 30,00 % no se marca y 30,01 % sí.
- Si el valor anterior es cero no hay porcentaje y el precio siempre se marca. Los precios nuevos y los iguales no se marcan.
- El porcentaje (`changePercent`) es con signo, con 2 decimales (HALF_UP) y en texto. La comparación usa el valor exacto, por lo que 30,004 % se muestra como 30,00 y se marca. Al guardar, un porcentaje extremo se acota a 9999999,99 (columna DECIMAL(9,2)).
- El umbral por defecto es 30 y puede cambiarse con `PRICE_IMPORT_LARGE_CHANGE_PCT` (1 a 1000). El resumen incluye `largeChangePrices` y `largeChangeThresholdPct`.
- Una fila con cambio grande no se bloquea: la confirmación se pide al aplicar.
- Siguen rechazándose los precios en cero, negativos, no numéricos o fuera de rango; una celda vacía conserva el precio actual; los precios se redondean a pesos enteros HALF_UP. La plantilla v3 mantiene el orden `REFERENCIA, INSTALADOR_IVA, TIENDA_IVA, ORO_IVA, DPP_PLATINO_IVA, CLIENTE_FINAL_IVA`.

## Revisiones guardadas

- Las revisiones nuevas guardan `listaId = null`; la verdad es la instantánea por fila (`productId`, `listaId`, `resolution`).
- Idempotencia: misma clave de idempotencia, mismo archivo y misma persona devuelven la revisión existente; otra persona con la misma clave recibe 409 y nunca la cabecera ajena.
- `GET /api/prices/import/revisions?listaId=` lista las revisiones con filas en esa lista, más las heredadas por `revision.listaId`.
- `GET /api/prices/import/revisions/:id` devuelve solo las filas de listas con `prices:read`; del resto devuelve únicamente la cuenta (`rowsInInaccessibleListas`). Los nombres de listas sin permiso se quitan también del resumen y del resultado de aplicación. Las revisiones heredadas (una lista, sin instantánea por fila) siguen siendo legibles.
- El archivo original y el descarte de una revisión mixta exigen ser quien la subió o tener `prices:read` sobre todas sus listas.

## Respuestas de error

El filtro global de excepciones reenvía ahora, además de `message` y `feedback`, el `code` (texto) y `details` (objeto) cuando la excepción los trae. Es aditivo y lo usan las respuestas 409 de aplicar.
