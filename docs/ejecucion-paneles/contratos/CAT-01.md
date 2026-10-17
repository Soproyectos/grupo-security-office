# CAT-01 — Conservar Biblioteca al operar sobre listas (paso: contrato)

**Fecha:** 2026-10-15 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/CAT-01.md`; no modifica código, base de datos ni servicios activos (3000/5173/5432), no ejecuta commits y **no edita `estado.json` ni `tareas.json`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md`, este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada** (TANDA-COMPLETA:14: «esas propuestas quedan disponibles para la auditoría final, no se presentan como decisiones empresariales aprobadas»).

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa en este checkout (comandos en §11). |
| **IP** | Informe o diseño previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `CAT-01 contrato`, textual):** «Concretar duplicar, archivar, desvincular y eliminar sin perder fichas. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `BASE-02`. **OBS:** BASE-02 está **PROP** en esta tanda (contrato escrito, `docs/ejecucion-paneles/contratos/BASE-02.md`); `estado.json` solo contiene la aceptación `BASE-01/inventario` y `decisions: {}`, por lo que **la dependencia no está verificada**. Este contrato no verifica aceptaciones: ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (textuales):** (1) «Riesgo observado: borrar lista hoy elimina productos/medios. Cerrar conservación y referencias históricas antes de cambiarlo.» (2) «Duplicar copia configuración sin pertenencias; archivar no libera SKU. Vincular/desvincular exige acción específica.» (3) «Product.listaId cero/uno; resolver Price.listaId coherentemente; sin muchos-a-muchos, clones o reasignación implícita.»
- **Referencia de la ficha:** `docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md`, sección «duplicar, archivar, desvincular y eliminar sin perder fichas» (§4, §11, §13).
- **Aceptación del paso `contrato` (textuales):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.»

## 2. Estado actual de las operaciones (OBS)

### 2.1 Eliminar lista — el riesgo central de la regla 1

**Hoy `DELETE /api/listas/:id` destruye la Biblioteca de la lista.** `removeLista` (`src/backend/src/modules/listas/listas.service.ts:589-680`) ejecuta, tras exigir `confirm: true` (:635-641) y ser Super Admin/Admin Comercial (:595-597), una **transacción única** (:660-673) que borra en este orden:

| Paso | Ruta:línea | Qué se pierde |
|---|---|---|
| `assignment.deleteMany` (LISTA y PRODUCT) | `listas.service.ts:663-666` | accesos por lista y por producto |
| `productImage.deleteMany` | `listas.service.ts:667` | filas de imágenes de cada producto |
| `price.deleteMany` por `listaId` **o** por `productId in productIds` | `listas.service.ts:668-670` | **todos** los precios de esos productos, incluidos los de otras tarifas (`PriceList`) y los históricos |
| `product.deleteMany` | `listas.service.ts:671` | identidad de producto: `sku` único, nombre, categoría, marca, specs, documentos, campos de publicación |
| `lista.delete` | `listas.service.ts:672` | la lista |
| `files.deleteByUrl` (post-commit) | `listas.service.ts:675-677` | **bytes** de las imágenes del almacenamiento |

Además: el evento `delete` se audita antes del borrado con `productosEliminados` (:651-658); `AuditLog` no se borra (decisión comentada :564-567) y `AuditLog.productId`/`QuoteItem.productId` son `SetNull` (:586-587).

**Cascada real en el esquema (verificada en migraciones, no en `onDelete` de Prisma):**

| FK | Acción | Evidencia |
|---|---|---|
| `products_listaId_fkey` | **ON DELETE SET NULL** | `src/backend/prisma/migrations/20260814171500_lista_entidad_raiz/migration.sql:44` (relación Prisma `schema.prisma:195`, sin `onDelete` → default SetNull) |
| `prices_listaId_fkey` | **ON DELETE SET NULL** | misma migración `:52` (`schema.prisma:353`) |
| `quotes_listaId_fkey` | **ON DELETE RESTRICT** | `migrations/20260912000000_add_quotes/migration.sql:79`; `Quote.listaId` es **obligatoria** (`schema.prisma:647,665`) |

