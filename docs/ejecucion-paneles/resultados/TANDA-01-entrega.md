# TANDA-01 — Entrega para auditoría independiente

- **Tanda:** TANDA-01 «Dos paneles e importación (Comercial, Catálogo y precios, importación)».
- **Modalidad:** tanda continua; **auditoría final única del coordinador (QA-01 reservado)** — este documento NO acepta pasos, solo los entrega para revisión.
- **Fecha de corte:** 2026-10-17.
- **Estado global:** **65 pasos `implementado_sin_auditar` / 34 `pendiente` / 0 `bloqueado`** (detalle por paquete en §7 y en `resultados/TANDA-01-avance.json`).
- **Aislamiento:** todo se implementó en la copia `/home/soporte/office_ai/gs-tanda-01` y en BDs desechables locales. **La app activa (S3) no se tocó** (3000/5173 intactos) y **no hay commits, push ni deploy**.

---

## 1. Funciones terminadas y cómo probarlas

### Importación de precios (IMP-01 … IMP-06) — COMPLETA

| Función | Qué hace | Cómo probarla |
|---|---|---|
| Revisar (IMP-01/02) | Subir `.xlsx` y comparar contra los precios vigentes **sin aplicar**; descargar plantilla nueva (vacía o con referencias) | Pestaña **Listas → Revisar precios**: «Descargar plantilla» y subir archivo |
| Política COP (IMP-03) | Redondeo `HALF_UP`, COP entero, IVA incluido; Decimal exacto (nunca `parseFloat`); límite `COP_MAXIMUM` | `npm test -- cop-policy` / e2e paridad API↔plantilla |
| Guardar revisión (IMP-04) | Persistir el archivo original (privado, por hash) + filas/precios calculados; idempotente por `idempotencyKey` | «Guardar revisión»; repetir con la misma clave no duplica |
| Aplicar (IMP-05) | Aplicar la revisión guardada en transacción `Serializable`; conflicto `409` con `feedback` por fila; reintento idempotente | «Aplicar» en el historial; reintento informa «ya estaba aplicada» |
| Flujo 3 pasos (IMP-06) | Revisar / Guardar / Aplicar con **permisos separados**; historial por lista con descarga y descartar | Pestaña «Revisar precios»: revisar → guardar → aplicar → historial |
| Exportar precios (IMP-07 07A) | Descargar `.xlsx` con referencias y precios vigentes de la lista (solo tarifas autorizadas) | Botón **«Exportar precios (.xlsx)»** en «Revisar precios» |
| Perfiles de proveedor (IMP-07 07B) | Guardar el formato de cada proveedor (hoja, fila de encabezado, separadores, tarifas, encabezados esperados) y sus equivalencias referencia externa → producto; reconocer un archivo repetido sin remapear y exigir revisión si cambia el encabezado | Sección **«Perfiles de proveedor»** en «Revisar precios»: crear/revisar/retirar, «Reconocer proveedor», equivalencias y «Comprobar referencias» |

### Catálogo y listas (CAT-01, CAT-02, CAT-03 completo; CAT-04 contrato) — CAT-03 CERRADO (a falta de QA-01)

