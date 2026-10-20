# CAT-02 — Separar borrador y revisión pública de producto (paso: contrato)

**Fecha:** 2026-10-16 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Escribe únicamente `docs/ejecucion-paneles/contratos/CAT-02.md`; sin código, sin commits, **sin tocar `estado.json`/`tareas.json`**, servicios activos (3000/5173/5432) ni `opencode.json`.

**Modalidad — tanda continua (PROP):** propuesta para la auditoría final del coordinador; **no es una decisión aprobada**.

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha, textual):** «Concretar snapshots, versión esperada y lectura pública compatible. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `CAT-01` — completado en copia (`implementado_sin_auditar`), no aceptado en `estado.json`.
- **Aceptación del paso `contrato`:** los 2 textuales.

## 2. Estado actual (OBS — copia de revisión)

### 2.1 Ciclo de publicación existente (NO crear otro)

| Pieza | Estado OBS | Evidencia |
|---|---|---|
| `Product.publishStatus` (String, default `"borrador"`) + índice | **Existe** — el producto nace en DRAFT (`isActive:false, isVisible:false`) y la FSM gestiona el resto por endpoint dedicado | `schema.prisma:166,206`; `products.service.ts:644-648` |
| FSM `POST /api/products/:id/transition` con `publishAt` programable | `update()` rechaza claves de estado (`isActive/isVisible/publishStatus/publishAt/unpublishAt`) → «el estado se gestiona vía /transition» | `products.service.ts:661-665,886-901` |
| `publish`/`unpublish` con razón obligatoria y auditoría | `@Permissions('products:publish')` en el controller | `products.service.ts:768,891` |
| **Visibilidad pública separada**: `catalogPublished Boolean default false` + `catalogSlug unique` | Campo DIFERENTE de `publishStatus` — el catálogo público se rige por `catalogPublished` | `schema.prisma:187-188,211` |
| Lectura pública **por slug** filtra `catalogPublished: true` | correcto | `public-detail.service.ts:39` |
| Lectura pública **por ID** NO filtra | `findUnique({where:{id}})` sin `catalogPublished` → **un borrador es alcanzable por ID público** (hueco que este paquete cierra) | `public-detail.service.ts:27` |
| Listados públicos (`public-products` y storefront) | **DESC parcial** — verificar por paquete `backend-publico` cuál filtra `catalogPublished` y cuál no | rg sin coincidencias directas en controller |
| Inconsistencia de casing | default `"borrador"` (minúsculas) vs código que compara `'PUBLISHED'` | `schema:166` vs `products.service:802` — decisión K3 |
| **Modelo de revisión/snapshot NO existe** | solo snapshots de precio en cotizaciones (`QuoteItem`) | `rg "model ProductRevision"` → vacío |

### 2.2 Diseño (IP — `DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md`)

- `:29-32` flujo: editar → alguien **revisa la vista previa y publica la revisión concreta**; «la tienda utiliza esa revisión; quedan registrados autor, cambios, resultado y fecha»; una misma persona puede preparar y publicar si recibe ambas acciones.
- `:155` acciones: **Publicar producto** (botón), Guardar borrador, Validar, Vista previa, Retirar publicación, Archivar, Eliminar — según permiso y estado.
- `:159` renombrar marca compartida **crea revisión** de los productos públicos afectados — «no puede saltarse la conservación de la versión pública».
- `:187-191` tras un cambio la revisión queda **pendiente**; «si la edición cambió, devuelve conflicto y obliga a revisar la versión nueva» (**versión esperada** = OCC); «Una validación antigua no autoriza otro contenido».
- `:200` estados de revisión: Sin revisar / Con problemas / Lista para publicar / Revisión pendiente. `:204` «Publicar Biblioteca» (uno/varios/toda la autorizada) con validación por producto.

## 3. Snapshots, versión esperada y referencia pública (PROP)

