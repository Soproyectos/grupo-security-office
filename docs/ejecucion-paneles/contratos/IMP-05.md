# IMP-05 — Aplicar precios de una revisión exacta (paso: contrato)

**Fecha:** 2026-10-17 · **Copia de trabajo:** `/home/soporte/office_ai/gs-tanda-01` · **Alcance:** solo documentación. Escribe únicamente `docs/ejecucion-paneles/contratos/IMP-05.md`; sin código, sin migraciones, sin commits, **sin tocar `estado.json`/`tareas.json`**, servicios de S3 ni `opencode.json`.

**Modalidad — tanda continua (PROP):** propuesta para la auditoría final; **no es decisión de negocio aprobada**. Verificación solo en BDs desechables (`gs-tanda-db:54331`); **producción (Neon) no se toca**; incidente de helpers contenido, pendiente de auditoría.

## 1. Meta, dependencias, reglas y casos (ficha textual)

- **Meta:** «Concretar transacción, concurrencia, idempotencia y permiso separado de aplicar. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn:** `IMP-04` (implementado) y `CAT-01` (implementado — vínculo producto↔lista).
- **Reglas:** 1) «Revalidar actor/sesión, alcance, pertenencia única, tarifa, versiones y precios anteriores al ejecutar.» 2) «No confiar en filas/precios del navegador ni llamar al ejecutor legacy de productos.» 3) «Decidir atomicidad y límites en contrato. Precio+historial/evento confirmados coherentemente; solo precios, sin cambios de identidad.»
- **Casos:** 1) «Revocar entre revisar/aplicar bloquea; cambio de precio produce conflicto.» 2) «Dos revisiones simultáneas no pisan cambios; dos listas no toman el mismo producto.» 3) «Reintento no duplica operación/eventos; fallo intermedio revierte; histórico comercial intacto.»
- **Incrementos:** `contrato`, `backend-transaccion`, `backend-reintentos`, `backend-api`.

## 2. Estado actual (OBS)

| Pieza | Estado | Evidencia |
|---|---|---|
| Revisión guardada | `PriceImportRevision` (+filas/precios con `previousValue`/`roundedValue`), status `GUARDADA` | IMP-04 (schema/migración/servicio) |
| Preview | Aísla el alcance a productos de ESA lista: `product.findMany({ where: { listaId, sku } })` y filtra `p.listaId === listaId` | `price-import.service.ts:143-153` |
| Precio | `Price @@unique([productId, priceListId])`, `value Decimal(12,2)`, `listaId?` | `schema.prisma` model `Price` |
| Escritura de precios | `prices.service.ts` `createPrice`/`updatePrice` con `normalizeCopInput` (IMP-03) y auditoría | IMP-03 |
| Histórico | `QuoteItem.unitPrice`+`priceCapturedAt`; el «anterior» de la revisión vive en `price_import_revision_prices.previousValue` | IMP-03/IMP-04 |
| Ejecutor legacy productos | `batch-executor` puede crear marcas/categorías/identidad — **NO se usa** | diseño §129 |
| Acciones | `prices:read`, `prices:preview`, `prices:save`. **No hay** `prices:apply` | `access-catalog.ts` |

**Hueco:** no existe forma de **aplicar** una revisión guardada: no hay transacción, ni detección de conflicto entre revisar y aplicar, ni permiso separado de aplicar, ni reintento idempotente.

## 3. Aplicar: transacción, concurrencia y límites (PROP)

### 3.1 Escritura exclusivamente de precios (regla 2 y 3)
- El ejecutor escribe **solo** `Price` (upsert por `(productId, priceListId)`) y el estado/resultado de la revisión. **Nunca** toca `Product` (identidad, nombre, marca, categoría, `listaId`), `Lista` ni el ejecutor legacy.
- El servidor **recalcula/valida desde la revisión persistida** (filas/precios en BD), **no** acepta filas ni precios del navegador. La única entrada es `revisionId`.