- **CAT-01:** desvincular producto de una lista conservando ficha/medios/precios (aviso conservacionista), archivar/restaurar, sin UI que mueva productos entre listas.
- **CAT-02:** recorrido de catálogo de listas (5 pasos) cerrado.
- **CAT-03 (contrato):** `contratos/CAT-03.md` fija mapa de apartados sin duplicidad, notas internas privadas, OCC y permisos; **huecos verificados** (H1 sin almacenamiento de notas internas — hoy «Notas» edita campos públicos; H2 `PUT sheet` sin OCC; H3 sin acción del catálogo; H4 sin identificadores de fabricante; H5 sin marcar revisión pendiente).
- **CAT-03 (`backend`, ver `contratos/CAT-03.md` §11):** H1-H4 cubiertos.
  - **Notas internas privadas (H1):** `Product.catalogInternalNotes String?` + acción **`products:notes`** (sin conceder a nadie por defecto). Sin la acción, las notas **se conservan y no se devuelven**; nunca salen al API público ni a la auditoría del actor no autorizado. `GET/PUT /api/products/:id/sheet` con `internalNotes`.
  - **OCC (H2):** `Product.sheetVersion Int` — `expectedVersion` atrasada → **409 `sheet-version-conflict` ANTES de escribir** (cero escritura, cero auditoría) con `feedback` (canal del filtro global); clientes sin `expectedVersion` siguen funcionando (capa legada) y la versión sube igual.
  - **Acciones (H3):** el catálogo real de S3 no tiene `products:edit` — el editor usa `products:read` (GET) / `products:write` (PUT) con `@Optional() grants + resolveAccess` y **transición D5** (sin grants: @Roles+ACL `edit_products` intacta; con grants: la acción es obligatoria). Contratos §4 corregido.
  - **Identificadores del fabricante (H4):** `Product.catalogManufacturerRefs String[]` (trim+dedupe; D4 resuelta: plano, sin inventar estructura; no se expone al público en este incremento).
  - **e2e vivo:** `node /tmp/gs-tanda-logs/e2e-cat03.cjs` → **30/30** (401, OCC 409 sin escribir, +1 versión, refs dedupe, notas devueltas a autorizados, detalle público 200 SIN notas, 403 real con usuario que solo tiene `customers:read`, Super Admin exceptuado, BD restaurada).
  - Conducta legada **documentada sin tocar**: `assertProductAccess` (capa ACL heredada) responde **404 para productos SIN Lista** (`listaId NULL`); el e2e usa una Lista temporal y la revierte. La ficha no edita `sku`/`name` (caso «sku duplicado» pertenece a `PUT /products/:id`/IMP).
  - H5 (revisión pendiente al editar) corresponde a `frontend-beneficios` sobre el mecanismo CAT-02.
- **CAT-03 (`frontend-identidad`, ver `contratos/CAT-03.md` §12):** guardado/recarga conserva campos; conflicto no pierde cambios.
  - Bloque **«Identificadores del fabricante»** en Identidad (round-trip `manufacturerRefs`, límites espejo 20×120).
  - **OCC en el editor:** el PUT siempre envía `expectedVersion = sheet.version` (`savePayloadWithVersion`); `detectVersionConflict` reconoce SOLO el 409 `sheet-version-conflict` (feedback o message) y extrae la versión vigente — un 409 de slug/revisión u otros estados NO disparan el banner.
  - **Sin falso éxito:** durante el conflicto se suprime el aviso verde y el error genérico; el borrador local se conserva (el error no toca la caché) y hay botón explícito **«Descartar cambios y recargar»**.
  - **Notas seguras:** el payload de Identidad omite `internalNotes` → el servidor las conserva (no se pueden borrar sin verlas). Corrección de semántica acompañante en backend: omitir ≠ borrar; solo `null` explícito con `products:notes` borra (+2 pruebas jest).
  - **vitest 71/795 (+14), tsc 0, eslint 0 errores, `vite build` OK; suite backend re-verificada 1739 con 0 regresiones; `e2e-cat03.cjs` actualizado 30/30.** QA-01 (dos pestañas concurrentes en navegador real) queda del coordinador.
- **CAT-03 (`frontend-beneficios`, ver `contratos/CAT-03.md` §13):** Destacados son beneficios; cambio invalida validación.
  - **H5 (regla 5) sobre el mecanismo CAT-02 existente:** cada guarda de ficha llama a `markPendingFromLive` (patrón de las rutas legacy) → revisión `REVISION_PENDIENTE`; **no** toca `catalogPublished` ni `publicRevisionId` (la tienda sigue mostrando la última versión publicada); el 409 de OCC no marca nada (unit + e2e).
  - **UI:** `sheet-revisions.ts` puro (`latestValidation`, etiquetas de los 5 estados reales del enum) + pie del editor con «Estado de validación: …» y aviso ámbar de pendiente **sin** ofrecer validar/publicar desde aquí (es CAT-05/CAT-06). El contenedor refresca revisiones tras guardar.
  - **Regla 2:** hint de Destacados reescrito («puntos fuertes/beneficios… no fijan precio ni stock…») con prueba de que la sección no tiene ningún campo editable de tienda.
  - **Backend 69/69 sheet y 94 suites/1742 (12 fallos = solo baseline); vitest 72/801 (+6); e2e 33/33; tsc 0 y builds OK ambos lados.** 
