# IMP-04 — Guardar una revisión de precios recuperable (paso: contrato)

**Fecha:** 2026-10-17 · **Copia de trabajo:** `/home/soporte/office_ai/gs-tanda-01` · **Alcance:** solo documentación. Escribe únicamente `docs/ejecucion-paneles/contratos/IMP-04.md`; sin código, sin migraciones, sin commits, **sin tocar `estado.json`/`tareas.json`**, servicios de S3 (3000/5173/5432) ni `opencode.json`.

**Modalidad — tanda continua (PROP):** propuesta para la auditoría final del coordinador; **no es decisión de negocio aprobada**. El incidente de helpers (`resultados/TANDA-01-incidente-helper-db.md`) está **contenido, pendiente de auditoría**; toda verificación de este paquete correrá **exclusivamente en las BDs desechables** (`gs-tanda-db:54331`) con URL inline + guard `testdb.cjs`. **Producción (Neon) no se toca.**

## 1. Meta, dependencias, reglas y casos (ficha textual)

- **Meta (ficha):** «Concretar modelo de revisión, archivo, filas y versiones de precios. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `IMP-03` (implementado_sin_auditar — política COP única ya aplicada).
- **Reglas (textuales):**
  1. «Contrato de retención/tamaño/esquema y recuperación auditado antes de migraciones.»
  2. «Revisión guarda autor, hash, lista, tarifas, versiones, recibido/normalizado/anterior y pendientes.»
  3. «Persistir no modifica `Price` ni identidad; separar este historial del evento resumido del preview.»
- **Casos (textuales):**
  1. «Cerrar pestaña/reiniciar no pierde revisión.»
  2. «Otro usuario sin alcance no consulta archivo ni filas.»
  3. «Guardar dos veces con la misma clave no duplica revisión; fallar no deja datos comerciales parciales.»
- **Incrementos (ficha):** `contrato`, `backend-esquema`, `backend-revisiones`, `backend-recuperacion`.

## 2. Estado actual (OBS — copia de revisión)

| Pieza | Estado | Evidencia |
|---|---|---|
| Preview | `POST /api/prices/import/preview` devuelve `PriceImportPreview` con `readOnly:true`; **no persiste nada** y no tiene id | `price-import.service.ts:65-162`, `price-import.types.ts:32-51` |
| Evento del preview | Un único `audit.log` resumido: `action:'price-import-preview'`, `newValues:{fileHash,summary,tariffs,rounding}` — **sin filas** | `price-import.service.ts:158-160` |
| Límites de entrada | `MAX_XLSX_BYTES = 5 MB`; contenedor 128 partes; `MAX_PRICE_IMPORT_ROWS = 5000`; extensión `.xlsx` | `xlsx-container.ts:4,7,201`, `price-import.types.ts:5`, `price-import.service.ts:74` |
| Acciones de catálogo | `prices:read`, `prices:preview` (LISTA_SCOPES `['list','global']`). **No hay** acción de guardar/consultar/aplicar revisión | `access-catalog.ts:131-132` |
| Modelo de revisión de precios | **No existe.** Solo hay `ProductRevision` (catálogo) e `ImportSession` (wizard Biblioteca, por `userId`) | `schema.prisma:303,711` |
| Precedente de persistencia/reanudación | `ImportSession` reemplazó un `Map` en memoria para sobrevivir reinicio/routing multi-proceso — **patrón a reutilizar conceptualmente** | `schema.prisma:705-717` |
| Política COP | `common/money/cop-policy.ts` (IMP-03): entero HALF_UP, límite `9999999999`, `CopPriceError` | implantado en IMP-03 |
| Precios/histórico | `Price` `Decimal(12,2)`; `QuoteItem.unitPrice`+`priceCapturedAt` capturan histórico | `schema.prisma` |

**Hueco:** la revisión comercial que ve el usuario vive **solo en la respuesta HTTP**. Cerrar la pestaña, reiniciar la API o enrutar a otro proceso la pierde. No hay clave de idempotencia, ni retrieved/filas autorizadas, ni separación entre el evento resumido del preview y el historial de la revisión.