### 3.2 Atomicidad (regla 3)
- **Todo o nada** en una única `prisma.$transaction` con `isolationLevel: 'Serializable'`: todas las altas/actualizaciones de `Price` + el paso de la revisión a `APLICADA` (`appliedAt`, `appliedById`, `appliedResult`). Si cualquier fila produce conflicto o error, se **revierte** por completo (caso 3: «fallo intermedio revierte»).
- El archivo original y las filas ya están guardados por IMP-04; aplicar **no** los reescribe.

### 3.3 Concurrencia y conflicto (caso 1 y 2)
- **Versión esperada = `previousValue`** capturado al guardar (IMP-04). Al aplicar, por cada precio válido:
  - `price` actual (por `(productId, priceListId)`) debe **coincidir** en `value` (comparación decimal exacta, texto) con `previousValue`; si no → **409** (`PRICE_CHANGED`) con la lista de conflictos.
  - `previousValue === null` y ya existe `Price` → **409** (`PRICE_CREATED_ELSEWHERE`); `previousValue !== null` y no existe → **409** (`PRICE_REMOVED`).
- **Pertenencia única** (CAT-01/§160): cada SKU debe seguir con `Product.listaId === revision.listaId`; si cambió o se desvinculó → **409** (`MEMBERSHIP_CHANGED`). Aplicar **no** crea ni cambia pertenencia (no toma productos de otra lista).
- **Revocación** (caso 1): las acciones se **revalidan por solicitud** (`resolveAccess`+`grantsForUser`); sin `prices:apply` vigente → **403** aunque la revisión siga `GUARDADA`.
- Concurrencia entre dos aplicaciones: la `Serializable` + `previousValue` garantizan que solo la primera confirma; la segunda ve el valor ya cambiado → 409 (no pisa).

### 3.4 Filas correctas y exclusiones (límite, §112)
- Solo se aplican filas `status='valid'`. Si la revisión tiene **filas en error**, aplicar exige **exclusión expresa**; en este incremento, sin `excludeRows`, responde **409** (`REVISION_HAS_ERRORS`) con las filas pendientes y **no** aplica nada (jamás «todo actualizado» si quedaron filas). Decisión N4.

### 3.5 Idempotencia y reintentos (caso 3)
- Si `revision.status === 'APLICADA'`, `POST /:id/apply` **no** vuelve a escribir: devuelve el `appliedResult` guardado (**201**, código por defecto de POST en Nest; `alreadyApplied:true`), idempotente. Un reintento por timeout/red no duplica precios, historial ni eventos.
- Si `status === 'DESCARTADA'` → **409** (`REVISION_DISCARDED`).
- El evento de éxito se emite **una vez**, dentro/fuera de la transacción de forma que un reintento no lo duplique (se emite tras confirmar; si ya estaba `APLICADA`, no re-emite).

## 4. Esquema, rutas, acciones y alcance (PROP)

### 4.1 Esquema (nueva migración `add_price_import_revision_apply`)
En `PriceImportRevision`: `appliedAt DateTime?`, `appliedById String?` (FK `User?`, `onDelete: SetNull`), `appliedResult Json?` (resumen: filas aplicadas, tarifas, conflictos descartados). Índice `@@index([status])`. Sin tablas nuevas de precios (el «anterior» ya está en las filas de la revisión).

### 4.2 Rutas y acciones

| Método/ruta | Acción (catálogo) | Alcance | Efecto |
|---|---|---|---|
| `POST /api/prices/import/revisions/:id/apply` | **`prices:apply`** (nueva; dependencia `prices:read`, SEPARADA de `prices:save`) | LISTA_SCOPES `['list','global']` | Aplica la revisión en transacción; devuelve `appliedResult`. |
| `GET /api/prices/import/revisions/:id` | `prices:read` (reuso) | LISTA_SCOPES | (IMP-04) incluye `appliedAt`/`appliedResult` tras aplicar. |

- **Acción nueva** `prices:apply` («Aplicar precios de una revisión confirmada») con dependencia `prices:read` — **no** depende de `prices:save` (diseño §35: quien aprueba y no prepara puede terminar el trabajo que otro dejó listo). Se registra en `access-catalog.ts` + spec. Permiso **separado** de preparar.
- Revalidación por solicitud + `assertListaAccess(revision.listaId, ctx, 'view_prices')`.