Es decir: **el esquema por sí solo desconectaría productos y precios (SET NULL) y prohibiría borrar listas con cotizaciones (RESTRICT); la destrucción real la ejecuta la aplicación en `:660-673`.** El propio comentario del servicio lo admite (:574-588): antes el método dejaba `listaId = null` y creaba huérfanos (por eso existe `prisma/cleanup-orphaned-list-products.ts`).

**Riesgos observados sin cubrir:**

- **R1 (destructivo):** borrar una lista borra productos, medios (filas **y** bytes) e históricos de precios. Contradice el criterio DISENO §13 «Eliminar/desvincular una lista conserva la Biblioteca y los históricos comerciales» (IP) y la regla 1 de la ficha.
- **R2 (500 no manejado):** `impact` solo cuenta productos/precios/accesos (:627-630); **no se comprueba `Quote.listaId`**. Si la lista tiene cotizaciones, `lista.delete` (:672) falla por FK RESTRICT → Prisma P2003 → la transacción revierte y el API responde **500**, no 409 (§6).
- **R3 (purga diferida sin ejecutor):** `deletionRequest` marca `deletionStatus='PENDING_DELETION'` y `deletionPurgeAt = +90 días` (:737-763, :779-806), pero **nadie lee `deletionPurgeAt` para purgar** (`rg deletionPurgeAt src/backend/src` → solo la escritura en `:746`). `prepareAuditSnapshot` (:833-859) es `private` y **no tiene llamadas** (rg: solo su definición). **DESC:** no se ejecutó la base para confirmar si existen listas ya marcadas.

### 2.2 Duplicar — ya cumple la regla 2 (OBS)

`duplicateLista` (`listas.service.ts:322-358`), exige `manage` (:325): crea una Lista con `name + ' (copia)'`, `code` único `base-COPIA-XXXX` (:360-374) y **solo campos de configuración** (`description/currency/type/defaultVisibility/validFrom/validUntil/responsibleId`, :331-346); `isActive: false` (:342) y devuelve `productCount: 0` (:357). El `create` **no escribe productos, precios ni assignments** (comentario :319-320). Auditoría `action: 'duplicate'` con `sourceId` (:348-355).

### 2.3 Archivar / restaurar — existe estado, con dos huecos (OBS)

- **Estado archivado real:** `Lista.archivedAt DateTime?` (`schema.prisma:114`) + `isActive` (:113), índices en `:138-139`. `archive` escribe `archivedAt = now` **y** `isActive = false` (`listas.service.ts:505-508`); `update` con `dto.archivedAt` hace lo mismo y exige `manage` (:413-418, :442-445).
- **H1:** `restore` solo pone `archivedAt: null` (`:535-538`) y **no repone `isActive`** → una lista archivada restaurada sigue inactiva.
- **H2:** archivar **no escribe productos ni precios** (solo `lista.update`, `:505-508`), así que hoy «archivar no libera SKU» se cumple por ausencia de escritura, no por una garantía explícita. `Product.listaId` no cambia (OBS: ninguna escritura relacionada en el método).
- **Efecto de acceso:** para no-admin, `assertListaAccess` devuelve **404** sobre lista inactiva/archivada (`common/acl/acl.service.ts:215-217`); `assertListaRestoreAccess` (:231-250) existe justamente para operar sobre ellas.

### 2.4 Desvincular producto — no existe (OBS)

- **No hay endpoint ni acción de desvincular/vincular:** `rg -n "unlink|desvincular" src/` sin coincidencias; ninguna ruta `:id/unlink` en `listas.controller.ts` ni `products.controller.ts`.
- **Reasignación implícita sí existe:** `PUT /api/products/:id` (`products/products.controller.ts:101-105`) acepta `UpdateProductDto.listaId` (`products/dto/update-product.dto.ts:37-42`, `@IsUUID`, **no admite `null`**) y `products.service.ts:693-701` lo resuelve autorizando además sobre la **nueva** lista («si se reasigna listaId, se autoriza además sobre la nueva»).
- **Imposible poner `listaId = null` por API:** `resolveLista` (`products.service.ts:1724-1740`) sin `listaId` **cae a `LISTA-GENERAL`**; el DTO no admite nulo. La regla 3 («sin reasignación implícita») y el ADR §«Archivo, duplicación y retirada» («Retirar un producto exige una acción explícita», IP) chocan con este camino.

### 2.5 Carga masiva: cómo asigna `Product.listaId` (OBS — `batch-executor.service.ts`)