- **CAT-03 (`frontend-tecnicos`, ver `contratos/CAT-03.md` §14) — CIERRA EL PAQUETE (5/5):** Notas no públicas; sin variantes nuevas ni PDF obligatorio.
  - **Notas internas en la UI:** la vista trae **`canSeeInternalNotes`** (flag honesto que distingue «sin notas» de «sin permiso»). El apartado Notas pinta «Notas internas (privadas)» con aviso «Nunca se publican: no salen a la tienda, ni al API público, ni a una exportación ordinaria»; sin permiso el campo no aparece y se avisa que las existentes **se conservan al guardar**. El payload usa spread condicional: sin permiso la clave se **omite** (conservar); con permiso, vacío = `null` explícito (borrar). Límite 4000 espejo del DTO.
  - **Separación público/privada etiquetada:** «Aviso de especificaciones (público)» y «Nota de firmware (pública)».
  - **Regla 3 (Modelos):** solo lista de referencias — probado sin `type="number"` ni campos Precio/Stock/Existencias/Variante (no hay variantes nuevas).
  - **Regla 4 (sin PDF obligatorio):** `validateForm` con `published: true` y `resources: []`/`specGroups: []` → cero errores; la única exigencia al publicar sigue siendo el slug.
  - **Validación final:** backend sheet 69/69 y suite 94/1742 (12 = solo baseline, 0 regresiones); **e2e-cat03.cjs 34/34** (flag en vivo para Super Admin); frontend **72 archivos/806** (+5), tsc 0, eslint 0 errores, `vite build` OK.
  - **Pendiente del coordinador:** QA-01 (navegador real: dos pestañas concurrentes, recorrido completo de la ficha) y D2 — **a quién se concede `products:notes`** (hoy no está concedida a nadie por defecto).

- **CAT-04 (`backend-activos`, ver `contratos/CAT-04.md` §11):** activos verificados, privados autorizados y bytes que no se rompen.
  - **D1 registro de activos:** migración aditiva `20261017160000_add_uploaded_file_metadata` (aplicada a las 7 BDs) — `sizeBytes`/`sha256`/`detectedKind`/`originalName`/`visibility`/`ownerProductId`; `store()` SIEMPRE calcula tamaño real, sha256 y tipo por **firma mágica** (nunca el MIME declarado). Sin relleno retroactivo (lo antiguo queda público, caché intacta).
  - **D5 atómico + validación real (caso 3):** `uploadImage` guarda bytes y asociación en UNA transacción; contenido real ≠ declarado → **400 `asset-type-mismatch` sin escribir nada**; nuevo `POST /products/:id/assets` (IMAGE|DOCUMENT); **FIRMWARE → 400 `firmware-upload-deferred` con motivo** (diseño :267 pide inventario de formatos — insumo externo E1, no se inventa).
  - **D4 privado con autorización (caso 2):** `GET /api/files/:id` sigue `@Public` SOLO para PUBLIC (la tienda no se rompe); PRIVATE exige sesión (401 sin token; rechazos duros como `jwt.strategy`: desafío MFA, usuario inactivo, sesión revocada) + ACL del producto dueño (denegado real = **404 sin revelar**; sin dueño = 403 fail-closed), servido `private, no-store` + `attachment`. El editor lo produce: recurso `requiresLicense` con URL de almacén → archivo PRIVATE con dueño (no roba propiedades; pierde licencia → vuelve a PUBLIC).
  - **D3 retención (caso 1):** `release()` no borra bytes si una imagen viva, un recurso, `products.documents` o **el contenido de cualquier revisión** los referencia (excluye la propia fila que se borra); la retención se audita `file-retained` y nunca es 409. `deleteByUrl` delega (nadie puede ya destruir bytes referenciados).
  - **D2 medios por revisión:** `content.images`/`content.catalogResources` los construye el servidor en `saveDraft` y `markPendingFromLive`; `LENS_FIELDS` los pisa en la lectura pública → sustituir imágenes no rompe la revisión publicada.
  - **Permisos §4:** helper `d5-action.ts` — subida/borrado con `products:write` cuando hay grants (403 probado); sin grants, @Roles+ACL intacta.
  - **e2e vivo `e2e-cat04.cjs` 23/23** (todos los casos anteriores con usuario Vendedor fixture real negado y limpieza total). Suite: **96/1770** (12 = solo baseline), tsc 0, eslint 0, build OK. **Resta `frontend-imagenes` y `frontend-documentos`.**

### Comercial (COM-01 … COM-05, COM-08) — COMPLETOS
- COM-01 paquetes/acceso de usuarios; COM-02 clientes/cartera (reassign con motivo); COM-03 cotizaciones (descuento en vía dedicada, `ganada` idempotente); COM-04 metas; COM-05 panel; COM-08 dashboard/insights.

