# CAT-04 — Versionar imágenes, documentos y firmware

- **Paquete:** CAT-04 «Versionar imágenes, documentos y firmware» (lane `catalog`), depende de **CAT-02** (y enlazado con CAT-03, que ya trata `ProductCatalogResource` como referencia).
- **Modalidad:** tanda continua; **QA-01 y la auditoría son del coordinador**. Este contrato no acepta pasos: los prepara.
- **Referencia de diseño:** `docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md` — reglas verificadas: `:212` («los archivos usados por una publicación no se sustituyen ni borran al editar el borrador; se crean versiones nuevas»), `:267` (firmware es activo opcional de descarga, NUNCA ejecutado/descomprimido por el servidor; su carga exige inventario previo de formatos — insumo externo), `:319` (registro de activos con ID, hash, tipo real, tamaño, uso público/privado; reutilizar `UploadedFile`/PostgreSQL; asociaciones de versiones para que editar no rompa lo publicado), `:345` (la eliminación física exige comprobar que ninguna revisión pública/histórica referencia el archivo).
- **Reglas de la ficha (tareas.json):** reutilizar `UploadedFile`/bytes PostgreSQL inicialmente, sin otra cuenta de almacenamiento; tipo real/tamaño/hash y autorización de descarga; distinguir imagen, documento y firmware; **no borrar bytes referenciados por otra revisión**; ampliaciones de Modelos/firmware son baja prioridad y necesitan contrato específico.

## 1. Meta, reglas y límites

Objetivo: que los **activos** (imágenes, documentos, firmware) de un producto puedan subirse/versionarse con verificación real (tipo/tamaño/hash), descargarse con **autorización** cuando son privados/con licencia, y que editar **no rompa la revisión publicada anterior** ni borre bytes referenciados.
Casos de la ficha (aceptaciones raíz):
1. **Sustituir imagen no rompe la revisión pública anterior.**
2. **Medio privado inaccesible por ID/URL directa** y por exportación no autorizada.
3. **Archivos inválidos se rechazan; un fallo de asociación no deja publicación parcial.**

Límites (no invadir otros paquetes):
- **No** construir el flujo de publicación/validación (CAT-05/CAT-06) — aquí solo la mecánica de versión de activos y retención de bytes.
- **No** aceptar subida de firmware por UI en este paquete: `:267` fija como precondición un inventario de formatos, lista permitida, tamaño máximo, origen y revisión de seguridad — **insumo externo pendiente** (se documenta como alcance diferido, no como bloqueo del paquete: la subida de imágenes/documentos no depende de ella).
- **No** mover bytes a otro almacenamiento ni introducir CDN/cuentas externas.
- **No** rediseñar la ficha pública.

## 2. Estado actual (OBS — copia de revisión `gs-tanda-01`)

### 2.1. Lo que YA existe (reutilizable)

| Pieza | Realidad hoy | Evidencia |
|---|---|---|
| Almacén de bytes | `UploadedFile { id uuid, mimeType, data Bytes, createdAt }` en PostgreSQL — sin tamaño, hash, tipo real, uso ni visibilidad | `prisma/schema.prisma:441-448` |
| Servicio | `FilesService.store(buffer, mime) → {id, url:'/api/files/:id'}`; `get(id)`; `deleteByUrl(url)` **borra físicamente sin comprobar referencias** | `src/modules/files/files.service.ts` |
| Serve | `GET /api/files/:id` es **`@Public()`** con `Cache-Control: public, immutable` — cualquier archivo subido es accesible por URL directa | `src/modules/files/files.controller.ts:12-14` |
| Imágenes | `ProductImage { productId, url, alt, isPrimary, sortOrder, type }`; `POST /products/:id/images` (8 MB, `ALLOWED_IMAGE_MIMETYPES`, ACL `edit_products` **solo si tiene Lista**), `DELETE /products/images/:imageId` (borra registro **y bytes**), `PATCH` (alt/isPrimary) | `products.controller.ts:230-280`; `products.service.ts:1605-1667` |
| Documentos (legacy) | `Product.documents Json` (`any[]` sin validación en el DTO), editado por `PUT /products/:id` y `ProductDocumentsSection` (pega `{name,url,type}`) | `dto/update-product.dto.ts:60`; `features/products/sheet/ProductDocumentsSection.tsx:141-156` |
| Recursos de ficha | `ProductCatalogResource { kind, title, language, url, fileName, version, region, requiresLicense, position }` — URL pegada (http(s) o `/api/…`), sin subida; `requiresLicense` solo viaja al mapper público **sin ninguna aplicación** | `schema.prisma:257-273`; `product-sheet.dto.ts` (SHEET_URL_REGEX); `rg requiresLicense` → solo dto/mapper/sheet service |
| Revisión pública (CAT-02) | `ProductRevision.content` + lente: `LENS_FIELDS = ['sku','name','description','technicalSpecs','documents','catalogName','catalogModel','catalogBrand']` — **las imágenes y los recursos de ficha NO viajan en el snapshot** | `src/modules/products/public-revision-lens.ts:15` |
| Marca/logos | `brands.controller` también sube vía FilesService (8 MB) — mismo almacén, misma URL pública | `brands.controller.ts:58` |

