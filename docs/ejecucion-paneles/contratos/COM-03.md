# COM-03 — Cotizaciones con acciones claras (paso: contrato)

**Fecha:** 2026-10-16 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/COM-03.md`; no modifica código, base de datos ni servicios activos (3000/5173/5432), no ejecuta commits y **no edita `estado.json`, `tareas.json`, `TANDA-01-avance.json` ni ningún otro archivo de `docs/ejecucion-paneles/`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md:14` («esas propuestas quedan disponibles para la auditoría final, no se presentan como decisiones empresariales aprobadas»), este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.**

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa (comandos en §10). |
| **IP** | Informe o diseño previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `COM-03 contrato`, textual):** «Concretar líneas, cantidades, estados y regla de descuentos. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `COM-01`. **OBS:** COM-01 **no está aceptado en `estado.json`** (`reviews` contiene solo `BASE-01/inventario`; `decisions: {}`). Su implementación `backend`/`frontend` vive **en la copia aislada** `/home/soporte/office_ai/gs-tanda-01` (archivos ` M`/`??` sin commit en su `git status`), por lo que la dependencia está **implementada_sin_auditar, no verificada**. Este contrato no verifica aceptaciones: ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (textuales):** (1) «Cambiar estado no introduce aprobación de venta ni emite factura ERP.» (2) «Separar autorización de descuentos ya contemplada en el diseño; editar cantidades no concede cambiar descuentos. Límites/condiciones se elaboran en COM-09.» (3) «Conservar descuentos y precios capturados; no recalcular históricos ni esperar nuevos porcentajes para adaptar estados/alcance.» (4) «Producto/lista/tarifa autorizado al agregar líneas.»
- **Referencia de la ficha:** `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md`, sección «líneas, cantidades, estados y regla de descuentos» (§Cotizaciones `:75-83`, acciones `:179`, `:189`, checklist `:211-212`, árbol `:35`, ERP `:87-91`, auditoría `:159`).
- **requiredDecisions (ficha, OBS `tareas.json`):** `[]` en los tres pasos (`contrato`, `backend`, `frontend`). **No obstante**, este contrato hereda el bloqueo externo de descuentos (B3, §8) y la decisión `api-yeminus` de COM-07: no condicionan la ficha, pero condicionan §3/§4.
- **Aceptación del paso `contrato` (textuales):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.»

## 2. Estado actual (OBS)

El directorio `src/backend/src/modules/commercial/quotes/` es **idéntico en S3 y en la copia** (`diff -rq` vacío); `QuoteDetailPage.tsx` también (332 líneas, `diff -q` vacío). Documentar S3 es documentar la copia. `prisma/schema.prisma` **sí difiere** (COM-01 añadió `AccessGrant`/etc. en la copia): las referencias de esquema citan **la copia**.

### 2.1 Estados, transiciones y quién las mueve

| Pieza | Ruta:línea | Hecho |
|---|---|---|
| Matriz de transiciones | `quotes.service.ts:26-33` | `borrador→[enviada,cancelada]`, `enviada→[negociacion,ganada,perdida,cancelada]`, `negociacion→[ganada,perdida,cancelada]`; `ganada/perdida/cancelada` terminales |
| Estado efectivo `vencida` | `quotes.service.ts:101-112` | calculado **al leer** (`validUntil` pasado + estado abierto); no está en la matriz y **no se puede transicionar desde él** (`:347-349`) |
| Quién mueve cada estado | `quotes.service.ts:40-46` (`QUOTE_STATUS_ROLES`) | `ganada`: **solo** Super Admin, Admin Comercial, Supervisor; el resto de transiciones incluye Vendedor. Verificado por test: «un Operador no puede cerrar como ganada» (`quotes.service.spec.ts:439`) |
| Endpoint de estado | `quotes.controller.ts:101-111` | `PATCH :id/status` con `@Roles(COMMERCIAL_WRITE_ROLES)`; **sin `@Permissions` en todo el módulo** (`rg -n '@Permissions\(' quotes/` → vacío, S3 y copia) |
| Alcance efectivo | `quotes.service.ts:83-94` (`scopeWhere`) | admins sin filtro; `isPersonalSeller` → solo `ownerId = self`; resto → jerarquía `getSubordinateIds(..., includeSelf)` |
| Ocultar ajeno | `quotes.service.ts:167-174` | cotización fuera de scope → **404** (no 403), comentario explícito «no revelar la existencia» |
| Validación | `quotes.service.ts:351-367` | transición inválida → **400**; rol no permitido → **403**; `perdida` exige `lostReason` → 400 |
| Auditoría | `quotes.service.ts:418-425` | `action: 'status_change'`, `oldValues.status`, `newValues.status` (sin PII) |
| Espejo de UI | `features/quotes/lib/quote-status.ts:13-21` | matriz idéntica al backend «solo se usa para decidir qué botones mostrar; el backend sigue siendo la autoridad» (`:4-6`) |
| Botones | `QuoteDetailPage.tsx:100-101` | `allowedTransitions(status)` y, en modo `personal`, se **oculta `ganada`** en el navegador |

