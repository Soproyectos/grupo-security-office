# CAT-03 — Editar los apartados de la ficha

- **Paquete:** CAT-03 «Editar los apartados de la ficha» (lane `catalog`), depende de **CAT-02**.
- **Modalidad:** tanda continua; **QA-01 y la auditoría son del coordinador**. Este contrato no acepta pasos: los prepara.
- **Referencia de diseño:** `docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md` §5 «Ficha del producto» (`:140-161`) y §6-§7 (validación/publicación, solo como contexto; pertenecen a CAT-05/CAT-06).

## 1. Meta, reglas y límites

Objetivo: que la persona pueda **editar los apartados de la ficha** (Información general, Identidad, Destacados, Características, Especificaciones, Notas y Atributos) sobre el **borrador versionado** de CAT-02, sin publicar y sin alterar otras áreas.

Reglas de la ficha (ficha CAT-03 + diseño §5):

1. **Sin duplicar campos entre apartados.** Cada dato se edita en un solo sitio; el encabezado puede repetirlo para orientar.
2. **Destacados son puntos fuertes/beneficios** (`catalogHighlights`), no controlan el inicio de la tienda (eso es Configuración de página/promociones).
3. **Modelos** conserva compatibilidad con lo existente y se amplía después; **sin variantes nuevas** (stock/precio) y **sin bloquear publicación** por no completarlo (prioridad baja).
4. **No rediseñar la ficha pública ni imponer PDF.** Editar la ficha **no publica**.
5. **Editar deja la validación pendiente** (motor de CAT-05), no la autoriza.
6. **Notas son internas**: no salen al API público ni a una exportación ordinaria; leer/editar/exportar notas exige sus acciones.
7. **Especificaciones vs Atributos:** una sola fuente. Los valores técnicos viven en Especificaciones; Atributos define/asigna campos adicionales. Crear/alterar una definición global exige permiso distinto de rellenar un valor.

## 2. Estado actual (OBS — copia de revisión `gs-tanda-01`)

### 2.1. Lo que YA existe (reutilizable)

| Pieza | Realidad hoy | Evidencia |
|---|---|---|
| Editor de ficha (frontend) | `features/products/sheet/**`: `ProductSheetEditor.tsx` con subsecciones `informacion`, `identidad`, `destacados`, `caracteristicas`, `modelos`, `especificaciones`, `documentos`, `notas`; integrado en `ProductFichaTab` de `pages/ProductDetailPage.tsx` | `ProductSheetEditor.tsx:46-52,433-616`; `ProductFichaTab.tsx:26-29` |
| API de ficha | `GET/PUT /api/products/:id/sheet` (`ProductSheetController`) → `ProductSheetService.get/update` (transacción) | `sheet/product-sheet.controller.ts:18-48` |
| Campos persistidos | `Product`: `catalogName`, `catalogSlug`, `catalogStatus`, `catalogBrand`, `catalogModel`, `catalogBadges`, `catalogHighlights`, `catalogFeatures` (Json), `catalogAvailableModels`, `catalogImageUrl/Alt`, `catalogSpecsDisclaimer`, `catalogFirmwareNote`; grupos en `ProductCatalogSpecGroup`; documentos/firmware en `ProductCatalogResource` | `prisma/schema.prisma` (`model Product`); `dto/product-sheet.dto.ts` |
| Borradores versionados (CAT-02) | `GET/PUT` de ficha... **no**; el borrador es `POST` de revisión + `GET /api/products/:id/revisions`; `ProductRevision.content` (Json), `notes`, `version` (OCC `expectedVersion`, 409 `revision-version-conflict`) | `products.controller.ts:125-126`; `product-revisions.service.ts:80-125` |
| Edición general del producto | `PUT /api/products/:id` (`UpdateProductDto`) con `specs`/`extraSpecs` tipados (`SpecsDto`/`SpecFieldDto`, tipos `TEXT|NUMBER|SELECT|BOOLEAN|UNIT`) | `dto/update-product.dto.ts`; `dto/spec-field.dto.ts` |