### 2.2. Huecos reales detectados (a cubrir por CAT-04)

| # | Hueco | Consecuencia frente a la ficha |
|---|---|---|
| G1 | `UploadedFile` no registra **tamaño/hash/tipo real/uso/visibilidad** (el `mimeType` es el declarado por el cliente; el check de imagen solo mira ese campo) | «Tipo real/tamaño/hash» y «distinguir imagen, documento y firmware» no se cumplen; un archivo falso-rotulado se almacena/sirve tal cual. |
| G2 | `GET /api/files/:id` es `@Public()` y **no existe el concepto de medio privado**; `requiresLicense` es decorativo | El caso «medio privado inaccesible por ID/URL directa» es **imposible** hoy: conocer el id equivale a poseer el archivo. |
| G3 | `deleteByUrl` borra bytes **sin comprobar referencias** (otras imágenes vivas, recursos de ficha, `documents`, contenido de revisiones) | Viola diseño `:212`/`:345`: sustituir/borrar una imagen usada por una revisión publicada anterior **rompe** esa revisión (URL muerta). |
| G4 | El snapshot de revisión **no incluye imágenes ni recursos**; el público lee siempre la fila viva | «Sustituir imagen no rompe la revisión pública anterior» y «la vista/guardado de borrador conserva la imagen publicada anterior» no pueden acreditarse. |
| G5 | `uploadImage` **no es atómico**: `store()` (crea UploadedFile) y luego `create(ProductImage)`; un fallo intermedio deja bytes huérfanos (publicación parcial de hecho) | Caso 3 («fallo de asociación no deja publicación parcial») no se cumple. |
| G6 | No hay subida de documentos/recursos de ficha (solo pegar URL) | Sin origen de archivos verificados ni de medios privados; la «descarga autorizada» carece de objeto. |

## 3. Modelo de activos → almacenamiento (PROP)

| Activo | Fuente de verdad | Visibilidad propuesta | Notas |
|---|---|---|---|
| Imagen de producto | `ProductImage.url → UploadedFile` | **PÚBLICA** (es contenido de tienda) | Entra al snapshot de revisión (§3.2) para no romper lo publicado. |
| Documento público (datasheet/manual/certificado) | `ProductCatalogResource(kind DATASHEET..)` y legacy `Product.documents` | **PÚBLICA** | PDF **opcional**: nada exige recursos para publicar (CAT-03 §14 ya probado). |
| Firmware / recurso con licencia | `ProductCatalogResource(kind FIRMWARE…, requiresLicense=true)` | **PRIVADO** (`UploadedFile.visibility=PRIVATE`, dueño = producto) | La **subida** de firmware queda diferida (`:267` exige inventario de formatos — insumo externo). La *autorización de descarga* sí se implementa: al guardar un recurso `requiresLicense` cuyo URL apunte a `/api/files/:id`, el archivo pasa a PRIVADO con `ownerProductId`. |
| Logo de marca y otros usos | misma tabla | **PÚBLICA** (compatibilidad) | Sin cambios de semántica; solo metadatos nuevos. |