## 3. Modelo de revisión (PROP)

### 3.1 Esquema propuesto (3 tablas + enum), en `prisma/schema.prisma` → migración `add_price_import_revisions`

**`enum PriceImportRevisionStatus`:** `GUARDADA` (persistida, pendiente de aplicar), `APLICADA` (IMP-05 la consumió), `DESCARTADA` (retirada por su autor/alcance).

**`PriceImportRevision`** (cabecera):
- `id String @id @default(uuid())`
- `listaId String` (FK `Lista`, `onDelete: Cascade`) — la revisión pertenece a UNA lista; nunca crea ni mueve productos.
- `createdById String?` (FK `User`, `onDelete: SetNull`) — **autor**.
- `fileName String`, `fileHash String` (sha256 hex), `fileSize Int`, `storagePath String?` — archivo.
- `idempotencyKey String` — clave de idempotencia (caso 3).
- `status PriceImportRevisionStatus @default(GUARDADA)`
- `currency String @default("COP")`, `taxIncluded Boolean @default(true)`, `rounding String @default("HALF_UP")`, `policyVersion String` — política COP versionada (IMP-03).
- `tariffs Json` — tarifas autorizadas + resolución: `[{code, priceListId, validFrom, validUntil}]` (**versiones** de tarifa capturadas al guardar).
- `summary Json` — conteos del preview (rows/valid/error/prices/new/changed/unchanged/rounded).
- `trailerVersion Int` — versión de la plantilla reconocida (p. ej. `v3`) y `parserVersion String` (versión del lector, para recuperación fiel).
- `createdAt`, `updatedAt`.
- **Únicos:** `@@unique([idempotencyKey])` (clave global) y `@@index([listaId, status])`, `@@index([createdById])`. Mapa `price_import_revisions`.

**`PriceImportRevisionRow`** (filas del archivo):
- `id`, `revisionId` (FK Cascade), `rowNumber Int`, `sku String`, `status String` (`valid|error`), `issues Json`.
- `@@unique([revisionId, rowNumber])`, `@@index([revisionId, status])`. Mapa `price_import_revision_rows`.

**`PriceImportRevisionPrice`** (valor por fila×tarifa — **recibido/normalizado/anterior**):
- `id`, `revisionId` (FK Cascade), `rowNumber Int`, `sku String`, `tariffCode String`, `priceListId String`.
- `receivedValue String`, `roundedValue String`, `previousValue String?`, `difference String?`, `wasRounded Boolean`, `change String` (`new|changed|unchanged`).
- `@@unique([revisionId, rowNumber, tariffCode])`, `@@index([revisionId])`. Mapa `price_import_revision_prices`.

> **Por qué 3 tablas:** el caso 2 exige consultar «archivo **ni** filas» con paginación y alcance; una tabla de filas/precios permite filtrar por problema y auditar por fila sin cargar el JSON completo. Los importes se guardan como **texto** (cadena decimal exacta de IMP-03), nunca `float`.

### 3.2 Archivo original y retención (regla 1)

- **Se conserva el archivo original** (hash + bytes) para recuperación fiel y re-descarga autorizada.
- **Ubicación privada**: `PRICE_IMPORT_STORAGE_DIR` (env), por defecto `<uploads>/price-import-private/` — **fuera** del prefijo estático público `UPLOADS_URL_PREFIX` (`/uploads`), de modo que **no se sirve por HTTP estático**. Nombre en disco = `fileHash` (contenido direccionable; guardar dos veces no reescribe).
- **Tamaño**: ≤ `MAX_XLSX_BYTES` (5 MB) ya validado antes de persistir; el archivo **no** va en columnas del producto ni en la respuesta pública.
- **Retención (PROP, decisión pendiente N2)**: 90 días o hasta marcar `APLICADA`/`DESCARTADA` + N días; borrado del archivo físico con la fila del historial (o antes). **No** se define purga automática en este paso sin aprobación; se documenta y se deja configurable.
- **Recuperación**: al consultar, si el archivo físico falta pero las filas existen, la revisión se devuelve con `fileAvailable:false` (honesto, sin 500) y las filas/hash siguen disponibles.