### Base (BASE-01 … BASE-04) — COMPLETOS

Inventario, contratos base, concesiones de acceso (catálogo de acciones + `resolveAccess` + grants por petición), agenda.

---

## 2. Archivos y migraciones

**Migraciones nuevas (solo estructura; sin datos de producción):**

| Migración | Contenido | Down |
|---|---|---|
| `20261017120000_add_price_import_revisions` | Tablas `price_import_revisions` / `_rows` / `_prices` + enum de estado (IMP-04) | `migration.down.sql` |
| `20261017130000_add_price_import_revision_apply` | Campos `appliedAt` / `appliedById` / `appliedResult` (IMP-05) | `migration.down.sql` |
| `20261017140000_add_provider_profiles` | Tablas `provider_profiles` / `provider_equivalences` (IMP-07B) | `migration.down.sql` |
| `20261017150000_add_product_sheet_notes_occ` | `products.catalogInternalNotes` (TEXT, nullable), `products.catalogManufacturerRefs` (TEXT[] default '{}'), `products.sheetVersion` (INT default 0) (CAT-03) | `migration.down.sql` |
| `20261017160000_add_uploaded_file_metadata` | `uploaded_files`: sizeBytes/sha256/detectedKind/originalName/visibility(default PUBLIC)/ownerProductId + índices; **aditivo, sin relleno retroactivo** (CAT-04) | `migration.down.sql` |

**Módulos principales tocados (IMP):**

- Backend: `src/backend/src/modules/prices/import/**` (`price-import.service.ts`, `price-import.controller.ts`, `provider-profile.ts`, `price-template.ts`, `price-import-storage.ts`, `price-workbook-structure.ts`), `src/backend/src/common/money/cop-policy.ts`, `src/backend/src/common/security/access-catalog.ts` (acciones `prices:read/preview/save/apply` y `providers:read/write`), `src/backend/prisma/schema.prisma` + `prisma/migrations/20261017140000_add_provider_profiles/**`.
- Frontend: `src/frontend/src/services/price-import.service.ts`, `src/frontend/src/features/price-import/**` (`PriceImportPreviewPanel.tsx`, `PriceImportRevisionsSection.tsx`, `ExportListaSection.tsx`, `ProviderProfilesSection.tsx`, utilidades `preview.utils.ts`/`revisions.utils.ts`/`export-prices.utils.ts`/`provider-profiles.utils.ts`), `src/frontend/src/pages/ListaDetailPage.tsx` (pestaña «Revisar precios»; **retirado el botón CSV anterior**).

**Módulos principales tocados (CAT-03 backend):**

- Backend: `src/backend/prisma/schema.prisma` + `prisma/migrations/20261017150000_add_product_sheet_notes_occ/**`, `src/backend/src/common/security/access-catalog.ts` (+spec; acción `products:notes`), `src/backend/src/modules/products/sheet/{dto/product-sheet.dto.ts, product-sheet.service.ts, product-sheet.spec.ts}`, `src/backend/src/modules/products/public-detail/product.mapper.spec.ts` (privacidad H1).

**Cómo aplicar las migraciones (BD desechable):**
```bash
cd /home/soporte/office_ai/gs-tanda-01/src/backend
npx prisma migrate deploy          # aplica 20261017120000, 130000, 140000 y 150000
```

---

## 3. Pruebas ejecutadas (hito pre-entrega)

| Suite | Comando | Resultado |
|---|---|---|
| Backend completo | `npx jest` | **96 suites / 1770 pruebas**; **12 fallos = SOLO `public-products.spec.ts`** (baseline DI, ver §5) |
| Backend import | `npx jest src/modules/prices/import` | **10 suites / 264 pruebas** verdes |
| Backend ficha (CAT-03) | `npx jest src/modules/products/sheet` | **2 suites / 69 pruebas** verdes (OCC + notas/acciones + H5) |
| Frontend completo | `npx vitest run` | **72 archivos / 806 pruebas** verdes |
| Tipos | `npx tsc --noEmit` (backend y frontend) | **0 errores** |
| Lint | `npx eslint` (archivos tocados) | **0 errores**; warnings preexistentes de baseline (sin nuevos) |
| Build | `npm run build` (backend y frontend) | **OK** |

**E2E vivos (HTTP real, BD desechable):**