### 3.2. Columnas nuevas en `UploadedFile` (aditivas y reversibles — D1)

`sizeBytes Int?` · `sha256 String?` (hex lowercase del contenido) · `detectedKind String?` (`IMAGE|PDF|ZIP|UNKNOWN`, por firma mágica: PNG/JPEG/WEBP/GIF → IMAGE; `%PDF` → PDF; `PK\x03\x04` → ZIP) · `originalName String?` · `visibility String @default("PUBLIC")` (`PUBLIC|PRIVATE`) · `ownerProductId String?` (sin FK dura para no atar el borrado del dueño; índice). **No** se rellenan retroactivamente las filas antiguas: quedan `visibility=PUBLIC` con metadata NULL (compatibilidad K4 y caché immutable).

### 3.3. Snapshot por revisión (D2)

- `content.images`: lista ordenada `[{ url, alt, isPrimary, type, sortOrder }]` — la construye **el servidor** desde `ProductImage` al crear/guardar borrador y en `markPendingFromLive` (el cliente no la manda: no se confía en contenido de cuerpo).
- `content.catalogResources`: lista `[{ kind, title, language, url, fileName, version, region, requiresLicense, position }]` — misma política.
- `LENS_FIELDS` pasa a incluir `images` y `catalogResources` (el lente pisa `row.images` con el snapshot cuando la revisión pública existe; sin revisión, comportamiento vivo intacto). **Los precios nunca entran** (CAT-02).

### 3.4. Retención de bytes (D3)

Nuevo `FilesService.release(url)`: antes de borrar físicamente, cuenta referencias vivas + históricas:
1. `product_images.url = url` (cualquier producto) · 2. `product_catalog_resources.url = url` · 3. `products.documents @>` contención JSONB del URL · 4. `product_revisions.content::text LIKE '%url%'` (texto del snapshot — basta para retención conservadora; el índice/text-search se pospone, documentado).
Si **cualquiera > 0 → NO borra bytes** (devuelve `{ retained: true }`) y audita `file-retained`. Si 0 → borra. `deleteImage` pasa a usar `release` (ningún borrado duro desde rutas de producto). La **GC de huérfanos** no se implementa aquí (requiere política de retención del coordinador — se registra).

### 3.5. Descarga autorizada (D4)

`GET /api/files/:id`: si la fila es `PUBLIC` → como hoy (inmutable). Si es `PRIVATE` → exige sesión válida y ACL `view` sobre `ownerProductId` (patrón `AclService.assertProductAccess`, con Super Admin exento); sin sesión → 401; sin acceso → 403; `Cache-Control: private, no-store`. **Verificación exigida al implementar:** el guard de auth debe aceptar la cookie `access_token` httpOnly (navegador) además de Bearer — si hoy no la acepta, se amplía SOLO esa ruta (no se relaja el resto).

### 3.6. Subida (caso 3, atómica — D5)

Nuevo `POST /products/:id/assets` (multipart `file`, tipo deseado `IMAGE|DOCUMENT`): valida tamaño (≤8 MB imagen, ≤16 MB documento), **detecta el tipo real** y lo compara con el declarado (discrepancia → 400 `asset-type-mismatch`), guarda `UploadedFile` con metadata y crea la fila (`ProductImage` o `ProductCatalogResource`) **en una sola transacción** (interactivo `$transaction`, patrón del pipeline de importación); fallo de asociación = rollback, sin huérfanos. `uploadImage` existente pasa por el mismo camino (compatibilidad de ruta conservada). **No** se acepta `FIRMWARE` por subida (alcance diferido §1) — se responde 400 con motivo explícito.

## 4. Acciones y alcance (PROP)