| Hecho | Ruta:línea | Consecuencia |
|---|---|---|
| Lista destino validada solo por existencia (404) | `:398-410` | **no comprueba `isActive`/`archivedAt`** → se carga en lista archivada |
| Producto **nuevo** recibe `listaId` | `:327-340` (`:334`) | pertenencia al crear |
| Producto **existente** se actualiza **sin tocar `listaId`** | `:303-315` | una carga a otra lista **no mueve** el producto (cumple el caso 2 de forma implícita) |
| Pero sus precios **sí** se upsertean | `:317-320` → `:631-680` | escribe precios para un producto que no pertenece a la lista destino |
| `upsertPrices` **no escribe `Price.listaId`** | `:670-677` | precios importados quedan con `Price.listaId = null` (confirmado en `import.service.ts:473`) |
| El otro escritor **sí** lo escribe (`Price.listaId = Product.listaId`) | `products/products.service.ts:1766-1790` | **invariante de la regla 3 roto entre dos vías** |
| Dos criterios de consulta distintos | `listas.service.ts:158-161` (`Price.listaId`) vs `:131-132` (`product.listaId`) y `:609-612` | `findExpiringPrices` y el recuento de impacto **no ven** los precios importados; `findPrices` sí |
| La importación **no valida pertenencia** | `import/import.service.ts` sin `acl|archivedAt|isActive` (rg vacío); controller solo `@Roles` (`import.controller.ts:110,141`) | no se marca «conflicto de pertenencia» que pide el ADR:14 |

**Estado de los permisos (OBS):** en S3 existe `@Permissions('listas:create|duplicate|archive|delete|publish')` (`listas.controller.ts:111,123,149,157,165,182`; `products.controller.ts:329,339,349`), pero **`PATCH /api/listas/:id` (:134) y `PATCH /:id/toggle-active` (:141) no llevan `@Permissions`** (solo `RolesGuard`). **`access-catalog.ts` no existe en S3** (`ls src/backend/src/common/security/` sin el archivo); la copia de revisión `gs-tanda-01` (BASE-04/BASE-03 completos) sí lo tiene: `listas:read|create|update|duplicate|import|archive|delete|publish` (`access-catalog.ts:114-121`), `LISTA_SCOPES = ['list','global']` (:45), `listas:create` con `['global']` (:115) — y **sin `listas:link`/`listas:unlink`**.

## 3. Conservación (PROP)

Qué debe garantizar cada operación **antes** de que se toque el código (regla 1: «Cerrar conservación y referencias históricas antes de cambiarlo»):

| Operación | Garantía PROP | Base |
|---|---|---|
| **Eliminar lista** | Desaparece **solo la Lista**. `Product`, `ProductImage`, `UploadedFile` (bytes), `Price` y `Stock` **sobreviven con sus IDs intactos**; `Product.listaId` queda `null` (FK SET NULL ya existente); los accesos (`Assignment`) de esa lista se retiran. No se ejecuta ningún `deleteMany` sobre productos/imágenes/precios | §2.1; DISENO §13; ADR-20261014:25 |
| **Desvincular** | Acción explícita que pone `Product.listaId = null` sin borrar la ficha, sus medios ni sus precios; **no añade a otra lista**; no deja ofertas activas sin destino autorizado | DISENO §4 «Quitar de la lista»; ADR:23 |
| **Archivar** | Conserva pertenencia e históricos; **no libera el SKU** para otra lista ni habilita reasignación silenciosa; restaurar repondrá `archivedAt = null` **e `isActive`** (cierra H1) | ADR:23; regla 2 |
| **Duplicar** | Copia **solo configuración**; nace sin productos/precios/assignments; no clona referencias ni libera las de origen (ya es el comportamiento OBS §2.2) | ADR:23; DISENO §13 |
| **Carga masiva** | Nunca mueve `Product.listaId`; una referencia de otra lista → **conflicto marcado sin escritura de precios** (hoy falta, §2.5); una referencia sin lista solo se vincula con `listas:link` + permiso de precios; cargar en lista archivada queda denegado o bloqueado por regla explícita | ADR:14-17; DISENO §4 |