| Elemento | PROP | Base |
|---|---|---|
| Modelo nuevo | `ProductRevision`: snapshot del contenido publicable del producto (identidad + ficha + referencia a medios por ID), `productId`, `createdById`, `status` (los 4 estados de `:200`), `notes`, `version` (numérico), `publishedAt?`; la **referencia pública activa** queda apuntando a la revisión publicada (campo/relación sobre `Product` o tabla de estado público — elegir el mínimo: p. ej. `Product.publicRevisionId`) | diseño `:29-32,:187-191`; §2.1 (sin modelo hoy) |
| Versión esperada (OCC) | Editar/guardar borrador envía `expectedVersion`; si la revisión base cambió → **409** con la versión vigente («obliga a revisar la versión nueva») | `:191` |
| Borradores versionados | Guardar borrador crea/actualiza una `ProductRevision` en borrador **sin tocar** la revisión pública; notas incluidas | ficha `backend-borradores` goal |
| Backfill | `backend-esquema`: migración + **backfill que preserve IDs/datos/medios** (crear la revisión inicial de lo publicado apuntando a los MISMOS IDs; solo estructura+filas derivadas en BD desechable; **sin alterar** `Product` origen) y prueba de **recuperación** (rollback de la migración/backfill sin pérdida — ensayado en BD desechable con URL inline) | acceptance del paso; **nota K1**: en producción real la corrida de backfill queda para el coordinador (TANDA-COMPLETA prohíbe operaciones sobre datos comerciales en esta tanda; aquí solo se ensaya en la copia/BD desechable) |
| Lectura pública | Una SOLO política: público = revisión publicada (`catalogPublished` coherente con la revisión activa) en **ID, slug y listados**; borrador jamás alcanzable por público | acceptance `backend-publico`; §2.1 hueco por ID |
| Rutas legacy | Editar por rutas antiguas (update/brand/category/masivas) **no muta el snapshot público indirectamente**: pasan por la política de revisiones (marcan revisión pendiente o exigen transición) | acceptance `backend-alternativas`; `:159,:187` |

## 4. Acciones y alcance (PROP)

- Reutilizar `products:publish` (existe, catálogo) para publicar revisión; `products:edit`/`products:write` para borradores; **sin acciones nuevas salvo que el diseño lo exija** (si `backend-*` necesita p. ej. `products:validate`, añadirla al catálogo con spec y registrar la decisión — no habilitar más allá). Alcance por Lista con `resolveAccess`+grants (patrón CAT-01/COM-*; transición D5: legados sin grants conservan capa ACL/rol existente).
- **«Publicar Biblioteca» masivo (`:204`)** queda fuera de este paquete salvo ficha propia (no hay paso `backend-masivo` en CAT-02) — registrar si el diseño lo exige en CAT-06 (publicación).

## 5. Aceptaciones por incremento (fichas textuales) y acreditación

| Paso | Aceptación (ficha) | Acreditación prevista (PROP) |
|---|---|---|
| `backend-esquema` | «Backfill preserva IDs/datos/medios; recuperación probada.» | Migración+backfill en BD desechable (URL inline): IDs de producto/medios intactos, revisión apunta a los mismos; `migrate resolve`/SQL inverso ensayado → recuperación sin pérdida; 0 escrituras sobre campos de `Product` origen |
| `backend-borradores` | «Editar no cambia publicado; dos editores no se pisan.» | Spec: editar/guardar borrador con `expectedVersion` viejo → 409 y la revisión pública intacta; dos editores concurrentes → uno gana, otro 409, sin pisarse (patrón OCC de COM-01); la revisión pública solo cambia con la acción de publicar |
| `backend-publico` | «storefront.service y controlador público no filtran borrador por ID/slug/listado.» | Tests de las TRES lecturas (detail por ID, por slug, listados storefront/public-products): borrador **no** devuelto por ninguna vía pública (hoy falla por ID — §2.1); respuesta/presentación de lo publicado **sin cambios** (mismo shape, snapshot compatible) |
| `backend-alternativas` | «Ruta antigua/marca/categoría no cambia snapshot público indirectamente.» | Spec: `update()` de producto/brand/category por rutas legacy → la revisión pública/`catalogPublished` NO cambia (solo marca revisión pendiente o rechaza según política); e2e con producto publicado antes/después idéntico |