- Reutilizar el catálogo existente: subir/editar/borrar activos exige **`products:write`** (con transición **D5**: sin grants, la capa @Roles+ACL `edit_products` vigente; con grants, la acción obligatoria — mismo patrón de CAT-03 backend), y ver **un medio privado** exige acceso de **lectura al producto dueño** (no una acción nueva).
- **No** se añade `files:*` al catálogo: la autoridad es el producto dueño (documentado; si el coordinador prefiere acción propia, es reversible).
- El alcance por Lista se respeta vía `assertProductAccess` (productos sin Lista: capa rol+acción, como en CAT-03 §11.3).

## 5. Aceptaciones por incremento (ficha textual) y acreditación (PROP)

| Incremento | Aceptación (ficha) | Acreditación prevista |
|---|---|---|
| `contrato` | Este documento | OBS verificada con evidencia de líneas; casos de la ficha mapeados a G1-G6; decisiones D1-D5 técnicas y reversibles documentadas |
| `backend-activos` | «Medio privado inaccesible; no elimina bytes referenciados por otras revisiones.» | Spec+HTTP: subir imagen → metadata correcta (size/sha256/kind) y round-trip; tipo real ≠ declarado → 400 sin guardar; imagen → 201 atómico (fallo de create = 0 huérfanos, probado inyectando fallo); archivo `PRIVATE` por fixture: 401 sin sesión, 403 con usuario sin acceso (concesiones reales), 200 con quien tiene acceso al producto dueño; `release()` conserva bytes referenciados por `product_images`/recursos/`documents`/revisión y borra solo sin referencias; snapshot: `content.images`/`catalogResources` construidos por servidor + lente pisa `row.images`; `markPendingFromLive` incluye imágenes |
| `frontend-imagenes` | «Vista/guardado de borrador conserva imagen publicada anterior.» | Spec puro + render: utilidad `publishedImageNotice()` (compara borrador vivo vs `content.images` de la revisión publicada del lente); la sección Fotos muestra la imagen publicada vigente separada del borrador y el guardado de borrador no la altera (el PUT nunca toca `publicRevisionId`) |
| `frontend-documentos` | «PDF opcional; descarga autorizada. Ampliaciones de Modelos/firmware se posponen, sin bloquear publicar.» | Spec: sin recursos NO bloquea guardar/publicar (CAT-03 §14 probado — se reafirma); badge «requiere autorización» en recursos `requiresLicense` y aviso de que la descarga exige acceso; subida de documento cableada al endpoint de activos; Modelos/firmware siguen sin campos de tienda ni subida (probado en CAT-03); sin renderizado de binarios |

## 6. Errores (PROP)

`400` archivo inválido/tipo real no coincidente/tamaño excedido/firmware por subida aún no admitido (motivo explícito) · `401` sesión requerida para medio privado · `403` sin acceso al producto dueño · `404` archivo/producto inexistentes · `409` producto sin Lista editable pendiente-de-eliminación (heredado de ficha). **No** hay 409 por borrado: el borrado referenciado es **retención silenciosa + auditoría** (nunco destruye ni miente).

## 7. Incrementos (fichas textuales)

| Paso | Objetivo | WritePaths (tareas.json) |
|---|---|---|
| `contrato` | Este documento | `docs/ejecucion-paneles/contratos/CAT-04.md` |
| `backend-activos` | Metadata+verificación real, `release()` referencial, snapshot de imágenes/recursos, ruta privada con auth, subida atómica | `src/backend/src/modules/files/**`, `src/backend/src/modules/products/**`, `prisma/schema.prisma`, `prisma/migrations/**` |
| `frontend-imagenes` | Fotos: borrador vs publicada vigente | `src/frontend/src/features/products/**`, `src/frontend/src/pages/ProductDetailPage.tsx(+spec)` |
| `frontend-documentos` | Documentos: subida verificada, PDF opcional, aviso de descarga autorizada | idem |

**Solape:** `modules/products/**` y `schema/migrations` (CAT-03 terminó hoy; CAT-05/06 después) — migración propia con timestamp + `prisma generate` + aplicar a las 7 BDs desechables. BD: URL inline + guard (protocolo de la tanda).

## 8. Decisiones pendientes y bloqueos