**Referencias históricas — mecanismo PROP (decisión abierta, §9 C1):** los `Price` y eventos antiguos deben poder consultar la lista de origen **después** de que deje de existir. Opciones sobre el hecho OBS: hoy la FK es `SET NULL` (los precios quedarían con `listaId = null` y la referencia se pierde) y las cotizaciones impiden el borrado (`RESTRICT`). **PROP de esta entrega:** mantener `Price.listaId` como referencia histórica **nullable**, añadir en la eliminación un **snapshot de conservación** (`listaId`, `code`, `name`, conteos) persistido en la fila de auditoría (reutilizando la estructura ya definida en `prepareAuditSnapshot`, `listas.service.ts:833-859`, hoy sin llamadas) y **rechazar con 409** la eliminación de listas con cotizaciones mientras no exista el flujo de resolución de `Quote.listaId`. **No se fija aquí `RESTRICT` vs `SET NULL` como decisión**: queda como decisión pendiente C1/C2 (§9), coherente con «sin muchos-a-muchos, clones o reasignación implícita» (regla 3).

## 4. Acciones y alcance (PROP)

| Operación | Acción PROP | Existe hoy | Alcance / dependencia visible |
|---|---|---|---|
| Consultar | `listas:read` | Catálogo solo en copia de revisión (§2.5) | `list|global`; raíz sin dependencias |
| Crear | `listas:create` | **Sí** (`listas.controller.ts:111`) | `global` (Super Admin / Admin Comercial) |
| Editar configuración | `listas:update` | Catálogo sí, **ruta sin `@Permissions`** (`:134`) | `list|global`; requiere `listas:read` (visible en el selector) |
| Duplicar | `listas:duplicate` | **Sí** (`:123`) | `list|global`; requiere `listas:read` |
| Archivar / restaurar | `listas:archive` (una acción, dos rutas) | **Sí** (`:149`, `:157`) | `list|global`; requiere `listas:read`; `manage` por ACL |
| **Vincular producto** | `listas:link` **(nuevo)** | **No** | `list|global`; requiere `listas:read` + permiso de precios de la lista |
| **Desvincular producto** | `listas:unlink` **(nuevo)** | **No** (§2.4) | `list|global`; requiere `listas:read`; acción específica, nunca implícita en una carga |
| Eliminar (física) | `listas:delete` | **Sí** (`:165`, `:182`) | `global`; requiere `listas:read` declarada |
| Publicar lista | `listas:publish` | **Sí** (`products.controller.ts:329,339,349`) | `global` |

- **Alcance por lista:** resuelto hoy por niveles ACL `view → view_prices → edit_prices → edit_products → manage → manage_access` (`acl.service.ts:19-33`) con **deny-by-default** por `Assignment` (`listas.service.ts:31-41`); `list` en el catálogo de la copia de revisión. **Alcance por concesión**, no global-sumado (BASE-02 §5).
- **Dependencias explícitas (IP PANELES:29, «si editar requiere ver, la pantalla lo explica»):** toda acción de escritura de §4 declara `['listas:read']` en el catálogo y el selector la muestra; el servidor la comprueba. Ningún permiso amplio se agrega en silencio.
- **Integración con BASE-02 §3.4 («Gestor de listas»):** este contrato concreta de esa fila «Consultar/Crear/Editar/Duplicar», «Vincular/Retirar productos» (→ `listas:link`/`listas:unlink`), «Archivar/Restaurar/Eliminar» (→ `listas:archive` + `listas:delete`). «Consultar/Editar precios», «Previsualizar/Aplicar importaciones» y «Aplicar actualización pública» quedan para IMP-05/IMP-06 y `listas:publish`. Habilitar estas acciones depende de que BASE-02/COM-01 resuelva D2 (catálogo propio vs catálogo UA) — **no se habilita ninguna aquí**.

## 5. Casos de paquete de la ficha (los 3 textuales) y su acreditación