### 3.3 Versiones (regla 2)

- `policyVersion` (IMP-03), `parserVersion` y `trailerVersion` (plantilla) permiten reproducir la interpretación exacta.
- `tariffs` captura, por tarifa, `priceListId` + vigencia observada (**versiones de tarifas**).
- `previousValue` de cada precio es el valor vigente al guardar (**anterior**); no se recalcula al consultar (fotografía, no proyección).

## 4. Rutas, acciones y alcance (PROP)

| Método/ruta | Acción (catálogo) | Alcance | Efecto |
|---|---|---|---|
| `POST /api/prices/import/revisions` | **`prices:save`** (nueva; prereq `prices:preview`) | LISTA_SCOPES `['list','global']` | Persiste la revisión (archivo+filas+precios) en UNA transacción; devuelve `id`. Requiere `listaId` + `idempotencyKey` + archivo; **recalcula** el preview en servidor (no confía en el navegador). |
| `GET /api/prices/import/revisions?listaId=&page=&pageSize=` | **`prices:read`** (reuso) | LISTA_SCOPES | Lista revisiones autorizadas de la lista (paginado). |
| `GET /api/prices/import/revisions/:id?page=&pageSize=` | **`prices:read`** | LISTA_SCOPES | Detalle: cabecera + resumen + filas/precios autorizados de la lista de la revisión. `404` si la lista no es del alcance. |
| `GET /api/prices/import/revisions/:id/file` | **`prices:read`** | LISTA_SCOPES | Descarga del archivo original (binario). `404` si no hay archivo. |
| `DELETE /api/prices/import/revisions/:id` | **`prices:save`** | LISTA_SCOPES | Marca `DESCARTADA` (no borra histórico comercial; opcionalmente purga archivo). |

- **Acciones nuevas**: `prices:save` («Guardar una revisión de precios preparada; no aplica cambios») con prerequisito `prices:preview`. **`prices:apply` NO se crea aquí** — es el permiso separado de IMP-05 (regla de ficha IMP-05). Se registran en `access-catalog.ts` + su spec.
- **Alcance**: se revalida por solicitud con `resolveAccess`+`grantsForUser` (patrón IMP-01/03, transición D5) **y** `assertListaAccess(listaId, ctx, 'view_prices')`; sin concesión no se devuelve ni archivo ni filas (caso 2).
- **Regla 3 (separación)**: el `audit.log` resumido del preview (`price-import-preview`) **se conserva**; el historial de la revisión es **otra cosa** (tablas). Guardar emite un evento propio `price-import-revision-save` (sin volcar filas al log).

## 5. Errores (PROP)

`400` (falta `listaId`/`idempotencyKey`/archivo, `.xlsx` inválido, lista no activa/no COP, archivo > 5 MB); `403` (sin `prices:save`/`prices:preview`, o sin alcance/lista ajena); `404` (revisión inexistente o de lista ajena — **no** se distingue «existe pero ajena»); `409` (conflicto de idempotencia con contenido distinto). Los errores del preview siguen devolviéndose como `issues` (no 400) y **no** impiden guardar si el usuario decide conservar la revisión con problemas (decisión N3).

## 6. Idempotencia, transacción y recuperación (casos 1 y 3)

- **Idempotencia (caso 3)**: `idempotencyKey` única. Misma clave + mismo `fileHash`/`listaId` ⇒ devuelve la revisión existente (`200`, sin duplicar). Misma clave + contenido distinto ⇒ `409`. El **recalculo en servidor** garantiza que la fila guardada corresponde al archivo, no a lo que mandó el navegador.
- **Transacción**: cabecera + filas + precios + archivo se escriben coherentes; si falla la escritura del archivo o de las filas, **no** queda cabecera parcial (rollback; el archivo físico huérfano se borra best-effort). **Persistir NO toca `Price`, `Product`, `Lista` ni identidad** (regla 3).
- **Recuperación (caso 1)**: tras reinicio de la API, `GET /revisions/:id` rearma cabecera+filas+precios desde BD (no desde memoria). Prep de prueba: guardar → matar API por PID verificado → reiniciar → `GET` devuelve la revisión íntegra.