| # | Decisión | Estado |
|---|---|---|
| D1 | Columnas aditivas de `UploadedFile` (metadata/visibility/owner) | **Técnica del paso `backend`** (reversible; sin relleno retroactivo) |
| D2 | Imágenes y recursos viajan en el snapshot los construye el servidor | **Técnica del paso `backend`** (extiende el contrato CAT-02 de contenido; no cambia publicRevisionId) |
| D3 | `release()` conservador (retención + auditoría; GC pospuesta) | **Técnica**; la política de retención/GC definitiva es del coordinador |
| D4 | Medio privado = dueño producto; sin acción `files:*` nueva | **Propuesta**; si el coordinador quiere acción propia, se añade sin romper D3/D5 |
| D5 | Subida atómica por `$transaction` | **Técnica** (patrón existente del pipeline de importación) |
| E1 | **Subida de firmware diferida**: `:267` exige inventario de formatos/usados, lista permitida, tamaño máximo, origen y revisión de seguridad — **insumo externo no documentado**. No bloquea el resto del paquete; no se inventa. | `alcance_diferido` |
| E2 | GC de huérfanos y límites de cupo por producto | Pendientes de política (fuera de esta tanda) |

## 9. Criterios de aceptación del paso (`contrato`)

1. Consistente con CAT-02 (lente/snapshot) y con CAT-03 (recursos de ficha, D5 de permisos) sin reabrirlos.
2. Los 3 incrementos con objetivo, `writePaths` y aceptación propios (§5/§7).
3. Los 3 casos de la ficha quedan cubiertos por huecos verificados (G1-G6) y aceptaciones acreditables, sin inventar reglas de negocio (firmware: alcance diferido con motivo).
4. Estado real declarado sin maquillar (serve público, borrado duro, sin hash, lente sin imágenes).
5. Aviso de modalidad: PROP; QA-01 del coordinador.

## 10. Evidencia reproducible

```bash
# almacén y serve públicos
rg -n "@Public|deleteByUrl|immutable" src/backend/src/modules/files/files.controller.ts src/backend/src/modules/files/files.service.ts
# schema sin metadata
rg -n "model UploadedFile" -A 8 src/backend/prisma/schema.prisma
# borrado duro de bytes al quitar imagen
rg -n "deleteByUrl" src/backend/src/modules/products/products.service.ts
# lente sin imágenes/recursos
rg -n "LENS_FIELDS" src/backend/src/modules/products/public-revision-lens.ts
# requiresLicense decorativo (solo dto/mapper/sheet)
rg -rn "requiresLicense" src/backend/src --glob "*.ts" | rg -v "spec|schema"
# subida no atómica
sed -n '1605,1653p' src/backend/src/modules/products/products.service.ts
```

## 11. Verificación `backend-activos` (estado real) — CERRADO

**Qué se implementó (según §3):**