## 5. Errores (PROP)

`400` (id inválido); `403` (sin `prices:apply`/`prices:save`, sin alcance/lista ajena); `404` (revisión inexistente o de lista ajena, sin distinguir); `409` (`REVISION_HAS_ERRORS`, `REVISION_DISCARDED`, `PRICE_CHANGED`, `PRICE_CREATED_ELSEWHERE`, `PRICE_REMOVED`, `MEMBERSHIP_CHANGED`, `ALREADY_APPLIED` sólo si se pide y difiere el resultado). El `409` incluye por fila: SKU, tarifa, valor esperado/actual y motivo.

## 6. Vínculo con IMP-04 (OBS)
IMP-05 **amplía** `modules/prices/import/**` (no reescribe preview/revisión) y `access-catalog.ts`. Reutiliza `normalizeCopPrice` (IMP-03) para no re-redondear mal: al aplicar se escribe el `roundedValue` ya normalizado, **validado de nuevo** contra la política COP.

## 7. Incrementos (fichas textuales)

| Paso | Objetivo (ficha) | WritePaths | Aceptación |
|---|---|---|---|
| `contrato` | Concretar transacción/concurrencia/idempotencia/permiso | `contratos/IMP-05.md` | Contrato consistente + incrementos registrados |
| `backend-transaccion` | Aplicar precios y eventos/historial con atomicidad y versión esperada | `modules/prices/import/**`, `prisma/schema.prisma`, `prisma/migrations/**`, `access-catalog.ts`(+spec) | Caso 1 (conflicto por cambio de precio) + caso 3 (fallo revierte) |
| `backend-reintentos` | Idempotencia y revalidación al reintentar | idem | Caso 3 (reintento no duplica) + caso 1 (revocación bloquea) |
| `backend-api` | Exponer confirmación/resultado por ID con permiso separado | idem | Caso 2 (dos listas no comparten producto) + 403/409 por API |

## 8. Decisiones pendientes y bloqueos

| # | Decisión | Estado | Propuesta (reversible) |
|---|---|---|---|
| N1 | Atomicidad total vs por fila | Pendiente | **Total** (transacción única `Serializable`) |
| N2 | Detección de conflicto (versión esperada) | Pendiente | **`previousValue` exacto** + comparación decimal como texto |
| N3 | Permiso de aplicar | Pendiente | **`prices:apply`** separado de `prices:save` |
| N4 | Filas en error / exclusiones | Pendiente | Sin exclusiones explícitas → **409** y no aplica (exclusión expresa = incremento futuro) |
| N5 | ¿Escribir `Product.listaId` al aplicar? | Pendiente | **No** (la pertenencia la fija CAT-01; aplicar solo precios) |
| — | Interfaz de aplicar (pantalla 3 pasos) | **Fuera de alcance** | Pasos de frontend posteriores (tareas.json) |
| D5/E6 | Guards/@Permissions y revalidación | Heredadas | Sin cambios |

## 9. Criterios de aceptación del paso `contrato`
1. ✅ Consistente con dependencias (IMP-04/CAT-01 implementados) y decisiones N1-N5 explícitas (§8).
2. ✅ Incrementos registrados con objetivo, writePaths y aceptación textuales (§7) antes de tocar código.
3. ✅ Reglas aterrizadas: revalidación al ejecutar (§3.3); no confiar en el navegador / no legacy (§3.1); atomicidad y límites (§3.2, §3.4); solo precios, sin identidad (§3.1); idempotencia (§3.5).
4. ⚠ Modalidad PROP; auditoría final y QA-01 del coordinador.

## 10. Evidencia reproducible
```bash
rg -n "findMany\\(\\{ where: \\{ listaId, sku" src/backend/src/modules/prices/import/price-import.service.ts
rg -n "@@unique\\(\\[productId, priceListId\\]\\)" src/backend/prisma/schema.prisma
rg -n "prices:save|prices:apply|prices:preview" src/backend/src/common/security/access-catalog.ts
```