## 7. Incrementos (fichas textuales)

| Paso | Objetivo (ficha) | WritePaths (ficha) | Aceptación |
|---|---|---|---|
| `contrato` | Concretar modelo/archivo/filas/versiones y rutas/acciones… | `contratos/IMP-04.md` | Contrato consistente + incrementos registrados |
| `backend-esquema` | Crear esquema/migración en base desechable | `prisma/schema.prisma`, `prisma/migrations/**`, `modules/prices/import/**`, `common/security/access-catalog.ts`(+spec) | Migración aplica en BD desechable; backfill 0 filas; `down` recuperable; `prisma generate` OK |
| `backend-revisiones` | Guardar revisión (archivo/hash, autor, valores, versiones) | idem | Caso 3 (idempotencia) + caso 1 (persistencia) |
| `backend-recuperacion` | Consultar revisiones/filas autorizadas y recuperar tras reinicio | idem | Caso 1 (reinicio) + caso 2 (alcance denegado) |

**Solape:** `modules/prices/import/**` se **amplía** (no se reescribe el preview); `access-catalog.ts` se amplía con `prices:save`. `prisma/migrations/**` es nuevo en el paquete (solo estructura, 0 datos comerciales).

## 8. Decisiones pendientes y bloqueos

| # | Decisión | Estado | Propuesta (reversible) |
|---|---|---|---|
| N1 | ¿Guardar el archivo original o solo filas+hash? | Pendiente | **Guardar** (privado, direccionable por hash), porque la regla 2 lo exige y permite re-descarga autorizada |
| N2 | Retención/purga del archivo | Pendiente | 90 días configurable, sin purga automática sin aprobación |
| N3 | ¿Guardar revisiones con filas en error? | Pendiente | Sí (el usuario puede conservar para corregir); el estado de la fila queda registrado |
| N4 | ¿`prices:save` separado o reuso `listas:import`? | Pendiente | **`prices:save`** (permiso propio; IMP-05 añadirá `prices:apply` separado) |
| N5 | Almacenamiento multi-instancia (Hostinger) | Pendiente | Disco local por env; si hay multi-nodo, migrar a almacenamiento compartido (contrato propio) |
| — | Aplicar precios (transacción/idempotencia/permiso) | **Fuera de alcance** | IMP-05 |
| D5/E6 | Guards/@Permissions y revalidación por petición | Heredadas | Sin cambios |
| Incidente helpers | CONTENIDO pendiente de auditoría | registrado | Solo entorno desechable |

## 9. Criterios de aceptación del paso `contrato`

1. ✅ Consistente con dependencias (`IMP-03` implementado) y decisiones pendientes explícitas (§8).
2. ✅ Incrementos `backend-esquema`/`backend-revisiones`/`backend-recuperacion` registrados con objetivo, writePaths y aceptación textuales antes de tocar código (§7).
3. ✅ Reglas aterrizadas: retención/tamaño/esquema/recuperación (§3.2, §6); autor/hash/lista/tarifas/versiones/recibido-normalizado-anterior/pendientes (§3); persistir no toca `Price`/identidad y separa del evento del preview (§4, §6).
4. ⚠ Modalidad PROP; auditoría final y QA-01 del coordinador.

## 10. Evidencia reproducible

```bash
rg -n "readOnly|price-import-preview" src/backend/src/modules/prices/import/price-import.service.ts
rg -n "MAX_XLSX_BYTES|MAX_PRICE_IMPORT_ROWS" src/backend/src/modules/prices/import/*.ts
rg -n "model ImportSession|model ProductRevision" src/backend/prisma/schema.prisma
rg -n "prices:read|prices:preview" src/backend/src/common/security/access-catalog.ts
```