| # | Caso (ficha, textual) | Cómo se acreditará (PROP; no es evidencia todavía) |
|---|---|---|
| 5.1 | «Eliminar/desvincular/archivar conserva identidad, medios e históricos.» | **PostgreSQL desechable** con fixtures ficticios: producto con SKU+imagen(`UploadedFile`)+precios en dos tarifas+`AuditLog` y una cotización referenciada. Ejecutar `DELETE` (con `confirm`), `listas:unlink` y `PATCH archive`; asertar IDs de `products`/`product_images`/`uploaded_files`/`prices` intactos, `Product.listaId = null` en desvincular, `archivedAt` set sin tocar productos, bytes descargables. Negativas: sin `confirm` → 400; sin `listas:delete` → 403; lista con cotización → **409** (PROP, hoy 500) |
| 5.2 | «Carga a otra lista, incluida archivada, no mueve producto.» | `batch-executor.service.spec.ts` (writePath de la ficha) contra Prisma real: producto en lista A; `execute` con `ctx.listaId` = lista B (y variante archivada) → `Product.listaId` sigue en A, se marca conflicto de pertenencia **sin** escritura de precios, y el acceso a lista archivada queda denegado por regla explícita |
| 5.3 | «Concurrencia entre vínculo manual/cargas conserva unicidad y eventos.» | Dos conexiones simultáneas: `PUT /products/:id` con `listaId = B` y un batch hacia la lista C → exactamente una gana y la otra recibe **409** (PROP); se conservan `@@unique`/índice `products_sku_normalized_key` (`schema.prisma:147-150,158`) y ambos eventos en auditoría con actor y resultado |

## 6. Errores (OBS — patrón existente)

| Código | Cuándo hoy | Evidencia |
|---|---|---|
| 400 | Falta `confirm: true`; `validFrom > validUntil`; claves de estado enviadas al producto | `listas.service.ts:636`, `:719`; `products.service.ts:669-672` |
| 401 | Sin JWT / sesión revocada (guard global) | **IP** BASE-02 §7; guards en `app.module.ts:81-97` |
| 403 | No es Super Admin/Admin Comercial para crear/eliminar; nivel ACL insuficiente | `listas.service.ts:226`, `:596`; `acl.service.ts:208` |
| 404 | Lista inexistente; **lista ajena, inactiva o archivada** (se oculta la existencia); responsable inexistente; lista destino inexistente en carga | `listas.service.ts:603`, `:706`; `acl.service.ts:204,215-217`; `batch-executor.service.ts:406-408` |
| 409 | Código/código de identificación duplicado; `PENDING_DELETION`; `LISTA_PENDIENTE_ELIMINACION`; SKU duplicado | `listas.service.ts:233,240,388,422,470,498,592,801`; `products.service.ts:681-685,711` |
| **500 (hueco)** | Lista con cotizaciones al borrar (FK RESTRICT sin precomprobar) | §2.1 R2 → **PROP: convertir en 409** con motivo explícito |

## 7. Incrementos posteriores registrados (fichas, textuales) y solape

**Aceptación idéntica en ambos pasos (ficha, textual):** «Eliminar/desvincular/archivar conserva identidad, medios e históricos.» + «Carga a otra lista, incluida archivada, no mueve producto.» + «Concurrencia entre vínculo manual/cargas conserva unicidad y eventos.»

| Incremento | Depende de | Objetivo (ficha) | Archivos (ficha) |
|---|---|---|---|
| **CAT-01 `backend`** | BASE-02 | «Completar el alcance de servidor de este paso y sus pruebas. Si no cabe en una entrega revisable, el coordinador registra todos los subpasos antes de delegar código.» | `modules/listas/**`, `products/import/pipeline/batch-executor.service.ts` + `.spec.ts`, `prisma/schema.prisma`, `prisma/migrations/**`, `common/security/access-catalog.ts` + `.spec.ts` |
| **CAT-01 `frontend`** | BASE-02 | «Conectar la interfaz al contrato de servidor auditado y verificar su recorrido; sin cambiar reglas desde el navegador.» | `pages/ListasPage.tsx` + spec, `pages/ListaDetailPage.tsx` + spec, `services/listas.service.ts` + spec |

**Solape con CAT-02…CAT-09 (writePaths de sus fichas, revisados sin escribirlos):**

| Archivo compartido con CAT-01 | Paquetes que lo tocan |
|---|---|
| `prisma/schema.prisma` + `migrations/**` | CAT-02 (`backend-esquema/borradores/publico/alternativas`), CAT-04 `backend-activos`, CAT-05 (`backend-reglas/api`), CAT-06 `backend`, CAT-07 `backend`, CAT-08 `backend` |
| `common/security/access-catalog.ts` + spec | CAT-05 (`backend-reglas/api`), CAT-06 `backend`, CAT-07 `backend`, CAT-08 `backend` |
| `modules/products/**` | CAT-02 (los 4 pasos), CAT-03 `backend`, CAT-04 `backend-activos`, CAT-05 (`products.service/controller/module`) |
| `pages/ListaDetailPage.tsx` | CAT-07 `frontend` |
| `modules/listas/**`, `batch-executor.service.ts` | **sin solape**: solo CAT-01 |