### 2.2. Huecos reales detectados (a cubrir por CAT-03)

| # | Hueco | Consecuencia frente a la ficha |
|---|---|---|
| H1 | El apartado **Notas** de la interfaz edita `specsDisclaimer` y `firmwareNote`, que son **públicos** (van al storefront). **No existe almacenamiento de notas internas** en el DTO/servicio de ficha. | La aceptación «Notas no salen al API público ni a exportación ordinaria» **no** se cumple: hoy no hay notas privadas, y "notas" nombra campos públicos (riesgo de confusión). |
| H2 | `PUT /api/products/:id/sheet` **no tiene OCC**: reemplaza la ficha entera sin `expectedVersion`. | La aceptación «conflicto concurrente no pierde cambios» **no** se cumple por esa vía (el borrador CAT-02 sí lo tiene). |
| H3 | Autorización del editor por `@Roles('Super Admin','Admin Comercial')` + ACL `edit_products`; no usa el catálogo de acciones (`products:edit`) ni la concesión (`resolveAccess`+grants). | El «editor no altera otras áreas **sin permiso**» depende hoy de rol/ACL, no de acción concedida (transición D5). |
| H4 | Identidad: no hay campo de **identificadores del fabricante** (solo `catalogModel` y `catalogAvailableModels`). | «Identidad: referencia, marca, categoría e identificadores del fabricante» queda a medias. |
| H5 | Editar la ficha **no** marca «revisión pendiente» de forma explícita (lo hace la ruta legacy `markPendingFromLive`). | Regla 5 («cambiar revisión deja validación pendiente») queda implícita. |

> **No se asume** que CAT-03 sea «no-op» como IMP-06: hay huecos reales (H1-H5). La verificación de cada uno se hará antes de declararlo reutilizado, con evidencia, y **sin maquillar** lo que siga faltando.

## 3. Mapa de apartados → almacenamiento (sin duplicar) — PROP

| Apartado | Fuente única de edición | Notas |
|---|---|---|
| Información general | `Product.name`, `Product.description` (vía `PUT /products/:id` / `ProductGeneralInfoSection`) | El encabezado solo repite para orientar; no se re-edita aquí el nombre público. |
| Identidad | `Product.sku`, `brandId`, `categoryId`, `catalogName`, `catalogSlug`, `catalogModel`, **`catalogManufacturerRefs: String[]`** (nuevo, H4; D4 resuelta en §11) | Cambiar `sku` exige control de duplicados (índice normalizado ya existe: `products_sku_normalized_key`); **no** crea otro producto. |
| Destacados | `Product.catalogHighlights: String[]` (`highlights`) | Puntos fuertes; no afecta al inicio de la tienda. |
| Características | `Product.catalogFeatures: Json` (`features: {label,icon}[]`) | Descripción funcional por temas; **no** repite la tabla técnica. |
| Modelos | `Product.catalogAvailableModels: String[]` + `catalogModel` | Compatibilidad; opcional, no bloquea publicar. |
| Especificaciones | `ProductCatalogSpecGroup` (+ filas) y `SpecsDto`/`SpecFieldDto` en `technicalSpecs` | Una sola fuente de valores técnicos. |
| Documentos y firmware | `ProductCatalogResource` | Pertenece a **CAT-04** (activos); aquí solo se enlaza. |
| **Notas** | **`Product.catalogInternalNotes: String?` (nuevo, H1)** — privado | NO va al storefront ni a exportación ordinaria; leer/editar requiere acción propia. Se separa explícitamente de `catalogSpecsDisclaimer`/`catalogFirmwareNote` (públicos). |
| Atributos | `Product.extraAttributes` / `extraSpecs` (`SpecsDto`) | Definición **global** de campos: pendiente (§8 D3). |

## 4. Acciones y alcance (PROP)