## 6. Errores (PROP)

`400` versión/entradas inválidas · `401` sesión · `403` sin acción o alcance · `404` producto inexistente (y borrador ante público: **404**, no 403, para no revelar) · `409` versión esperada/conflictos OCC · transiciones de estado según FSM existente.

## 7. Incrementos posteriores registrados (fichas textuales)

| Paso | Objetivo (ficha) | WritePaths (ficha) |
|---|---|---|
| CAT-02 `backend-esquema` | «Crear revisiones y referencia pública con migración ensayada.» | `schema.prisma`, `migrations/**`, `modules/products/**`, `storefront/storefront.service.ts`(+spec) |
| CAT-02 `backend-borradores` | «Guardar borradores versionados con notas y activos protegidos.» | mismos |
| CAT-02 `backend-publico` | «Adaptar lecturas públicas reales conservando respuesta/presentación.» | mismos |
| CAT-02 `backend-alternativas` | «Enrutar edición y cargas legacy por la política de revisiones.» | mismos |

**Solape:** `products/**` (CAT-03/04/05/06 lo tocan), `storefront.service.ts` (CAT-02 lo toca en 4 pasos; COM-07 futuro), `schema+migrations` (todas las líneas). Cada paso = migración propia con timestamp si hace falta; `prisma generate` obligatorio; BD desechable con URL inline.

## 8. Decisiones pendientes y bloqueos

| # | Decisión | Estado |
|---|---|---|
| K1 | Backfill real sobre datos de producción: **fuera de esta tanda** (solo ensayo en desechable) | **Pendiente coordinador** (TANDA-COMPLETA §28) |
| K2 | Mecanismo de «referencia pública activa» (`Product.publicRevisionId` vs tabla de estado) | Pendiente técnica del paso `backend-esquema` (reversible; elegir el mínimo) |
| K3 | Unificar casing de `publishStatus` (`"borrador"` vs `'PUBLISHED'`) | Pendiente — no romper FSM existente (verificar valores reales antes) |
| K4 | ¿`catalogPublished` se deriva de la revisión publicada o coexiste? (compatibilidad de lecturas) | Pendiente del paso `backend-publico` — conservar respuesta actual |
| K5 | Marca/categoría compartida → revisión de afectados (`:159`) | ¿En este paquete o CAT-04/CAT-06? Decisión de alcance a registrar en `backend-alternativas` |
| D5/E6/B1-B4 | heredados | Pendientes |

## 9. Criterios de aceptación del paso

1. ✅ Consistente con dependencias (`CAT-01` completado, no aceptado) y decisiones pendientes explícitas (§8 K1-K5).
2. ✅ Los 4 incrementos registrados con objetivo/archivos/aceptación textuales antes de delegar código (§7).
3. Reglas de ficha aterrizadas: snapshots+OCC (§3), lectura pública compatible conservando presentación (§5), legacy sin mutación indirecta (§5).
4. Advertencia modalidad tanda continua: PROP; QA-01 del coordinador.

## 10. Evidencia reproducible

```bash
node docs/ejecucion-paneles/preparar-tanda.mjs CAT-02 contrato
rg -n "publishStatus|catalogPublished" src/backend/prisma/schema.prisma        # :166 :187-188
sed -n '25,40p' src/backend/src/modules/products/public-detail/public-product-detail.service.ts  # ID sin filtro vs slug con filtro
rg -n "stateKeys|transition" src/backend/src/modules/products/products.service.ts  # :661-665 FSM
rg -n "model ProductRevision|model .*Revision" src/backend/prisma/schema.prisma  # vacío (no existe)
rg -n "borrador|revisión|conflicto" docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md  # :29-32,155,187-191,200,204
```