- `e2e-imp04.cjs` guardar → reiniciar API → recuperar; idempotencia; archivo privado.
- `e2e-imp05.cjs` aplicar 201 (`Price=123457.00`), reintento `alreadyApplied`, conflicto `409` con `feedback` (`PRICE_CHANGED (esperado 123457, actual 999999)`).
- `e2e-imp07.cjs` **8/8**: 401 sin token; 200 `.xlsx` (`PRECIOS`+`INSTRUCCIONES`, encabezado solo tarifa autorizada); 400 tarifa desconocida y `listaId` inválido. Solo lectura.
- `e2e-imp07b.cjs` **17/17**: 401 sin token; **403 real con usuario sin `providers:read`/`providers:write`**; 400 validación; 201 crear; 409 duplicado; reconocimiento caso 1 (`matches`, sin remapear) y caso 2 (encabezado cambiado → `requiresReview`; proveedor nuevo → `requiresReview`); equivalencias (200 y 400 producto inexistente); resolución `resolved`+`pending`; `version 1→2`; 404 tras borrar. Solo toca perfiles (no precios ni `Product.listaId`).
- `e2e-cat03.cjs` **34/34**: 401 GET/PUT; GET 200 con `version` y `canSeeInternalNotes`; OCC atrasada → 409 `sheet-version-conflict` con `feedback` y **cero escritura/cero auditoría/cero revisión**; PUT correcto → +1 versión, `manufacturerRefs` deduplicados, notas devueltas, `published` intacto (no publica) y **H5: revisión marcada pendiente sin tocar `publicRevisionId`**; auditoría `update_sheet` con versiones antes/después; legado sin `expectedVersion` 200 **conservando notas** (omitir ≠ borrar); **detalle público 200 sin exponer notas ni versión**; con concesiones reales (solo `customers:read`) → **403 GET y PUT** para Admin Comercial sin `products:read`/`products:write` y Super Admin conserva acceso (excepción explícita); deja la BD restaurada (usa Lista temporal porque el ACL legado oculta productos sin Lista).
- `e2e-cat04.cjs` **23/23**: imagen 201 con registro real (size/sha256/firma IMAGE/PUBLIC/dueño); pública 200 `immutable` sin sesión; PDF-declarado-imagen → **400 `asset-type-mismatch` sin huérfanos** (conteo del almacén); DOCUMENT con sha256; FIRMWARE → 400 con motivo; guardar ficha con licencia → **PRIVATE**; privado: **401 sin sesión, 404 con Vendedor real sin acceso (no revela), 200 `private, no-store`** al autorizado; DELETE imagen referenciada por revisión → **retained** + auditoría `file-retained`, fila fuera y bytes vivos; limpieza total verificada en 0.

> Los E2E usan URL de BD **inline** + guard de identidad (`assertTestDb`); nunca heredan `DATABASE_URL` de producción.

---

## 4. Cómo levantar el entorno de revisión

Sin incluir credenciales en este documento (todas por variables de entorno):

```bash
# 1) BD desechable (contenedor gs-tanda-db, puerto 54331)
#    DATABASE_URL se pasa inline; NUNCA se usa el .env de la copia (apunta a Neon de producción).
cd /home/soporte/office_ai/gs-tanda-01/src/backend
npm run build
setsid env DATABASE_URL="$TANDA_TEST_DATABASE_URL" PORT=3001 node dist/src/main.js &

# 2) Frontend de revisión (proxy → 3001)
cd /home/soporte/office_ai/gs-tanda-01/src/frontend
npm run dev -- --config vite.review.config.ts   # puerto 5180

# 3) Sesión de revisión: helper de login con MFA (DATABASE_URL inline + guard)
node /tmp/gs-tanda-logs/login.cjs               # imprime TOKEN=…
```

- **API de revisión:** `http://localhost:3001` (Swagger en `/api/docs`).
- **Frontend de revisión:** `http://localhost:5180`.
- **App activa (no tocar):** 3000 / 5173.

---

## 5. Fallos conocidos y desviaciones

1. **12 fallos en `public-products.spec.ts`** — **baseline**, no de la tanda. Causa raíz: `StorefrontService` sin proveer en el TestBed (DI). Comparado contra copia fresca de la versión inicial: mismos 12 fallos, **0 regresiones**. No se toca.
2. **`lista-preview-access.spec.tsx` (de L) no migrado**: sus aserciones no mapean a la página con pestañas; comportamiento equivalente cubierto por los specs de IMP-06. Se migrará solo si el coordinador lo pide.
3. **Warnings de lint preexistentes** (p. ej. `price-template-download.spec.ts`, `product-revisions.backfill.spec.ts`): sin cambios netos respecto del baseline.
4. **Sin jsdom en el frontend**: los specs de UI usan render de servidor + ayudantes puros (patrón de la tanda).

