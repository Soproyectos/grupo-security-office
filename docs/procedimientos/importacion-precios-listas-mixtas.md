# Importación de precios con listas mixtas

Estado: backend implementado en las ramas `feat/price-import-rules-2` (cruce, alerta, aplicación) y `feat/price-import-rules-3` (referencias desconocidas e historial de cambios) (2026-10-20). La pantalla de 3 pasos y el panel de compras llegan en un bloque posterior. Decisiones de producto: `odd/tasks/price-import-rules.md` y la enmienda de `docs/adr/ADR-20261014-producto-una-sola-lista.md`.

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
- Aplicar: ver la sección siguiente (`prices:apply` sobre cada lista que se va a escribir).

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

## Aplicar una revisión (`POST /api/prices/import/revisions/:id/apply`)

Cuerpo opcional: `{ acknowledgeRejectedRows?: number, confirmLargeChanges?: boolean }`. Todo ocurre en una sola transacción `Serializable`; si algo falla no queda nada escrito, ni siquiera el cambio de estado de la revisión.

1. Se reclama la revisión (`GUARDADA` a `APLICADA`). Si otra aplicación ya lo hizo, se devuelve el resultado guardado con `alreadyApplied: true`; un fallo de serialización (P2034) se reintenta hasta 3 veces y, si persiste, responde 409 `APPLY_SERIALIZATION_CONFLICT` (reintentable).
2. Permisos: `prices:apply` sobre cada lista de las filas que se van a escribir; para productos sin lista, `prices:apply` y `products:write` con alcance global. Si se perdió algún permiso desde la vista previa: 409 `REVISION_CONFLICT` con `details.reason = LISTA_ACCESS_CHANGED` para toda la aplicación (no se nombra la lista).
3. Solo se aplican las filas válidas con cambios. Las filas rechazadas (`UNKNOWN_REFERENCE`, `LISTA_FORBIDDEN`, etc.) no bloquean, pero si existen hay que enviar `acknowledgeRejectedRows` igual al número actual; si falta o no coincide: 409 `REJECTED_ROWS_UNACKNOWLEDGED` con `details.count` y una lista compacta (`rowNumber`, `sku`, `code`, máximo 50). Las filas de listas que la persona no puede ver no se enumeran (solo `hiddenRows`).
4. Sin filas válidas con cambios: 409 `NOTHING_TO_APPLY`.
5. Con cambios grandes y sin `confirmLargeChanges: true`: 409 `LARGE_CHANGES_UNCONFIRMED` con `details.changes` (`sku`, `tariffCode`, `previous`, `new`, `percent`). La confirmación queda en `appliedResult.largeChangesConfirmed`.
6. Se bloquean los productos (`SELECT ... FOR UPDATE`, igual que la importación de productos) para serializar contra `PUT /api/products/:id` con cambio de lista. Si la lista actual del producto difiere de la de la revisión: `MEMBERSHIP_CHANGED`.
7. Se revalidan los precios anteriores: `PRICE_CHANGED`, `PRICE_REMOVED`, `PRICE_CREATED_ELSEWHERE` (409 `REVISION_CONFLICT`, `details.conflicts`).
8. Se escribe solo `Price`, con `Price.listaId` igual a la lista actual del producto (puede ser nula). Los precios iguales (`unchanged`) no se escriben ni dejan historial.
9. Dentro de la misma transacción se crea un `ProductChange` por precio cambiado (`field = price:<TARIFA>`, valor anterior y nuevo, origen `PRICE_IMPORT`, `sourceRef` = id de la revisión, un `batchId` por aplicación) y la entrada de auditoría `price-import-apply` (`AuditService.logTx`).

`appliedResult` conserva su forma anterior y añade `unchangedPrices`, `rejectedRows`, `largeChangesConfirmed`, `perLista` y `batchId`. Los nombres de listas sin permiso de lectura se quitan al leerlo.

Límites conocidos:

- El controlador conserva `@Roles('Super Admin', 'Supervisor', 'Admin Comercial')` a nivel de clase: quien solo tiene el paquete de compras sin uno de esos roles no llega a estos endpoints. No se cambia en este bloque.
- La aplicación escribe precio por precio dentro de la transacción (hasta 5.000 filas por 5 tarifas). El tiempo máximo de la transacción es de 120 s.
- El archivo guardado se identifica por su hash; descartar una revisión borra ese archivo aunque otra revisión use el mismo contenido.

## Referencias desconocidas: crear borrador u omitir (R2)

Se resuelven DESPUÉS de aplicar la revisión (estado `APLICADA`). Un SKU desconocido nunca crea un producto durante la vista previa, el guardado ni la aplicación.

`GET /api/prices/import/revisions/:id/unknown-references?page=&pageSize=`

- Devuelve las filas `PENDING_PRODUCT` con código `UNKNOWN_REFERENCE`: `rowNumber`, `sku`, precios recibidos por tarifa (`received`, `value` ya redondeado) y `canCreate`. Nunca devuelve filas `LISTA_FORBIDDEN`.
- `defaults.brandId` y `defaults.categoryId` sugieren "Sin marca" y "Sin categoría" (se buscan por nombre; no se crean aquí).
- Exige `prices:read` y `listas:read`, y haber creado la revisión o tener `prices:read` sobre todas sus listas (misma regla que el archivo original).
- `canCreate` es verdadero solo si la revisión está `APLICADA` y la persona tiene `products:write` Y `prices:apply` con alcance GLOBAL (incluida la cadena de dependencias de cada acción).