- **D1 (G1):** migración `20261017160000_add_uploaded_file_metadata` (+down, aplicada a las **7 BDs desechables**) — columnas aditivas `sizeBytes`, `sha256`, `detectedKind`, `originalName`, `visibility` (default `PUBLIC`), `ownerProductId` + índices; **sin relleno retroactivo** (las filas antiguas quedan públicas con metadata NULL, K4 + caché immutable intactos). `FilesService.store()` calcula SIEMPRE tamaño real, sha256 hex y tipo por **firma mágica** (helper puro `file-signature.ts`: PNG/JPEG/GIF/WEBP→IMAGE, `%PDF`→PDF, `PK\x03\x04`→ZIP, resto UNKNOWN).
- **D5 (G5, caso 3):** `uploadImage` pasa a **transacción única** (store con `tx` + `productImage.create`; el `isPrimary` updateMany también dentro) — sin huérfanos. Verificación de contenido real ANTES de guardar: declarado-imagen-cuyo-contenido-es-PDF → **400 `asset-type-mismatch`** con `feedback` y **cero escrituras**. Nuevo `POST /products/:id/assets` (IMAGE|DOCUMENT; DOCUMENT valida `declaredMatchesDetected`, dueño = producto, devuelve registro `{sizeBytes, sha256, detectedKind}`). **FIRMWARE → 400 `firmware-upload-deferred` con motivo** (E1, diseño :267) — no se inventa la lista de formatos.
- **D3 (G3, caso 1):** `FilesService.release(url, {userId, excludeImageId})` cuenta referencias vivas (imágenes — excluyendo la fila que se borra — y recursos) e históricas (`products.documents` y `product_revisions.content` por contención de texto): si queda ALGUNA, los bytes **se retienen** (nunca 409: el borrado lógico del dueño procede) y se audita `file-retained`. `deleteByUrl` delega en `release` — ningún llamador puede ya destruir bytes referenciados.
- **D4 (G2, caso 2):** `GET /api/files/:id` conserva `@Public()` SOLO para archivos PUBLIC (los `<img>` cross-origin de la tienda no se rompen); los **PRIVATE** exigen sesión + acceso al producto dueño con la misma dureza que `jwt.strategy` (token de desafío `scope` → 401, usuario inactivo → 401, sesión revocada `jti` → 401, sin token → 401, sin acceso → lo que el ACL niega **sin revelar** — 404 por diseño fail-closed), cabeceras `private, no-store` y `Content-Disposition: attachment`; privado **sin dueño** → 403 fail-closed. La marca inicial la hace el guardado de ficha: recurso `requiresLicense` con URL `/api/files/<id>` → archivo PRIVATE con dueño (sin robar propiedades de otros productos; los que pierden licencia vuelven a PUBLIC en la misma transacción).
- **D2 (G4, caso 1):** `content.images` y `content.catalogResources` los construye **el servidor** (`buildMediaSnapshot`, orden `sortOrder`/`position`, incluye ids) en `saveDraft` (el cuerpo del cliente no puede forjarlos) y en `markPendingFromLive`; `LENS_FIELDS` los pisa en la lectura pública cuando la revisión publicada los define (snapshots CAT-02 sin imágenes → comportamiento vivo intacto).
- **§4 permisos:** subida/borrado de activos con transición **D5** (helper común `common/security/d5-action.ts`: sin grants → @Roles+ACL `edit_products` existente; con grants → `products:write` obligatoria — 403 comprobado).

**Evidencia real:**

- Specs nuevos: `file-signature.spec.ts` (firmas, anti-falsificación, sha256), `products.assets.spec.ts` (atómico con dueño, mismatch sin store, D5 403, DOCUMENT verificado, FIRMWARE diferido, deleteImage retained), `files.controller.spec.ts` reescrito (público immutable; privado 401/404/403/200-no-store; desafío MFA y sesión revocada), `files.service.spec.ts` (metadata, release referenciado/retención/exclusión propia), +2 tests D4 en `product-sheet.spec.ts` y 1 test de listas en `public-revision-lens.spec.ts`; `product-revisions.service.spec.ts` actualizado (mocks de medios + aserción D2 del snapshot legacy).
- Suite backend completa: **96 suites / 1770 pruebas**, 12 fallos = **solo baseline `public-products.spec.ts` (0 regresiones)**; tsc 0; eslint 0 errores (3 warnings preexistentes ajenos); build OK.
- **e2e vivo** `node /tmp/gs-tanda-logs/e2e-cat04.cjs`: **23/23** — imagen 201 con registro (size/sha256/IMAGE/PUBLIC/dueño); pública 200 immutable sin sesión; PDF-declarado-imagen → 400 `asset-type-mismatch` **sin huérfanos** (conteo del almacén); DOCUMENT con sha256; FIRMWARE 400 con motivo; guardar ficha con licencia → archivo **PRIVATE**; privado: **401 sin sesión, 404 usuario sin acceso (Vendedor real creado como fixture), 200 `private, no-store`** con acceso; DELETE imagen tras revisión que la referencia → **retained**, fila fuera, bytes + auditoría `file-retained` presentes; limpieza total (usuario, lista, archivos, revisiones, imagen) verificado en 0.