- El catálogo real de S3 **no tiene** `products:edit`: las acciones vigentes son `products:read`/`products:write`/`products:delete`/`products:publish` (`access-catalog.ts:111-114`). El editor de ficha se gobierna por **`products:write`** (depende de `products:read`, BASE-02 §5.3) y `products:publish` sigue reservado a CAT-06. **Acción nueva**: `products:notes` (leer/editar notas internas) — implementada con spec en `access-catalog`, y **no concedida a nadie por defecto** hasta que el coordinador la asigne.
- Alcance por Lista con `resolveAccess`+grants (patrón CAT-01/COM-*); transición D5: los legados sin concesiones conservan la capa ACL/rol existente (`edit_products`).
- **Publicar no es un apartado**: el botón vive en CAT-06; CAT-03 solo guarda borrador.

## 5. Aceptaciones por incremento (ficha textual) y acreditación (PROP)

| Incremento | Aceptación | Acreditación prevista |
|---|---|---|
| `backend` | «Notas privadas, campos sin duplicar, edición no publica.» | Spec+HTTP: `GET/PUT sheet` con `catalogInternalNotes` **no** expuestas por el API público (detail/dTO de ficha pública sin el campo) ni en la exportación ordinaria (CAT-08 no implementado → se acredita la **ausencia** en el mapper público); `sku` duplicado → 400/409 sin crear producto (S3: el SKU no se edita desde la ficha — ver §11.4); guardar ficha **no** cambia `catalogPublished`/revisión pública; OCC: `expectedVersion` viejo → 409 y sin escritura (H2); sin `products:write` (ni `products:read` para leer) → 403 con concesiones vigentes. **HECHO — ver §11** |
| `frontend-identidad` | «Guardar/recargar conserva campos; conflicto no pierde cambios.» | Spec de render + utilidades puras: estado del formulario, `expectedVersion` enviado, 409 muestra la versión vigente y conserva lo escrito (sin falso éxito). **HECHO — ver §12** |
| `frontend-beneficios` | «Destacados son beneficios; cambio invalida validación.» | Spec: Destacados = frases/beneficios (sin campos de tienda); tras guardar, estado de validación pasa a «revisión pendiente» (regla 5). **HECHO — ver §13** |
| `frontend-tecnicos` | «Notas no públicas; sin variantes nuevas ni PDF obligatorio.» | Spec: Notas marcadas como internas (aviso en la interfaz) y separadas de las notas públicas; Modelos sin stock/precio; publicar con «sin ficha técnica» no se bloquea. **HECHO — ver §14** |

## 6. Errores (PROP)

`400` entradas inválidas (SKU, slug, tipos de especificación) · `401` sesión · `403` sin acción/alcance (incluye notas sin concesión) · `404` producto inexistente · `409` versión esperada (OCC) o SKU/slug duplicado.

## 7. Incrementos (fichas textuales)

| Paso | Objetivo | WritePaths |
|---|---|---|
| `contrato` | Este documento | `docs/ejecucion-paneles/contratos/CAT-03.md` |
| `backend` | Exponer lectura/guardado de apartados de **borrador** con notas privadas, sin duplicar campos y con OCC | `src/backend/src/modules/products/**`, `prisma/schema.prisma`, `prisma/migrations/**`, `src/backend/src/common/security/access-catalog.ts`(+spec) |
| `frontend-identidad` | Conectar Información general e Identidad | `src/frontend/src/features/products/**`, `src/frontend/src/pages/ProductDetailPage.tsx`(+spec), `src/frontend/src/services/product-detail.service.ts`(+spec) |
| `frontend-beneficios` | Conectar Destacados y Características | idem |
| `frontend-tecnicos` | Conectar Especificaciones, Atributos y Notas; preservar Modelos | idem |

**Solape:** `modules/products/**` (CAT-04/05/06 también), `schema`+`migrations` (migración propia con timestamp + `prisma generate`), `ProductDetailPage.tsx` (CAT-04/05/06). BD desechable con URL inline.

## 8. Decisiones pendientes y bloqueos