**Cadena hacia atrás/adelante:** `IMP-05` depende de `CAT-01` (BASE-02 §9); CAT-02 depende de CAT-01. **PROP:** migraciones de `schema.prisma` y entradas de `access-catalog.ts` de CAT-01 deben dejar la tabla/acción preparadas pero **sin habilitar** acciones nuevas hasta que BASE-02/COM-01 resuelva D2.

## 8. Fuentes leídas con estado

| Fuente | Marca | Aporte |
|---|---|---|
| `src/backend/src/modules/listas/listas.service.ts` (860) | **OBS** | §2.1-2.4: cascada de `removeLista`, duplicar, archivar/restaurar, purga sin ejecutor |
| `src/backend/src/modules/products/import/pipeline/batch-executor.service.ts` (747) | **OBS** | §2.5: `listaId` al crear, no al actualizar, precios sin `listaId` |
| `src/backend/prisma/schema.prisma` (1026) | **OBS** | `Lista:107-143`, `Product:145-210`, `PriceList:323-340`, `Price:342-363`, `Quote:642-680` |
| `migrations/20260814171500_lista_entidad_raiz/migration.sql:44,52` y `20260912000000_add_quotes/migration.sql:79` | **OBS** | FK SET NULL / RESTRICT reales |
| `src/backend/src/modules/listas/listas.controller.ts` | **OBS** | Rutas y `@Permissions` existentes; `:134/:141` sin `@Permissions` |
| `src/backend/src/common/acl/acl.service.ts` | **OBS** | 404/403 y niveles `LEVEL_ORDER:19-26` |
| `src/backend/src/modules/products/products.service.ts` / `dto/update-product.dto.ts` | **OBS** | Reasignación `PUT :id`, fallback `LISTA-GENERAL`, `upsertPrices` con `listaId` |
| `src/backend/src/common/security/` (S3) | **OBS** | **`access-catalog.ts` ausente** |
| `gs-tanda-01/.../security/access-catalog.ts:41-45,114-121` (copia de revisión) | **OBS** | Catálogo con `listas:*` ya resuelto por BASE-04/BASE-03; sin `link/unlink` |
| `docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md` (427) | **IP** | §1 regla lista única; §4 quitar/vincular; §11 (`:361` «Debe cambiar su contrato»); §13 criterios |
| `docs/adr/ADR-20261014-producto-una-sola-lista.md` | **IP** (decisión de producto confirmada 14-10) | Cero/una lista; archivo/duplicación/retirada; `Price` único por producto/tarifa |
| `docs/adr/ADR-002-biblioteca-vitrina.md:3,158,164` | **IP histórica** | Multilistado antiguo **reemplazado** por el ADR anterior |
| `docs/PANELES-Y-PERMISOS.md` | **IP** (acuerdo 2026-10-08) | Acciones concretas, dependencias visibles, publicar/editar/eliminar por separado |
| `docs/ejecucion-paneles/contratos/BASE-01.md`, `BASE-02.md`, `IMP-01.md` | **OBS/IP** | Estructura, marcas, catálogo §3, decisiones B1-B4/D1-D6 |
| `estado.json` | **OBS** | Solo `BASE-01/inventario` aceptada; `decisions: {}` |
| `docs/ejecucion-paneles/TANDA-COMPLETA.md:14,32,38` | **OBS** | Modalidad, bloqueos, entrega única |

## 9. Decisiones pendientes y bloqueos