---

## 6. Bloqueos (separación explícita)

**A) Bloqueo por DEPENDENCIA** (un paso espera a otro de la misma tanda; **NO** es decisión externa):

- *(ninguno vigente en IMP)* — **IMP-07 07B ya no está pendiente**: backend y frontend implementados y verificados (`implementado_sin_auditar`, ver §1 y `contratos/IMP-07.md` §13-§14).

**B) Bloqueo EXTERNO** (falta un insumo o decisión que NO está en la tanda) — `bloqueos_externos`:

| id | Motivo | Estado |
|---|---|---|
| `COM-06-excel-pedidos` | Requiere formato saneado del Excel «Pedidos» | `bloqueado_externo` |
| `COM-07-yeminus` | Requiere contrato/API y datos reales de Yéminus | `bloqueado_externo` |
| `COM-09-descuentos` | Requieren reglas de descuento/precio público/stock documentadas | `bloqueado_externo` |
| `IMP-01-preview` | **Resuelto 2026-10-16**: la pieza preview de L se recibió e integró | `resuelto_2026-10-16` |

---

## 7. Estado por paquete

| Paquete | Implementado | Pendiente |
|---|---|---|
| BASE-01…04 | 11 | 0 |
| IMP-01…06 | 18 | 0 |
| IMP-07 | 3 (contrato + backend 07A/07B + frontend 07A/07B) | 0 |
| CAT-01, CAT-02 | 8 | 0 |
| CAT-03…09 | 7 (CAT-03 completo; CAT-04 contrato + backend-activos) | 18 |
| COM-01…05, COM-08 | 18 | 0 |
| COM-06, COM-07, COM-09 | 0 | 15 |
| QA-01 (coordinador) | 0 | 1 |
| **Total** | **65** | **34** |

---

## 8. Recorridos pendientes de navegador real (QA-01 — del coordinador)

No hay Playwright instalado; estos recorridos quedan para la verificación en navegador real:

- Importación de precios: descargar plantilla → revisar → guardar → aplicar → historial, con y sin cada permiso (`prices:preview`/`save`/`apply`/`read`).
- Exportación (07A): botón visible solo con `prices:read`; archivo descargado abre en Excel.
- Perfiles de proveedor (07B): crear perfil, reconocer el mismo proveedor (sin remapear) y con encabezado cambiado (pide revisar); registrar equivalencias y comprobar referencias (`resolved`/`pending`).
- 409 de conflicto: mensaje por fila visible y sin falso éxito.
- Flujo móvil de la pestaña «Revisar precios».

---

## 9. Incidente del helper de BD — estado

Documentado en `resultados/TANDA-01-incidente-helper-db.md` (**contenido pendiente de auditoría del coordinador**). Resumen: 20 helpers auditados; `e2e-com02.cjs`, `e2e-base03.cjs`, `login.cjs` y `testdb.cjs` ya incorporan URL inline + guard de identidad; el caso de escritura en producción (COM-03) quedó contenido con verificación de 0 filas nuevas y limpieza. **No se realizan nuevas conexiones, limpiezas ni correcciones en producción sin autorización.**

---

## 10. Punto de continuación

1. **CAT-04 `frontend-imagenes`** (vista/guardado de borrador conserva imagen publicada anterior — el lente ya pisa `content.images`; falta la UI que la muestre separada del borrador), luego `frontend-documentos` (subida verificada cableada, PDF opcional, aviso de descarga autorizada) y **CAT-05…09** (18 pasos pendientes). La **subida de firmware** sigue diferida (insumo externo: inventario de formatos — diseño `:267`, §8 E1).
2. **CAT-04…09** (23 pasos pendientes) — siguiente trabajo realizable sin insumos externos.
3. **COM-06/07/09** (15 pasos) — bloqueados externamente (Excel «Pedidos» saneado; API/datos Yéminus; reglas de descuento/precio público/stock).
4. **QA-01** (navegador real) y **auditoría del incidente de producción** — reservados al coordinador.

> Regla vigente: ningún paso se marca completo sin comprobar sus aceptaciones; los estados de `estado.json` del coordinador no se modifican. La entrega sigue **parcial** mientras queden pasos realizables (CAT-03…09).