| # | Decisión | Estado |
|---|---|---|
| D1 | Nombre/forma del campo de notas internas (`catalogInternalNotes String?` vs JSON por apartado) | **Técnica del paso `backend`** (reversible; se elige la mínima: `String?`) |
| D2 | ¿`products:notes` como acción propia o basta `products:edit`? | Propuesta `products:notes` (diseño: «leer, editar y exportar notas exige sus acciones»); **el coordinador confirma** a quién se concede |
| D3 | Definición **global** de atributos (crear/alterar definición → permiso distinto) | **Pendiente** (no hay modelo de definiciones; registrar en CAT-05 o ficha propia) |
| D4 | Identificadores del fabricante: ¿`catalogManufacturerRefs` o reutilizar `catalogModel`? | Técnica del paso `backend` (H4) |
| D5/E6 | Capa legada de permisos | Heredadas |
| K1-K5 | Heredadas de CAT-02 | Pendientes |

**Ningún bloqueo externo afecta a CAT-03**: el insumo es el diseño y el propio código de la copia.

## 9. Criterios de aceptación del paso (`contrato`)

1. Consistente con la dependencia CAT-02 (borradores versionados) y con las decisiones pendientes explícitas (§8).
2. Los 4 incrementos registrados con objetivo, `writePaths` y aceptación propios antes de delegar código (§7).
3. Reglas de ficha aterrizadas: mapa sin duplicidad (§3), notas privadas (§2.2 H1), OCC (§2.2 H2), permisos (§4).
4. Estado real declarado **sin maquillar**: los huecos H1-H5 se verifican/implementan antes de marcar `backend`/`frontend-*`.
5. Aviso de modalidad: PROP; QA-01 del coordinador.

## 10. Evidencia reproducible

```bash
rg -n "identidad|destacados|caracteristicas|modelos|especificaciones|notas" src/frontend/src/features/products/sheet/ProductSheetEditor.tsx
rg -n "@Get|@Put|@Roles" src/backend/src/modules/products/sheet/product-sheet.controller.ts
rg -n "^  [a-zA-Z]+[?]?:" src/backend/src/modules/products/sheet/dto/product-sheet.dto.ts   # no hay 'notes' → H1
rg -n "expectedVersion|revision-version-conflict" src/backend/src/modules/products/product-revisions.service.ts
rg -n "catalogHighlights|catalogInternalNotes|catalogAvailableModels" src/backend/prisma/schema.prisma
rg -n "notes|notas" src/backend/src/modules/products/public-detail/ src/modules/storefront/   # público sin notas internas
```

## 11. Verificación `backend` (estado real) — CERRADO

### 11.1. Qué se implementó

| Hueco | Incremento |
|---|---|
| H1 notas privadas | `Product.catalogInternalNotes String?` (Text). `GET/PUT /api/products/:id/sheet` lee/escribe `internalNotes`; **nunca** sale al DTO público (el mapper campo a campo lo ignora). Acción `products:notes`: sin ella las notas **se conservan y no se devuelven** (`internalNotes: null`); la auditoría solo incluye notas si el actor tiene la acción. |
| H2 OCC | `Product.sheetVersion Int @default(0)`: PUT acepta `expectedVersion`; si está atrasada → **409 `sheet-version-conflict` ANTES de cualquier escritura** (0 escritura, 0 auditoría), con `currentVersion` y `feedback` (canal que el filtro global reenvía). Clientes sin `expectedVersion` siguen guardando (camada legada) y la versión sube igual. |
| H3 acciones | `ProductSheetService` con `@Optional() AccessAssignmentsService` + `resolveAccess` (patrón promotions/COM-08, transición **D5**): usuarios **sin grants** conservan la capa @Roles+ACL (`edit_products`) existente; usuarios **con grants** necesitan `products:read` (GET) / `products:write` (PUT). Catálogo: acción nueva `products:notes`, **sin conceder a nadie por defecto** (D2 queda a criterio del coordinador). El catálogo real de S3 no tiene `products:edit`: la acción del editor es `products:write` (§4 corregido). |
| H4 identificadores | `Product.catalogManufacturerRefs String[] @default([])`: DTO `manufacturerRefs` (trim, dedupe, ≤20×120). **D4 resuelta**: `String[]` plano en vez de `Json` (no existe modelo de tipo/etiqueta de identificador; no se inventa estructura; migración estructurada cabe después sin pérdida). No se expone al DTO público en este incremento (decisión de paso futuro). |
| H5 revisión pendiente | **No** en este incremento: corresponde a `frontend-beneficios` (estado de validación sobre el mecanismo de borradores CAT-02) — **ejecutado como acompañante en §13** (el backend del sheet ya marca `markPendingFromLive`). Sin decisión de negocio nueva. |