### 2.2 Líneas y cantidades: endpoints y DTOs

| Ruta | Roles | DTO | Hecho |
|---|---|---|---|
| `POST :id/items` | WRITE_ROLES (`quotes.controller.ts:65-76`) | `AddQuoteItemDto` (`add-quote-item.dto.ts:4-18`: `productId`, `quantity ≥1`, `discountPct?`) | agrega línea con **snapshot** de precio vigente (`quotes.service.ts:275-292`); recalcula totales (`:294`) |
| `PATCH :id/items/:itemId` | WRITE_ROLES (`:78-88`) | `UpdateQuoteItemDto` (`update-quote-item.dto.ts:4-15`: `quantity?`, **`discountPct?`**) | «Cambiar cantidad/**descuento** de un ítem (recalcula totales)» (resumen Swagger `:80`) |
| `DELETE :id/items/:itemId` | WRITE_ROLES (`:90-99`) | — | recalcula totales (`quotes.service.ts:338`) |
| Estados editables | `quotes.service.ts:49` (`ITEM_EDITABLE_STATUSES`) | — | `borrador`, `enviada`, `negociacion`; fuera de ellos → **409** (`:436-447`) |

- **Cantidades:** `quantity` es entero ≥1 (DTO `:6-9`); en `updateItem` el valor no enviado se conserva (`quotes.service.ts:311`).
- **Sin `@Permissions` ni concesión por acción:** todo el módulo decide por `@Roles` + jerarquía (hueco D5 heredado de COM-01 §2.5; hoy `quotes:edit` del catálogo **no se consulta** en ninguna ruta).
- **UI:** la tabla edita cantidad y descuento como campos separados (`QuoteItemsTable.tsx:26-54`); `commitQuantity` envía **solo** `{ quantity }` (`:35`) y `commitDiscount` envía **solo** `{ discountPct }` (`:49`); ambos gateados únicamente por `editable` (estado), nunca por concesión (`:19`, `:97`, `:122`).

### 2.3 Descuentos: dónde se capturan y si se recalculan (regla 2 y 3)

| Pregunta | Respuesta (OBS) | Ruta:línea |
|---|---|---|
| ¿Se recalcula el `discountPct` de la línea al editar cantidad? | **No.** Si el DTO no trae `discountPct` se conserva el valor del ítem | `quotes.service.ts:312-314` |
| ¿Se puede cambiar el descuento hoy desde la misma operación? | **Sí**, sin acción ni concesión propia: el DTO general de ítem acepta `discountPct` y el servicio lo aplica | `update-quote-item.dto.ts:11-14`, `quotes.service.ts:313,320` |
| ¿Y al agregar la línea? | **Sí**, `AddQuoteItemDto.discountPct` (default 0) | `add-quote-item.dto.ts:14-17`, `quotes.service.ts:271-272` |
| ¿Qué sí se recalcula siempre? | `lineTotal` de la línea afectada y los montos denormalizados de la cotización (`subtotal`, `taxAmount`, `total`) con la fórmula `unitPrice*cantidad*(1-desc/100)` | `:321`, `computeLineTotal :449-457`, `recalculateTotals :467-481` |
| ¿Existe descuento **global**? | **Sí en el modelo**, `Quote.discount` (`schema.prisma` copia `:758`; S3 `:652`), **solo lectura**: ningún DTO/endpoint lo escribe; `recalculateTotals` lo resta de la base (`:475`) y la UI solo lo muestra (`QuoteDetailPage.tsx:253-254`) | esquema + `:475` |
| ¿Validación de rango? | `assertValidDiscountPct`: 0–100 o **400** (`quotes.service.ts:62-68`), invocado al agregar (`:272`) y editar (`:314`). Es **validación numérica, no límite comercial** (DISENO:81) | — |
| ¿Auditoría de descuento? | **No hay**: `addItem`/`updateItem` **no** llaman a `AuditService.log` (solo create `:208-219` y status `:418-425`); el diseño exige registrar «aplicación de descuentos cuando se delegue» (DISENO:159) | — |
| ¿`quotes:discount` en el catálogo? | **No existe**: `rg -n 'quotes:discount' access-catalog.ts` → vacío; hay `quotes:read/create/edit/status` (`access-catalog.ts:70-73`) | catálogo |

**Conclusión (reglas 2 y 3):** hoy «editar cantidades» y «cambiar descuentos» son la **misma** operación autorizada por `@Roles(WRITE_ROLES)`; la separación pedida por la ficha y por DISENO:81/189 **no existe**. Lo que la regla 3 protege (precios/descuentos capturados) ya se cumple parcialmente: el snapshot `unitPrice`/`priceCapturedAt` no cambia al editar cantidad (`:316-323` no toca esos campos; test `quotes.service.spec.ts:199`), y el `discountPct` se conserva si no se envía.

### 2.4 Producto, lista y tarifa al agregar líneas (regla 4)

- **Producto:** `acl.assertProductAccess(productId, ctx, 'view_prices')` (`quotes.service.ts:237`); producto/lista ausente → **404** (`acl.service.ts:284-286`), restricción explícita → **403** (`:300-302`), sin excepción → cae al acceso de la Lista dueña (`:319`).
- **Lista:** `acl.assertListaAccess(quote.listaId, ctx, 'view_prices')` dentro de `assertItemableQuote` (`quotes.service.ts:445`); nivel insuficiente → **403** (`acl.service.ts:217-218`), Lista inexistente/archivada → **404** (`:213-214`, `:225-227`).
- **Tarifa:** sin `priceListId` → **409** (`quotes.service.ts:239-243`); sin precio vigente en la tarifa → **409 citando el SKU** (`:257-265`; test spec `:137`).
- La lectura de una cotización ya creada **no** exige acceso vigente a la Lista (snapshot es dato de la cotización, `:147-153`); sí se exige para agregar/editar (`:445`).

### 2.5 Transición a `ganada`: pedido interno idempotente, sin factura

- `ganada` ejecuta en **una transacción** (`quotes.service.ts:376-416`): cambio de estado + conversión `LEAD→CLIENTE` (`:386-395`) + creación de `SalesOrder` 1:1 (`:398-413`).
- Idempotencia: `SalesOrder.quoteId` único en `schema.prisma:791`; colisión (dos `ganada` concurrentes) → `P2002` traducido a **409** «Ya existe un pedido para esta cotización» (`:558-566`; tests spec `:310,356`).
- **No emite factura:** `SalesOrder` solo guarda referencia manual `externalInvoiceNumber`/`externalInvoiceDate` (`schema.prisma:796-797`); la facturación real se cuenta solo con referencia no nula (`dashboard.service.ts:152,336,505`). Una cotización ganada **sin factura externa no suma facturación**.

## 3. Campos y rutas PROP (líneas, cantidades y descuento)

**Regla 2 aterrizada (patrón COM-02 §3: DTO general separado de la operación sensible):** el DTO de edición general de ítem **no** contiene `discountPct`.

| Bloque | Campos | Ruta/acción PROP |
|---|---|---|
| **Línea nueva** (dato) | `productId`, `quantity` | `POST /:id/items` con `quotes:edit` (alcance de la concesión). `assertProductAccess` + `assertListaAccess(view_prices)` + tarifa vigente se conservan (§2.4) |
| **Cantidad** (dato) | `quantity` (entero ≥1) | `PATCH /:id/items/:itemId` con `quotes:edit` — **400 si el payload incluye `discountPct`** (campo fuera del DTO), sin escritura parcial: ni la cantidad se aplica |
| **Descuento de línea** (operación sensible) | `discountPct` (0–100, decimales) | **Endpoint dedicado** `PATCH /:id/items/:itemId/discount` con **`quotes:discount`** (acción nueva, DISENO:189 «Descuentos de cotización: `quotes:discount`, además de edición de la cotización»). Rechazo **403** sin la acción y **400** fuera de rango, antes de escribir |
| **Quitar línea** | — | `DELETE /:id/items/:itemId` con `quotes:edit` (sin cambio) |
| **Descuento global** (`Quote.discount`) | `discount` (Decimal) | **Sin endpoint en COM-03** (hoy tampoco lo tiene, §2.3): decisión F4 §8. No se toca el esquema |
| **Auditoría** | acción `discount_change` con `oldValues/newValues: {discountPct}` por ítem | DISENO:159 exige registrar «aplicación de descuentos cuando se delegue»; selectiva y sin PII (patrón COM-02 §5.3) |

- **Frontend:** `QuoteItemsTable` deja de enviar `discountPct` por la vía de edición general; el control de descuento (`:119-137`) se muestra/oculta según `quotes:discount` concedida (concesión leída en servidor, **no** decidida en el navegador; DISENO:204 «Los botones reflejan ese resultado»). `AddQuoteItemModal` (`:43,90,178-183`) deja de ofrecer descuento en el alta: la línea se agrega y el descuento se aplica con la acción propia.
- **Sin cambios de esquema (OBS):** los writePaths `backend` de la ficha **no** incluyen `schema.prisma` ni `migrations/**`: `Quote`, `QuoteItem.quantity`, `QuoteItem.discountPct`, `Quote.discount` ya existen (§2.3). Acción nueva `quotes:discount` se añade **solo** a `access-catalog.ts` (writePath sí incluido), con `dependencies: ['quotes:edit']` y alcances `COMMERCIAL_SCOPES = ['own','team','global']` (catálogo `:41`).
- **¿Quién la recibe?** DISENO:189 la nombra, pero **ningún paquete** de COM-01 §3.1/CAT `PACKAGE_TEMPLATES` (catálogo `:206-244`) la incluye → decisión F1 §8: sin concesión explícita la acción queda inaccesible para todos salvo quien el coordinador la asigne.
- **Rechazo sin cambio parcial (caso 5.1):** validación del DTO y comprobación de `quotes:discount` ocurren **antes** de escribir; un payload mixto `{ quantity, discountPct }` sobre el endpoint general se rechaza entero (400), sin aplicar la cantidad (espejo de COM-02 §3).

## 4. Estados PROP (máquina, alcance y reglas de la ficha)

- **La máquina no cambia (regla 1):** se conservan las seis transiciones de §2.1 y `vencida` como condición calculada al leer. «Las transiciones válidas se conservan» (DISENO:79).
- **«Cambiar estado no introduce aprobación de venta ni emite factura ERP» (regla 1, textual):** `PATCH /:id/status` solo persiste `status`/`closedAt`/`issuedAt`/`lostReason`; **no** crea factura, **no** llama a Yéminus y **no** añade bandeja de aprobación (DISENO:35 «Cambiar estado sin aprobación de venta», `:79`, `:179` «no introducir una aprobación de venta», `:212` checklist). La factura solo nace en Yéminus (DISENO:87,91) → **bloqueo B1/B-COM-07 heredado, COM-07** (§8).
- **Autorización de transición:** PROP sustituir `QUOTE_STATUS_ROLES` (rol, `:40-46`) por **`quotes:status` + alcance** de la concesión (DISENO:83 «transición por permisos/alcance en lugar de rol»), conservando `QUOTE_TRANSITIONS` como única fuente de legalidad y el 404 de scope (`:167-174`). La sustitución **cambia un guard existente**: hoy `ganada` exige rol supervisor y un Vendedor no puede cerrar la propia (§2.1) → decisión F3 §8.
- **`ganada` conserva el pedido interno idempotente** (regla del caso 3): misma transacción, `quoteId` único, 409 controlado ante carrera (§2.5); **sin** crear ni contar factura inexistente (`dashboard.service.ts:152` exige `externalInvoiceNumber not null`).
- **Conservar descuentos y precios capturados (regla 3):** al cambiar estado no se recalcula nada de las líneas: `updateStatus` solo escribe cabecera (`:377-385`). El recálculo de `lineTotal`/totales que ya existe re-deriva aritmética **sobre** el `discountPct` y `unitPrice` conservados (`:321`, `:467-481`); no sustituye descuentos ni precios históricos, y no se esperan porcentajes nuevos de COM-09 para sostener esta máquina.
- **`quotes:discount` no es requisito de los estados:** una cotización puede moverse por toda su máquina sin que nadie tenga la acción; el descuento queda como campo editable solo en `borrador/enviada/negociacion` (§2.2), condición **ya existente** que se conserva.

## 5. Los 3 casos de la ficha y su acreditación

**Aceptación de `backend` y `frontend` (ficha, textuales, idéntica en ambos pasos).**

| # | Caso (ficha, textual) | Cómo se acreditará (PROP; no es evidencia todavía) |
|---|---|---|
| 5.1 | «Editar cantidad no introduce descuento nuevo no autorizado ni borra descuento previo autorizado.» | (a) API: `PATCH /:id/items/:itemId` con `{ quantity }` → 200 y `discountPct` **intacto**; con `{ quantity, discountPct }` → **400** (`discount-not-allowed-in-general-edit`) y **ningún** campo aplicado; `PATCH .../discount` sin `quotes:discount` → **403**; con la acción y rango 0–100 → 200. (b) PostgreSQL **desechable** con fixtures ficticios: leer el ítem después de editar cantidad y asertar `discountPct`, `unitPrice`, `priceCapturedAt` idénticos y `lineTotal` = fórmula con **el mismo** descuento (patrón spec `:184`, `:199`) |
| 5.2 | «Producto/tarifa ajeno se rechaza.» | API: producto fuera de alcance → **403** (o 404 si no existe); Lista sin nivel `view_prices` → **403**; cotización sin `priceListId` o sin precio vigente en la tarifa → **409** citando el SKU (`quotes.service.ts:239-243`, `:257-265`); cotización ajena → **404** sin revelar existencia (`:167-174`). Sin escritura parcial: ninguna fila creada en cada rechazo |
| 5.3 | «Ganada conserva pedido interno idempotente sin contar factura inexistente.» | API: dos transiciones a `ganada` → segunda **409** con un solo `SalesOrder`; `externalInvoiceNumber` permanece `null` y la facturación del dashboard **no sube** (`dashboard.service.ts:152`); transición a `ganada` no invocable sin `quotes:status`+alcance → **403**. Specs existentes de referencia: `quotes.service.spec.ts:310,356,388,439` |

**No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP, PostgreSQL desechable. §5 lista pruebas **previstas**.

## 6. Errores (PROP sobre patrón OBS del módulo)

| Código | Cuándo | Evidencia/base |
|---|---|---|
| 400 | `quantity` <1 o no entero; `discountPct` fuera de 0–100; **`discountPct` presente en el DTO general** (payload mixto rechazado entero); `lostReason` ausente en `perdida` | `add-quote-item.dto.ts:9-12`, `update-quote-item.dto.ts:11-14`; `quotes.service.ts:62-68`, `:365-367`; patrón COM-02 §6 |
| 401 | JWT inválido/expirado (guard de todo el módulo) | `quotes.controller.ts:34`, patrón BASE-02 §7 |
| 403 | Sin `quotes:edit`/`quotes:status`/`quotes:discount` sobre el recurso o fuera de alcance; rol no habilitado para la transición (hoy, hasta F3); Lista/producto sin nivel `view_prices` | `data-scope.ts` (resolver, COM-01 §2.1); `quotes.service.ts:358-363`; `acl.service.ts:217-218,300-302` |
| 404 | Cotización ajena o inexistente (oculta existencia); ítem que no pertenece a la cotización; Lista/Producto inexistente | `quotes.service.ts:165,171-173,307-309`; `acl.service.ts:213-214,225-227,284-286` |
| 409 | **Transición inválida** (PROP: hoy es 400, `:351-356`; el propio servicio ya usa `ConflictException` para estado: ítems no editables `:441`, doble `ganada` `:563`); ítems en estado terminal; sin precio vigente/tarifa; carrera de `SalesOrder` | `:436-447`, `:239-265`, `:558-566`; cambio de 400→409 debe coordinarse con Swagger (`quotes.controller.ts:104`) y con la UI, que muestra el mensaje del backend tal cual (`QuoteDetailPage.tsx:114-117`) |

## 7. Incrementos posteriores registrados (fichas, textuales) y solape

**Aceptación idéntica en `backend` y `frontend` (ficha, textual):** «Editar cantidad no introduce descuento nuevo no autorizado ni borra descuento previo autorizado.» + «Producto/tarifa ajeno se rechaza.» + «Ganada conserva pedido interno idempotente sin contar factura inexistente.»

| Incremento | Depende de | Objetivo (ficha) | Archivos (ficha) |
|---|---|---|---|
| **COM-03 `backend`** | COM-01 | «Completar el alcance de servidor de este paso y sus pruebas. Si no cabe en una entrega revisable, el coordinador registra todos los subpasos antes de delegar código.» | `modules/commercial/quotes/**`, `common/security/access-catalog.ts` + `.spec.ts` — **sin** `schema.prisma` (§3) |
| **COM-03 `frontend`** | COM-01 | «Conectar la interfaz al contrato de servidor auditado y verificar su recorrido; sin cambiar reglas desde el navegador.» | `pages/QuotesPage.tsx` + `.spec.tsx`, `pages/QuoteDetailPage.tsx` + `.spec.tsx`, `features/quotes/**`, `services/quotes.service.ts` + `.spec.ts` |

**Solape con COM-02/04…09 y CAT-01…08 (writePaths de sus fichas, revisados con `preparar-tanda.mjs --list` y `tareas.json`, sin escribirlos):**

| Archivo compartido con COM-03 | Fichas que lo tocan |
|---|---|
| `modules/commercial/quotes/**` | **COM-03 `backend`, COM-09 `backend`** (vecino directo: COM-09 depende de COM-03 y añade límites/condiciones encima de esta separación) |
| `common/security/access-catalog.ts` + spec | COM-02, **COM-03**, COM-06 `backend-solicitudes/atencion/excel`, COM-07 `backend-sincronizacion/indicadores`, COM-08, COM-09, CAT-01, CAT-05 `backend-reglas/api`, CAT-06, CAT-07, CAT-08 |
| `QuoteDetailPage.tsx` + `features/quotes/**` + `services/quotes.service.ts` | **COM-03 `frontend`, COM-09 `frontend`** — sin solape con COM-02 (`CustomersPage`/`features/customers/**`) |
| `prisma/schema.prisma` + `migrations/**` | COM-06/07/08, CAT-01/02/04/05/06/07/08 — **COM-03 no lo incluye** (su ficha lo excluye; §3) |
| `modules/dashboard/**`, `sales-targets/**` | COM-04, COM-05, COM-07 — **sin solape** con COM-03 (su caso 5.3 solo **lee** el criterio de facturación) |
| `pages/CustomersPage.tsx`, `features/customers/**` | solo COM-02 (COM-03 las lee como `customerId`/cliente, writePath ajeno) |

**Cadena:** COM-03 **hereda** de COM-01 el catálogo, `resolveAccess`/grants y el hueco D5; **entrega** a COM-09 la separación ya operativa (`quotes:discount` separada de `quotes:edit`) sobre la que COM-09 impone umbrales/condiciones; **no** toca el bloqueo ERP de COM-07 (§4) ni las acciones de clientes de COM-02.

## 8. Fuentes leídas con estado y decisiones pendientes

| Fuente | Marca | Aporte |
|---|---|---|
| `.../quotes/quotes.controller.ts` (112, idéntico en copia) | **OBS** | §2.1-2.2: rutas, `@Roles` solos, sin `@Permissions` |
| `.../quotes/dto/update-quote-item.dto.ts` (15) | **OBS** | §2.3: `quantity?` + `discountPct?` en un mismo DTO — la prueba de la regla 2 |
| `.../quotes/dto/add-quote-item.dto.ts` (18) / `update-quote-status.dto.ts` (22) / `create-quote.dto.ts` (38) | **OBS** | §2.2-2.3: campos de alta, `QUOTE_STATUSES`, alta sin descuento global |
| `.../quotes/quotes.service.ts` (567, idéntico en copia) | **OBS** | §2.1-2.5: matriz `:26-33`, roles `:40-46`, snapshot `:275-292`, conserva descuento `:312-314`, totales `:467-481`, `ganada` `:376-416` |
| `.../quotes/quotes.service.spec.ts` (502) | **OBS** | §5/§10: tests de rango, snapshot, `ganada`, 404, roles |
| `src/backend/prisma/schema.prisma` (copia: `Quote` `:748`, `discount` `:758`, `SalesOrder` `:788`, `externalInvoiceNumber` `:796`, `QuoteItem` `:836`, `discountPct` `:849`) | **OBS** | §2.3/§3: campos ya existentes; sin migración prevista (S3: `:642/:652/:682/:690/:730/:743`) |
| `src/frontend/src/pages/QuoteDetailPage.tsx` (332, idéntico en copia) | **OBS** | §2.1/§4: botones por transición, `ganada` oculta en `personal`, descuento global solo presentación |
| `.../features/quotes/components/QuoteItemsTable.tsx` | **OBS** | §2.2/§3: envíos separados `{quantity}`/`{discountPct}`, gating solo por estado |
| `.../features/quotes/lib/quote-status.ts` | **OBS** | §2.1: espejo de la matriz; «el backend sigue siendo la autoridad» |
| `.../features/quotes/components/AddQuoteItemModal.tsx` | **OBS** | §3: descuento en el alta sin concesión |
| copia `.../security/access-catalog.ts` (293) | **OBS — solo en copia** | §2.3/§3: `quotes:read/create/edit/status` `:70-73`, paquetes `:206-244`, `COMMERCIAL_SCOPES` `:41`; **sin `quotes:discount`** |
| copia `.../acl/acl.service.ts` | **OBS** | §2.4: `assertListaAccess` `:205-229`, `assertProductAccess` `:276+` |
| copia `.../dashboard/dashboard.service.ts:152,336,505` | **OBS** | §2.5/§5.3: facturación solo con `externalInvoiceNumber not null` |
| `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md` | **IP** | `:77` precios capturados; `:79` estados y «no requieren una aprobación de venta»; `:81` descuentos con reglas propias; `:83` transición por permisos/alcance; `:179`,`:189` acciones; `:211-212` checklist; `:87-91` Yéminus; `:159` auditoría |
| `contratos/COM-01.md` §2.1-§2.5, §3.1 | **IP** de esta tanda | catálogo/resolver/D5; paquete Vendedor con `quotes:*` |
| `contratos/COM-02.md` §3, §6, §7 | **IP** de esta tanda | patrón DTO-separado, `resolveAccess` por acción, auditoría sin PII, 400 sin escritura parcial |
| `contratos/BASE-02.md` §3, §7, §11 | **IP/OBS** | acciones por hijo; semántica 400/403/404/409; bloqueos B1-B4 |
| `estado.json` | **OBS** | solo `BASE-01/inventario`; `decisions: {}` |
| `tareas.json` + `preparar-tanda.mjs COM-03 contrato` | **OBS** | ficha canónica, `requiredDecisions: []`, writePaths (§7) |

| # | Decisión o bloqueo | Afecta | Estado |
|---|---|---|---|
| D2 | Catálogo propio `apartado:acción` (adoptado en la copia) vs catálogo UA con puntos | ID `quotes:discount` nuevo | **Herida de BASE-02 §11 — confirmación del coordinador pendiente** |
| D5 | Extender `@Permissions`/`PermissionsGuard` a toda la superficie; el módulo quotes hoy no lo usa (§2.1) | acceptance «por URL/API», §4 transición | **Pendiente — decisión del coordinador** |
| E6 | Revalidación de `AccessGrant` por petición y refetch de concesiones | §4 y botones del frontend | **Pendiente (heredada de COM-01)** |
| F1 | **Quién recibe `quotes:discount`:** DISENO:189 la nombra pero ningún paquete la asigna (§3); sin concesión, la acción queda inaccesible | §3, §5.1, frontend | **Pendiente — decisión del coordinador** |
| F2 | **Umbrales/condiciones de descuento:** «El porcentaje y las condiciones empresariales deben definirse antes de delegar descuentos» (DISENO:81); el código solo valida 0–100 | §3 (no se fija % aquí), COM-09 | **Bloqueo externo heredado B3 (BASE-02 §11) → COM-09** (`requiredDecisions: regla-descuentos`) |
| F3 | Sustituir `QUOTE_STATUS_ROLES` por `quotes:status`+alcance: ¿el Vendedor cierra `ganada` en la propia? DISENO:79/83 apoyan «sin aprobación»; la guarda actual `:43` y el test spec `:439` la niegan | §4, §6 (403), frontend | **Pendiente — decisión del coordinador** |
| F4 | **Descuento global** `Quote.discount` (esquema, sin endpoint, §2.3): ¿se expone como campo, se deja para COM-09 o se conserva solo de lectura? | §3, §6 | **Pendiente** |
| F5 | **Coordinación backend/frontend:** retirar `discountPct` del DTO general cambia un contrato de API en uso; los pasos `backend` y `frontend` comparten aceptación (§7) | §3, §7 | **Pendiente técnica — orden de entrega a acordar** |
| F6 | **Auditoría de descuento:** DISENO:159 la exige «cuando se delegue»; hoy `addItem`/`updateItem` no auditan (§2.3) | §3, §5.1 | **Pendiente (¿en COM-03 o al habilitar la acción en COM-09?)** |
| F7 | **Cambio 400→409 en transición inválida** (§6) versus conservar el 400 documentado en Swagger (`:104`) | §6 | **Pendiente — mínima pero es un contrato de API** |
| B1 (etiqueta coordinador «B-COM-07») | **Yéminus:** sin contrato/API ni datos de integración reales; COM-07 exige `api-yeminus`. **OBS:** el código `B-COM-07` no aparece en el repo; el mismo bloqueo está como **B1** en BASE-02 §11 y en la ficha COM-07 | §4 («no emite factura ERP») | **Bloqueo externo heredado — no se resuelve aquí** |
| B3 | **Descuentos:** reglas comerciales sin decidir (ídem F2) | §3 | **Bloqueo externo heredado** |
| B2/B4 | Excel «Pedidos», preview de precios | no cambian aquí | **Pendientes** (BASE-02 §11) |

## 9. Criterios de aceptación del paso (ficha, textuales)

1. ✅ «Contrato consistente con dependencias y decisiones pendientes explícitas.» — §1 declara `dependsOn: COM-01` **implementado en copia, no aceptado en `estado.json`**; §4/§8 declaran que los límites de descuento **no** se fijan aquí (F2/B3 → COM-09) y que el ERP queda bloqueado (B1/B-COM-07 → COM-07); §8 enumera D2, D5, E6, F1-F7, B1-B4.
2. ✅ «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.» — §7 registra `COM-03 backend` y `COM-03 frontend` con sus fichas textuales (los 3 casos) y el solape con COM-02/04…09 y CAT-01…08.

**Advertencia de modalidad (TANDA-COMPLETA:14):** todo lo marcado **PROP** es una propuesta para la **auditoría final única** del coordinador; no sustituye `estado.json`, no modifica aceptaciones y no autoriza implementación, migraciones ni despliegues. En particular, §3 y §4 proponen **retirar `discountPct` del DTO general de ítem** y **sustituir la matriz de roles de transición**: ambas son rupturas de contratos en uso que deben resolverse con F3/F5/F7 antes de delegar código; y §4 **no** fija porcentajes ni condiciones de descuento por regla de la ficha (F2/B3 → COM-09).

## 10. Evidencia reproducible

Comandos desde la raíz del repo (solo lectura):

```bash
git status --porcelain; git rev-parse --short HEAD            # baseline S3: 32 líneas
node docs/ejecucion-paneles/preparar-tanda.mjs COM-03 contrato
node docs/ejecucion-paneles/preparar-tanda.mjs --list
rg -n '@Permissions\(' src/backend/src/modules/commercial/quotes/   # vacío (S3 y copia)
rg -n 'QUOTE_TRANSITIONS|QUOTE_STATUS_ROLES|ITEM_EDITABLE' src/backend/src/modules/commercial/quotes/quotes.service.ts
rg -n 'discountPct|quantity' src/backend/src/modules/commercial/quotes/dto/*.ts
sed -n '298,327p;342,428p;467,481p' src/backend/src/modules/commercial/quotes/quotes.service.ts
rg -n 'quotes:|discount' /home/soporte/office_ai/gs-tanda-01/src/backend/src/common/security/access-catalog.ts
rg -n 'payload: \{ quantity \}|payload: \{ discountPct' src/frontend/src/features/quotes/components/QuoteItemsTable.tsx
rg -n 'model Quote |discount    Decimal|externalInvoiceNumber' src/backend/prisma/schema.prisma
diff -rq src/backend/src/modules/commercial/quotes/ /home/soporte/office_ai/gs-tanda-01/src/backend/src/modules/commercial/quotes/   # vacío
diff -q src/frontend/src/pages/QuoteDetailPage.tsx /home/soporte/office_ai/gs-tanda-01/src/frontend/src/pages/QuoteDetailPage.tsx     # vacío
rg -n 'Cotizaciones|quotes:discount|aprobación de venta' docs/DISENO-PANEL-COMERCIAL-2026-10-13.md
```

- **No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP con permisos, pruebas con PostgreSQL desechable, consulta de datos reales. §5 lista las pruebas **previstas**, no realizadas.

## 11. Riesgos de este contrato

- Retirar `discountPct` de `AddQuoteItemDto`/`UpdateQuoteItemDto` **cambia un contrato de API en uso**: cualquier cliente que hoy envíe descuento en esas rutas recibirá 400 (deseado, pero debe coordinarse con el frontend de la misma ficha, F5/§7).
- Crear `quotes:discount` **sin que exista una concesión** (F1) produce que el descuento quede inaccesible para todos salvo quien el coordinador la asigne: el endpoint nuevo estaría denegado por defecto.
- Aprobar §4 sin resolver F3 deja conviviendo un guard por rol (`:40-46`) con la promesa de «transición por permisos/alcance» del diseño: la aceptación «sin aprobación de venta» quedaría **parcialmente** cierta (un Vendedor seguiría sin poder cerrar `ganada`).
- Delegar §3 sin D5 mantiene que «sin concesiones no hay escritura» sea **solo parcialmente** cierto en servidor (hoy todo el módulo decide por `@Roles`, §2.1), igual que en COM-01 §4/COM-02 §11.
- Si F4 decide exponer el descuento global o F6 exige auditoría de descuento con historial, los writePaths actuales podrían resultar insuficientes (§3/§7): delegar sin revisar la ficha obligaría a tocar `schema.prisma` fuera de writePath.
- El solape de `access-catalog.ts` con 11 fichas (§7) exige que COM-03 **solo añada** `quotes:discount` y no reordene ni reescriba entradas existentes del catálogo.