| # | Decisión o bloqueo | Afecta | Estado |
|---|---|---|---|
| C1 | **Mecanismo de referencias históricas al eliminar una lista**: snapshot en auditoría + `Price.listaId` nullable vs `RESTRICT` total vs soft-delete de la lista (el diseño solo dice «Debe cambiar su contrato», DISENO:361; el ADR dice «deben resolverse coherentemente», ADR:25) | `removeLista`, §3 | **Pendiente — coordinador** (no fijada aquí) |
| C2 | **Destino de `Quote.listaId`** si algún día se permite purgar listas con cotizaciones (hoy RESTRICT = 500) | `listas:delete`, §2.1 R2 | **Pendiente** |
| C3 | **Unificar `Price.listaId`**: quién lo rellena (`batch-executor` no, `products.service` sí) y qué criterio usan `findExpiringPrices`/impacto de borrado | regla 3, §2.5, casos 5.2/5.3 | **Pendiente** |
| C4 | **Acciones nuevas `listas:link`/`listas:unlink`**: habilitarlas exige resolver BASE-02 D2 (catálogo propio en S3 vs catálogo UA) y crear `access-catalog.ts` en S3 | §4, CAT-01 `backend` | **Bloqueo heredado D2** |
| C5 | **`restore` no repone `isActive`** (H1): definir si restaurar reactiva la lista o exige `toggle-active` aparte | §2.3, CAT-01 | **Pendiente — decisión funcional** |
| C6 | **Purga diferida de 90 días sin ejecutor** ni snapshot llamado | §2.1 R3 | **Pendiente** |
| C7 | **Carga en lista archivada/sin ACL** en importación (`import.service.ts` sin comprobaciones) | caso 5.2 | **Pendiente** |
| B1-B4 | Heredados de BASE-02 §11 (Yéminus, Excel «Pedidos», descuentos, preview de precios) | no cambian aquí | **Pendientes** |
| D5 | Segundo `@Controller('api/listas')` en `products.controller.ts:319` sin verificar en runtime (BASE-02 §11) | rutas de `listas:*` | **DESC** |

## 10. Criterios de aceptación del paso (ficha, textuales)

1. ✅ «Contrato consistente con dependencias y decisiones pendientes explícitas.» — §1 declara `dependsOn: BASE-02` **PROP/no verificado en `estado.json`**; §9 enumera C1-C7 + B1-B4 + D5.
2. ✅ «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.» — §7 registra `CAT-01 backend` y `CAT-01 frontend` con sus fichas y el solape con CAT-02…CAT-09.

**Advertencia de modalidad (TANDA-COMPLETA):** todo lo marcado **PROP** es una propuesta para la **auditoría final única** del coordinador; no sustituye `estado.json`, no modifica aceptaciones y no autoriza implementación, migraciones ni despliegues.

## 11. Evidencia reproducible

Comandos desde la raíz del repo (solo lectura):

```bash
git status --porcelain; git rev-parse --short HEAD
node docs/ejecucion-paneles/preparar-tanda.mjs CAT-01 contrato|backend|frontend
rg -n '^model (Lista|Product|Price|PriceList|Quote) \{' src/backend/prisma/schema.prisma
rg -n 'REFERENCES "listas"' src/backend/prisma/migrations -g '*.sql'
rg -n 'onDelete' src/backend/prisma/schema.prisma
rg -n '@Permissions' src/backend/src/modules/listas/listas.controller.ts src/backend/src/modules/products/products.controller.ts
rg -n 'unlink|desvincular' src/                          # sin coincidencias
rg -n 'deletionPurgeAt|prepareAuditSnapshot' src/backend/src # solo escritura/definición
rg -n 'acl|archivedAt|isActive' src/backend/src/modules/products/import/import.service.ts  # vacío
test -f src/backend/src/common/security/access-catalog.ts || echo MISSING   # MISSING en S3
rg -n 'listas:' /home/soporte/office_ai/gs-tanda-01/src/backend/src/common/security/access-catalog.ts
```

- **No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP con permisos, pruebas con PostgreSQL desechable, consulta de datos reales. §5 lista las pruebas **previstas**, no realizadas.

## 12. Riesgos de este contrato

- Cambiar `removeLista` sin cerrar C1/C2 puede romper cotizaciones o perder el rastro histórico de listas borradas (R1/R2).
- Añadir `listas:link/unlink` al catálogo antes de que exista `access-catalog.ts` en S3 deja acciones declaradas que ningún guard evalúa (C4).
- Dejar `Price.listaId` con dos escritores distintos haría que casos 5.2/5.3 se aprueben hoy por casualidad y fallen después (C3).
- Aprobar el contrato sin revisar el solape de `schema.prisma`/`access-catalog.ts` con CAT-02…CAT-08 provocará migraciones y entradas de catálogo en conflicto (§7).