Migración `20261017150000_add_product_sheet_notes_occ` (+`migration.down.sql`) aplicada a las **7 BDs desechables**; `prisma generate`; build OK.

### 11.2. Evidencia real

- `jest src/modules/products/sheet`: **2 suites / 64 pruebas verdes** (12 nuevas: 3 OCC + 7 notas/acciones).
- `access-catalog.spec.ts`: aserción nueva de `products:notes` (enabled, depende de `products:read`, no sustituye a `products:write`).
- `product.mapper.spec.ts`: prueba nueva — el DTO público nunca expone `catalogInternalNotes` ni `sheetVersion`.
- Suite backend completa: **94 suites / 1737 pruebas**, 12 fallos = **solo** el baseline DI de `public-products.spec.ts` (0 regresiones).
- `tsc --noEmit` 0; eslint 0 errores (3 warnings preexistentes en `product-revisions.backfill.spec.ts`, ajenos).
- **e2e vivo** `node /tmp/gs-tanda-logs/e2e-cat03.cjs`: **30/30** — 401 sin token (GET/PUT); GET 200 con `version`; OCC atrasada 409 con `feedback`/message y **cero escritura/cero auditoría**; PUT correcto +1 versión, refs deduplicados, notas devueltas, `published` intacto; auditoría `update_sheet` con versión anterior/nueva; legado sin `expectedVersion` 200; **detalle público 200 sin notas ni versión** (fixture publicado temporalmente); con fuente de concesión real (`customers:read` global) el usuario Admin Comercial sin `products:read`/`products:write` → **403 GET y PUT**, mientras Super Admin conserva acceso (excepción explícita); limpieza total de la BD.

### 11.3. Conductas reales documentadas (no modificadas aquí)

- `assertProductAccess` (capa ACL legada de S3) responde **404 «Producto no encontrado» para productos SIN Lista** (`listaId NULL`): el producto existe pero la capa legada lo oculta al editor. El e2e asigna una Lista temporal para probar la ficha y la revierte. Si el coordinador lo considera bug, es decisión suya (cambio mínimo: no se tocó).
- La ficha **no edita `sku`/`name`** (identidad vía `PUT /api/products/:id`) — comportamiento existente con prueba propia; el caso «sku duplicado 400/409» pertenece a esa ruta y al pipeline IMP, no al sheet.

### 11.4. Resta en CAT-03

`frontend-identidad` (campos + versión/`expectedVersion`), `frontend-beneficios` (Destacados y estado «revisión pendiente»), `frontend-tecnicos` (Notas marcadas internas, refs visibles, sin variantes/PDF obligatorio).

## 12. Verificación `frontend-identidad` (estado real) — CERRADO

**Qué se implementó** (solo `src/frontend/src/features/products/sheet/**`, según §7):