**Limitaciones honestas:** la detección de referencias en JSON usa contención de texto (`LIKE '%url%'`) — conservadora a propósito (jamás borra de más); un índice/text-search y la **GC de verdaderos huérfanos** quedan pendientes de política del coordinador (E2). El snapshot `catalogResources` queda listo para el lente; la UI de fotos/documentos (pasos frontend) aún no lo pinta.

## 12. Verificación `frontend-imagenes` (estado real) — CERRADO

- Utilidad pura `published-images.ts`: `publishedImagesNotice(liveUrls, published|null)` — estados `sin_publicar` (404 del detalle público = no hay «anterior»), `igual`, `difiere` con conteos de «aún no visibles» y «siguen publicándose»; ignora URLs vacíos. Sin inventar reglas: la comparación es set de URLs.
- `sheet.service.fetchPublishedImages`: lee el **detalle público** `/public/products/:id` (ya lensado por la revisión publicada — la verdad de la tienda); 404 → null; otros errores suben (la UI avisa, no se traga).
- `ProductPhotosSection`: consulta la galería publicada (`useQuery`, staleTime 60 s) y pinta `PublishedImagesNotice` (componente extraído para probarlo sin red) cuando el borrador difiere: «La tienda conserva la imagen publicada anterior… Subir, quitar o reordenar fotos aquí NO cambia lo que ve la tienda…». No rediseña la ficha pública.
- Evidencia: `published-images.spec.ts` (6), `ProductPhotosSection.spec.tsx` (3), `sheet.service.spec.ts` (unwrapping + 404→null + error sube + `saveProductSheet` lleva `expectedVersion`). Guardado de borrador: subir imagen **no** toca `publicRevisionId` (backend §11/D5 ya probado con `e2e-cat04.cjs`).

## 13. Verificación `frontend-documentos` (estado real) — CERRADO (paquete completo)

- `document-assets.ts` (puro): `AUTHORIZED_DOWNLOAD_NOTICE` (efecto PRIVADO del archivo con licencia, espejo de D4), `PDF_OPTIONAL_NOTICE` (regla 4: publicar no se bloquea sin PDF), `FIRMWARE_UPLOAD_DEFERRED_HINT` (E1: subida de firmware diferida con motivo del diseño :267), `uploadHintFor(section)` (solo firmware), `toUploadResult` (exige id+url).
- `sheet.service.uploadProductAsset(productId,'DOCUMENT',file)`: `POST /products/:id/assets` multipart; el servidor verifica contenido real y devuelve registro (tamaño/sha256/tipo). **No existe subida de firmware en la UI** — coherente con E1.
- Editor (`ResourcesSection`): en **Documentos** aparece botón **«Subir archivo…»** (acepta PDF/imagen; rellena URL + nombre de archivo; error visible con el motivo del servidor, p. ej. `asset-type-mismatch`) y checkbox **«Descarga autorizada (el archivo queda privado…)»** con aviso ámbar cuando está activo; en **Firmware** NO se ofrece subida y sí el hint de alcance diferido. Contenedor `ProductSheetTab`: mutación de subida cableada (`uploadAsset.mutateAsync`).
- Compatibilidad preservada: recursos por URL (externos o `/api/...`) siguen editables igual; los textos `requiresLicense`/`release()` del backend no cambiaron la forma del payload.
- Evidencia: `document-assets.spec.ts` (4) + render 2 nuevos (aviso licencia visible, subida solo en documentos y ausente sin el prop, firmware jamás ofrece subida) + service `uploadProductAsset` (FormData con kind, 400 sube). Suite frontend completa **76 archivos / 828 pruebas**; tsc 0; eslint 0 errores; `vite build` OK; smoke 5180/proxy 200.

**Estado del paquete:** CAT-04 completo (contrato + backend-activos + frontend-imagenes + frontend-documentos), todo `implementado_sin_auditar`. Quedan del coordinador: QA-01 navegador real (subir/borrar imagen y ver el aviso de conservada; subida de documento con PDF real) y la política E2 (GC de huérfanos / text-search de referencias). La subida de firmware (E1) sigue esperando insumo externo (inventario de formatos), sin bloquear nada más.