`POST /api/prices/import/revisions/:id/unknown-references/resolve`

```json
{ "items": [
  { "rowNumber": 3, "action": "CREATE", "name": "Cámara domo 4MP", "brandId": "<uuid>", "categoryId": "<uuid>" },
  { "rowNumber": 4, "action": "SKIP" }
] }
```

- Máximo 200 filas por solicitud, sin filas repetidas; `name` recortado de 1 a 255 caracteres; `brandId` y `categoryId` deben existir.
- `CREATE` exige `products:write` y `prices:apply` GLOBALES (403 para toda la solicitud si faltan). `SKIP` solo exige el acceso de lectura a la revisión. Revisión no aplicada: 409 `REVISION_NOT_APPLIED`.
- Una transacción POR fila; la respuesta es parcial: `{ revisionId, results: [{ rowNumber, status: CREATED | SKIPPED | FAILED, code?, message?, productId? }] }`. Un fallo no deshace las otras filas.
- Códigos de fallo: `SKU_EXISTS` (alguien creó ese SKU entre tanto; no se duplica y la fila sigue pendiente), `TARIFF_UNAVAILABLE`, `INVALID_PRICE`, `NO_PRICES`, `BRAND_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `ROW_NOT_PENDING`, `ROW_NOT_FOUND`.
- Idempotente: la fila se reclama con `updateMany where resolution = PENDING_PRODUCT`; repetir la solicitud (o dos solicitudes simultáneas) devuelve el resultado anterior y no crea nada más.

Qué crea `CREATE` (`ProductsService.createPendingSheetDraft`, dentro de la transacción de la fila):

- Producto sin lista (`listaId = null`, sin el respaldo LISTA-GENERAL), `lifecycleStatus = DRAFT`, `publishStatus = borrador`, `isActive = false`, `isVisible = false`, y `extraAttributes = { importStatus: "pending_enrichment", pendingReason: "created_from_price_import", sourceRevisionId }` SIN la clave `biblioteca`, por lo que `PUBLIC_CATALOG_VISIBILITY` lo excluye de la búsqueda y del detalle públicos.
- Los precios guardados de esa fila (se revalidan con la política COP y la tarifa debe seguir activa, vigente y en COP) como `Price` sin lista; no existe valor anterior, así que no hay conflicto `PRICE_CHANGED`.
- Historial `ProductChange` (origen `PRICE_IMPORT`, `sourceRef` = id de la revisión): `created`, `sku`, `name`, `brandId`, `categoryId` y `price:<TARIFA>`; y la auditoría `price-import-create-draft` con `productId`.
- La fila queda `PRODUCT_CREATED` con `productId`, `resolvedAt` y `resolvedById`; `SKIP` la deja `SKIPPED`. Los SKU omitidos no se recuerdan para la próxima importación.

El controlador de resolución solo usa `JwtAuthGuard` (sin `@Roles`): quien tenga las concesiones adecuadas llega aunque su rol no esté en la lista del controlador de importación; toda la decisión se toma en el servicio con las concesiones vigentes.

Apertura del borrador: `GET /api/products/:id` ahora decide los productos sin lista con la misma comprobación de concesiones que la ficha de vitrina (`AclService.assertProductAccess`): una concesión GLOBAL de `products:read` permite abrirlos; con solo concesiones por lista sigue respondiendo 404. La ficha de vitrina y los paquetes de biblioteca ya tomaban la decisión con `listId` indefinido para estos productos.

## Historial por producto (R4)

`GET /api/products/:id/changes` lista el historial. Desde este bloque se registra, dentro de la MISMA transacción que la mutación:

- Aplicación de la importación de precios y creación de borradores desde la importación (`PRICE_IMPORT`).
- Precios manuales: crear, editar y eliminar (`MANUAL`, campo `price:<TARIFA>`, `sourceRef` = id del precio) y los precios enviados al crear o editar un producto.
- Creación y edición de productos (`MANUAL`: `sku`, `name`, `description`, `categoryId`, `brandId`, `listaId`, y `lifecycleStatus` inicial).
- Transiciones de ciclo de vida, programación y cancelación de programación (`LIFECYCLE`: `lifecycleStatus`, `publishStatus`, `isActive`, `isVisible`, `publishAt`).
- Solo se guardan los campos que cambian; si no cambia nada no se escribe nada, y si la mutación falla no queda historial.

Siguen sin registrarse (y la API lo declara en `coverage.notRecorded`): imágenes, ficha de vitrina, importación de productos anterior, importación de Biblioteca, eliminación definitiva y desvinculación de lista. Tampoco se registran los cambios de `technicalSpecs`, `extraAttributes` ni `documents` al editar un producto.

## Respuestas de error

El filtro global de excepciones reenvía ahora, además de `message` y `feedback`, el `code` (texto) y `details` (objeto) cuando la excepción los trae. Es aditivo y lo usan las respuestas 409 de aplicar.