- **Campos sin duplicar:** `sheet-form.ts` modela `manufacturerRefs` (Identidad, H4: lista «Identificadores del fabricante» bajo Insignias, con `TextListEditor`), `internalNotes` (en la vista API, NO pintada aún — su pantalla es `frontend-tecnicos`) y `version` (OCC). `toForm/toPayload` hacen round-trip de refs con trim/dedupe local y límites espejo del backend (`LIMITS.manufacturerRefs 20`, longitud 120, validación por fila).
- **OCC (H2):** `savePayloadWithVersion(form, sheet)` adjunta `expectedVersion: sheet.version` al PUT — el editor **nunca** guarda a ciegas. `detectVersionConflict(error)` reconoce SOLO el 409 `sheet-version-conflict` (por `feedback` o por el message «La ficha cambió») y extrae la `currentVersion` vigente; un 409 de slug/revisión u otros estados no cuentan. `versionConflictMessage` redacta el aviso sin ambigüedad («Tus cambios NO se guardaron…»).
- **Conflicto sin perder cambios:** `ProductSheetTab` detecta el 409, sustituye el error genérico por el banner de versión y ofrece **«Descartar cambios y recargar»** (refetch explícito + `mutation.reset()`). Como el error no toca la caché, el borrador local del editor **se conserva** (el remonte ocurre solo con datos nuevos por `key={updatedAt}`), y el aviso verde de éxito queda suprimido durante el conflicto (**sin falso éxito**).
- **Notas seguras:** el payload del editor **omite `internalNotes`** — coincide con la semántica del backend (omitir = conservar), así la pantalla de Identidad no puede borrar notas sin verlas. (Corrección aplicada en backend: `undefined` conserva, solo `null` explícito con `products:notes` borra; +2 pruebas jest.)

**Evidencia real:**

- `vitest run` frontend: **71 archivos / 795 pruebas verdes** (+14 nuevas: 10 de modelo puro —round-trip/validación/omit-notas— y 4 de render —campo visible, banner de conflicto con versión, supresión del error genérico, notas no pintadas—).
- Un 409 de OTRA fuente (slug o `revision-version-conflict`) se prueba explícito: no dispara el banner de versión.
- `tsc --noEmit` 0 errores; `eslint src/features/products/**` 0 errores (6 warnings preexistentes en `SpecEditor/ImportStepSections/MappingLine`, archivos no tocados); `vite build` OK.
- Suite backend tras la corrección de semántica: **94 suites / 1739 pruebas**, 12 fallos = solo baseline `public-products.spec.ts` (0 regresiones); e2e `e2e-cat03.cjs` re-actualizado y **30/30** (incluye «guardado legado CONSERVA las notas»).
- Smoke entorno de revisión: 5180 → 200 y proxy `/api/health` → 200 (vite dev sirve el código nuevo).

**Pendiente de navegador real (QA-01):** el recorrido de edición con dos pestañas concurrentes sobre la misma ficha (conflicto vivo) queda para el coordinador; en esta suite no hay Playwright y el patrón de la tanda acredita el flujo con specs de modelo puro + render + e2e HTTP.

## 13. Verificación `frontend-beneficios` (estado real) — CERRADO

**Qué se implementó:**

- **H5 (regla 5, «editar deja la validación pendiente»)** — parte de backend acompañante: `ProductSheetService.update` pasa a invocar el mecanismo CAT-02 existente `markPendingFromLive` (`@Optional()` inyectado, mismo patrón que las rutas legacy de `products.service`): cada guarda de ficha crea una revisión `REVISION_PENDIENTE` con el snapshot live; **no** toca `catalogPublished` ni `publicRevisionId` (la presentación pública sigue sirviendo la última versión publicada). Un 409 de OCC **no** marca nada (no hubo cambio).
- **Frontend:** módulo puro nuevo `sheet-revisions.ts` (`RevisionStatus` con los 5 estados reales del enum, `REVISION_STATUS_LABELS`, `latestValidation(revisions)` — pendiente **solo** cuando la última revisión es `REVISION_PENDIENTE`—, `PENDING_VALIDATION_NOTICE`). Servicio ampliado `fetchProductRevisions` (GET /products/:id/revisions). `ProductSheetTab` consulta revisiones y la invalida tras cada guardado correcto. El editor pinta en el pie «Estado de validación: <label>» y, si está pendiente, un aviso ámbar: la tienda sigue mostrando la última versión publicada hasta que se valide y publique — **sin** ofrecer publicar/validar desde aquí (pertenece a CAT-05/CAT-06).
- **Regla 2 (Destacados = beneficios):** el hint del apartado se reescribió a «Puntos fuertes o beneficios… No fijan precio ni stock y no sustituyen al inicio de la tienda» y una prueba acredita que la sección no contiene ningún campo editable de tienda (sin `type="number"` ni labels Precio/Stock/Existencias) — solo filas de frases.

**Evidencia real:**

- Backend: `product-sheet.spec.ts` **69/69** (+3 H5: guardado marca pendiente, 409 no marca, funciona sin el servicio inyectado); suite completa **94 suites / 1742 pruebas**, 12 fallos = solo baseline `public-products.spec.ts` (0 regresiones); tsc 0; eslint 0 errores (3 warnings preexistentes ajenos); build OK.
- e2e vivo `e2e-cat03.cjs` ampliado: **33/33** — incluye «editar la ficha marca revisión pendiente (H5)», «el 409 de OCC no crea revisión pendiente» y «la marca de pendiente NO cambia la presentación pública» (`publicRevisionId` NULL); el fixture queda sin revisiones residuales (limpieza determinista también al inicio).
- Frontend: `vitest` **72 archivos / 801 pruebas** (+6: 4 de `sheet-revisions.spec.ts` + 2 de render); tsc 0; eslint 0 errores; `vite build` OK.

**Limitación honesta:** el snapshot que `markPendingFromLive` guarda cubre los campos que CAT-02 definió (identidad + `catalogName/Model/Brand` + specs técnicos), no todos los campos de ficha (highlights/features/grupos); afinar el snapshot es trabajo de CAT-05 (motor de validación), no se inventó aquí.

## 14. Verificación `frontend-tecnicos` (estado real) — CERRADO (paquete completo)

**Qué se implementó:**

- **Notas internas en la UI (H1):** la vista de ficha trae `canSeeInternalNotes` (flag honesto: distingue «sin notas» de «sin permiso» — backend `toView` + spec). El apartado **Notas** pinta «Notas internas (privadas)» con aviso explícito («Nunca se publican: no salen a la tienda, ni al API público, ni a una exportación ordinaria…») **solo si el actor puede verlas**; sin permiso muestra «No tienes permiso… se conservan al guardar» y el payload **omite** la clave (`toPayload` con spread condicional → omitir = conservar). Con permiso, texto vacío = `null` explícito = borrar. Validación espejo del DTO: máx. 4000 caracteres.
- **Separación pública/privada:** los dos campos públicos pasan a etiquetarse «Aviso de especificaciones (público)» y «Nota de firmware (pública)».
- **Modelos sin variantes (regla 3):** la sección es solo la lista de referencias (`TextListEditor`); prueba de render: sin `type="number"` ni labels Precio/Stock/Existencias/Variante.
- **Sin PDF obligatorio (regla 4):** pruebas de `validateForm`: publicar con `resources: []` y `specGroups: []` no produce ningún error; la única exigencia al publicar sigue siendo el slug.
- **Sin duplicidad (regla 1):** las notas internas tienen su propio campo/almacenamiento; ningún dato se edita en dos sitios (mapa §3 cumplido en el editor).

**Evidencia real:**

- Backend: sheet **69/69** (aserciones `canSeeInternalNotes` en los tres escenarios de acceso); suite completa **94/1742** con 12 fallos = solo baseline; tsc 0; build OK.
- e2e vivo `e2e-cat03.cjs`: **34/34** — añade «la ficha señala que el actor PUEDE ver notas internas (UI honesta)».
- Frontend: `vitest` **72 archivos / 806 pruebas**; nuevos specs: notas visuales vs sin permiso, payload viaja/omite/conserva, límite 4000, Modelos sin campos de tienda, publicar sin PDF; tsc 0; eslint 0 errores; `vite build` OK.

**Estado del paquete:** los 5 incrementos de CAT-03 (contrato, backend, frontend-identidad, frontend-beneficios, frontend-tecnicos) quedan **implementados sin auditar**. QA-01 (recorridos de navegador real, dos pestañas concurrentes, y a quién se concede `products:notes` — D2) queda del coordinador. La limitación del snapshot legacy (§13) permanece documentada para CAT-05.
