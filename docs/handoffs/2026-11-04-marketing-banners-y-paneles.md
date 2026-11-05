# Handoff 2026-11-04: Marketing y mercadeo → Banners (banners de inicio y pop-up de la tienda)

Estado: implementado y verificado en local el 2026-11-04. Sin commit, sin push, sin despliegue a producción. Líneas verificadas el 2026-11-04. Todas las rutas son relativas a la raíz del worktree `C:\Users\sopor\grupo-security-office\.claude\worktrees\validacion-biblioteca`. Cada dato técnico sale de leer el código; lo que no se pudo comprobar lleva `[no verificado]`. Otras sesiones siguen editando estos archivos: relee antes de apoyarte en un número de línea.

## 1. Resumen

- Qué es: una pantalla de administración para que una persona con permiso cree, edite, publique y retire los banners de la portada de la tienda pública (`/tienda`) y el pop-up, sin tocar código.
- Dos tipos de campaña (`kind`): `HERO` (carrusel de hasta 6 imágenes, con versión de escritorio y opcional de móvil) y `POPUP` (una imagen, máximo 1 publicado).
- Cada campaña tiene un borrador y una copia publicada. Editar nunca cambia lo que ve la tienda hasta publicar.
- Reutiliza la tabla existente `storefront_banners` (modelo Prisma `StorefrontBanner`, `src/backend/prisma/schema.prisma:1557-1567`). No hay migración que cambie el esquema. Sí existe una migración de datos sin aplicar que borra 2 filas heredadas (sección 4.4).
- Permisos: acciones `marketing:read|create|edit|publish|delete` y tres paquetes asignables (sección 5). Catálogo `panels-20261104-1`.
- El módulo se desplegó solo a la demo del VPS (ver [handoff de la demo](2026-11-04-demo-vps-sesiones-y-pendientes.md), sección 6; esos hechos no se reverificaron aquí). Nunca se ha desplegado a producción.
- Verificación de hoy: backend 169 pruebas pasan; frontend `tsc` sin errores, `eslint` sin avisos, 348 pruebas pasan (sección 9).

## 2. Mapa de archivos

Líneas de código reales leídas el 2026-11-04 (`wc -l`).

### 2.1 Backend (`src/backend/src/modules/marketing-campaigns/`)

| Ruta | Líneas | Qué hace |
|---|---|---|
| `marketing-campaigns.module.ts` | 13 | Módulo Nest. Importa `PrismaModule` y `AuditModule`; registra los 2 controladores y el servicio (`:8-13`). Se importa en `src/backend/src/app.module.ts:38` y se lista en `:92`. |
| `marketing-campaigns.controller.ts` | 118 | Administración, ruta `api/marketing/campaigns` (`:37`). Guards `JwtAuthGuard, RolesGuard` (`:38`) y `@RequireGrant` por método. |
| `marketing-campaigns-public.controller.ts` | 57 | Público, ruta `api/storefront/campaigns` (`:23`), `@Public()` (`:22`). Exporta `matchesEtag` (`:11-14`). |
| `marketing-campaigns.service.ts` | 550 | Lógica: lista, detalle, crear, editar, imágenes, publicar, retirar, eliminar, lectura pública y binario público. |
| `marketing-campaigns.dto.ts` | 75 | DTOs `CreateCampaignDto` (`:51`), `UpdateCampaignDto` (`:61`), `PublishCampaignDto` (`:71`), con `class-validator`. |
| `marketing-campaigns.rules.ts` | 288 | Reglas puras: tipos, límites, `CAMPAIGN_IMAGE_RULES`, lectura de cabecera PNG/JPEG/WebP, enlaces, fechas, vigencia. |
| `marketing-campaigns.test-helpers.ts` | 63 | Genera bytes sintéticos con cabecera válida: `pngBytes` (`:3`), `jpegBytes` (`:15`), `webpLosslessBytes` (`:34`), `webpLossyBytes` (`:44`), `webpExtendedBytes` (`:55`). |
| `marketing-campaigns.rules.spec.ts` | 202 | 13 pruebas de las reglas puras. |
| `marketing-campaigns.service.spec.ts` | 565 | 38 pruebas del servicio con una base en memoria (`makeDb`, `:19-111`). |

### 2.2 Backend fuera del módulo

| Ruta | Líneas | Qué hace |
|---|---|---|
| `src/backend/prisma/schema.prisma` | `1557-1567` | Modelo `StorefrontBanner` (mapa `storefront_banners`). |
| `src/backend/prisma/migrations/20261104090000_remove_legacy_storefront_banners/migration.sql` | 8 | `DELETE` de las 2 filas heredadas por id. Sin aplicar vía Prisma. |
| `src/backend/src/common/security/access-catalog.ts` | `31`, `176-182`, `420-436` | Versión del catálogo, 5 acciones y 3 paquetes. |
| `src/backend/src/common/security/access-catalog.spec.ts` | `593-637` | Pruebas del bloque «Marketing y mercadeo». |
| `src/backend/src/common/security/require-grant.ts` | 70 | `RequireGrant`, `GrantGuard`, `hasGlobalGrant`. |
| `src/backend/src/main.ts` | 56 | `ValidationPipe` (`:28-32`), filtro de errores (`:34`), interceptor `{ data }` (`:35`). |

### 2.3 Frontend de administración (`src/frontend/src/features/marketing/`)

| Ruta | Líneas | Qué hace |
|---|---|---|
| `marketing-api.ts` | 104 | Tipos de respuesta y funciones que llaman a `/marketing/campaigns`. |
| `marketing-rules.ts` | 242 | Reglas en el navegador: medidas, validación de archivo, estados, vista previa, fechas Colombia, conflicto 409. |
| `marketing-access.ts` | 86 | Páginas del panel, ids de paquetes, `hasMarketingAction`, `marketingPermissions`, `useMarketingPermissions`. |
| `MarketingLayout.tsx` | 41 | Cascarón del panel: título, estado de acceso, migas, `<Outlet />`. |
| `MarketingIndex.tsx` | 30 | Índice «Páginas del panel» con una tarjeta por página. |
| `BannersTab.tsx` | 33 | Página «Banners»: carga la lista y muestra las dos tarjetas. |
| `CampaignSection.tsx` | 162 | Una tarjeta (HERO o POPUP): lista, botón nuevo, panel lateral (`Drawer`) con editor y vista previa. |
| `CampaignEditor.tsx` | 376 | Formulario de un borrador: campos, subir/quitar imágenes, guardar, publicar, retirar, eliminar. |
| `CampaignPreview.tsx` | 181 | Vista previa: iframe de `/tienda` con el borrador por `postMessage`; guía de medidas (`MeasureGuide`). |
| `unsaved-guard.ts` | 6 | `canLeave(dirty, ask)` y el texto de confirmación. |
| `marketing-rules.spec.ts` | 109 | 16 pruebas. |
| `marketing-panel.spec.tsx` | 477 | 44 pruebas (render estático, sección 9). |

### 2.4 Frontend público y compartido

| Ruta | Líneas | Qué hace |
|---|---|---|
| `src/frontend/src/features/storefront/components/HeroBanner.tsx` | 157 | Carrusel del héroe, respaldo con foto, controles. |
| `src/frontend/src/features/storefront/components/CampaignPopup.tsx` | 176 | `PopupCard`, `PopupDialog`, `CampaignPopup` (real y de vista previa). |
| `src/frontend/src/features/storefront/components/CampaignLink.tsx` | 30 | Enlace interno (router), externo (pestaña nueva) o sin enlace. |
| `src/frontend/src/features/storefront/hooks/useStorefrontCampaigns.ts` | 127 | Pide las campañas; en el iframe de vista previa recibe el borrador. |
| `src/frontend/src/features/storefront/utils/campaigns.ts` | 166 | Tipos, `normalizeCampaigns`, `linkKind`, `nextIndex`, `shouldShowPopup`, clave de sesión. |
| `src/frontend/src/features/storefront/utils/preview-frame.ts` | 54 | Constantes y mensajes del iframe de vista previa. |
| `src/frontend/src/services/storefront-campaigns.service.ts` | 8 | `fetchStorefrontCampaigns(signal)`. |
| `src/frontend/src/features/storefront/pages/StorefrontHome.tsx` | 253 | Usa el hook (`:49`), `HeroBanner` (`:92`) y `CampaignPopup` (`:94`). |
| `src/frontend/src/components/ui/Drawer.tsx` | 109 | Panel lateral modal con prop `aside`. |
| `src/frontend/src/components/ui/useWideScreen.ts` | 19 | `true` desde 1024 px. |
| `src/frontend/src/index.css` | `249-266` | Reglas `.drawer-panel` y `.drawer-aside`. |
| `src/frontend/public/images/home/storefront-art.png` | binario | Foto de respaldo del héroe (usada en `HeroBanner.tsx:27`). |

Pruebas públicas: `features/storefront/utils/campaigns.spec.ts` (10 pruebas) y `features/storefront/components/campaign-components.spec.tsx` (10 pruebas).

### 2.5 Permisos en el frontend

| Ruta | Líneas | Qué hace |
|---|---|---|
| `src/frontend/src/App.tsx` | `50-53`, `67-95`, `158-162`, `188` | Importa páginas, `AccessBoundary` con `marketingPanel`, rutas `/marketing`, ruta `/tienda`. |
| `src/frontend/src/components/layout/Header.tsx` | `8`, `40`, `451-455` | Ítem de menú «Marketing y mercadeo». |
| `src/frontend/src/features/users/access.ts` | `156-160` | Etiquetas de las 5 acciones (`ACTION_LABELS`). |
| `src/frontend/src/features/users/components/UserAccessAssignments.tsx` | `51-56`, `263-311` | Bloque «Marketing y mercadeo» en «Asignar paneles» (`PACKAGE_PANELS`). |
| `src/frontend/src/services/users.service.ts` | `45` | `ACCESS_CATALOG_VERSION = 'panels-20261104-1'`. |

## 3. Contratos de API

Todas las respuestas de éxito de controladores normales las envuelve el interceptor global en `{ "data": ... }` (`src/backend/src/common/interceptors/transform.interceptor.ts:12`, registrado en `main.ts:35`). El cliente `api` del frontend ya lo desenvuelve en `marketing-api.ts` (`.data`). Los errores los formatea `HttpExceptionFilter` (`src/backend/src/common/filters/http-exception.filter.ts:19-30`):

```json
{ "statusCode": 409, "timestamp": "2026-11-04T...Z", "path": "/api/marketing/campaigns/<id>", "message": "La campaña cambió mientras la editabas; recarga para ver la versión más reciente" }
```

`ValidationPipe` global: `whitelist`, `forbidNonWhitelisted` y `transform` (`main.ts:28-32`). Un campo no declarado en el DTO responde 400.

Límite de peticiones: el guard global `ThrottlerGuard` (`app.module.ts:99-102`) usa por defecto `THROTTLE_LIMIT=20` cada `THROTTLE_TTL=60000` ms (`app.module.ts:47-58`). Las rutas de administración no declaran `@Throttle`, así que usan ese valor por defecto (configurable por entorno; el valor en la demo o producción no se verificó, `[no verificado]`).

El identificador `:id` es UUID. En administración un UUID inválido responde 400 «Identificador de campaña no válido» (`controller.ts:27-28`); en público responde 404 «Imagen no encontrada» (`public-controller.ts:8`).

### 3.1 Administración (`/api/marketing/campaigns`)

Siempre exigen sesión (`JwtAuthGuard`) y el permiso indicado. `RequireGrant` solo acepta concesiones de alcance global (`require-grant.ts:21-31`); Super Admin tiene excepción (`src/backend/src/common/security/d5-action.ts:8`).

| Método y ruta | Línea | Permiso | Cuerpo | Respuesta 200/201 | Errores |
|---|---|---|---|---|---|
| `GET /` | `controller.ts:46` | `marketing:read` | no | Arreglo de resumen (sección 3.3), sin imágenes. HERO primero, luego POPUP; dentro de cada tipo por `position`. | 401, 403 |
| `GET /:id` | `:53` | `marketing:read` | no | Resumen más `draft` completo con las imágenes en base64 (data URL). | 400 id, 404 |
| `POST /` | `:60` | `marketing:create` | `{ kind, name, alt?, linkUrl?, position?, startsAt?, endsAt?, fit?, focusX?, focusY? }` | Detalle (201). | 400 |
| `PATCH /:id` | `:67` | `marketing:edit` | `{ revision, name?, alt?, linkUrl?, position?, startsAt?, endsAt?, fit?, focusX?, focusY? }` | Detalle. | 400, 404, 409 revisión desactualizada |
| `PUT /:id/image/:slot` | `:75-86` | `marketing:read` en el guard y `marketing:create` O `marketing:edit` en el servicio (`service.ts:224-227`) | `multipart/form-data`, campo `file` | Detalle. | 400, 403, 404, 413 |
| `DELETE /:id/image/:slot` | `:89-94` | igual que arriba | no | Detalle (si la imagen no existía, devuelve el detalle sin cambios ni auditoría, `service.ts:376`). | 400, 403, 404 |
| `POST /:id/publish` | `:96-102` | `marketing:publish` | `{ revision? }` | Detalle (HTTP 200). | 400, 404, 409 |
| `POST /:id/unpublish` | `:104-110` | `marketing:publish` | no | Detalle (HTTP 200). | 404, 409 «La campaña no está publicada» |
| `DELETE /:id` | `:112-117` | `marketing:delete` | no | `{ "data": { "id": "<uuid>", "deleted": true } }` | 404, 409 si está publicada |

`slot` vale `desktop` y `mobile` (HERO) o `image` (POPUP). Un slot que no corresponde al tipo responde 400 (`service.ts:125-133`).

Detalles de validación (todos en español, los mensajes exactos están en el código):

- DTO (`dto.ts`): `name` 1 a 120 caracteres; `alt` hasta 200; `linkUrl` hasta 500; `position` entero 0 a 999; `startsAt`/`endsAt` ISO 8601 estricto, `''` se convierte en `null`; `fit` `cover|contain`; `focusX`/`focusY` entero 0 a 100; `revision` entero >= 0.
- Servicio: el enlace se normaliza con `normalizeLinkUrl` (sección 4.3); las fechas con `normalizeDate` exigen zona horaria explícita; `assertValidity` exige fin posterior a inicio.
- Imagen: formato real PNG, JPEG o WebP leído de los bytes, máximo 3 MB, medidas según el espacio (sección 4.3). Multer corta en `MAX_IMAGE_BYTES + 1` (`controller.ts:77`), así que un archivo de más de 3 MB más 1 byte lo rechaza multer (Nest lo traduce a 413, `[no verificado en este repo]`) y uno entre 3 MB y 3 MB + 1 byte lo rechaza `inspectImage` con 400 (`rules.ts:168-170`).
- Publicar exige: nombre no vacío, texto alternativo no vacío, imagen de escritorio (HERO) o imagen (POPUP), fechas coherentes, vigencia no vencida, y cupo libre (sección 3.4).
- Eliminar: 409 si `publishedData` no es null (`service.ts:461-463`).

Ejemplos mínimos:

```http
POST /api/marketing/campaigns
{ "kind": "HERO", "name": "Promo Black Friday", "alt": "Cámaras en oferta", "linkUrl": "/catalogo" }

PATCH /api/marketing/campaigns/<id>
{ "revision": 0, "name": "Promo Black Friday 2" }

PUT /api/marketing/campaigns/<id>/image/desktop      (multipart, campo "file", PNG 1200x520)

POST /api/marketing/campaigns/<id>/publish
{ "revision": 3 }
```

### 3.2 Público (`/api/storefront/campaigns`, sin sesión)

| Método y ruta | Línea | Límite | Respuesta |
|---|---|---|---|
| `GET /` | `public-controller.ts:27-34` | `@Throttle` 60 por 60 s | `{ "data": { "hero": [...], "popup": {...} \| null } }`. Cabeceras `Cache-Control: public, max-age=30` y `X-Content-Type-Options: nosniff`. |
| `GET /:id/image/:slot` | `:36-56` | `@Throttle` 120 por 60 s | Binario de la imagen publicada. No va envuelto en `{ data }` porque usa `@Res()` sin `passthrough`. Errores sí con el formato JSON del filtro. |

Forma de `hero[i]` (`service.ts:503-513`): `{ id, revision, alt, linkUrl, fit, focusX, focusY, imageDesktopUrl, imageMobileUrl | null }`. Forma de `popup` (`:519-525`): `{ id, revision, alt, linkUrl, imageUrl }`. Las URL de imagen son `/api/storefront/campaigns/<id>/image/<slot>?v=<revision>` (`:497`). El `?v=` solo sirve para renovar cachés; el servidor lo ignora.

Cabeceras de la imagen (`public-controller.ts:46-50`): `Content-Type` real (`image/png|jpeg|webp`), `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=300`, `Cross-Origin-Resource-Policy: cross-origin` (el frontend y la API pueden estar en orígenes distintos), `ETag: "<id>-<revision>-<slot>"` (`service.ts:548`). Si `If-None-Match` contiene el ETag (se ignora el prefijo débil `W/`), responde 304 sin cuerpo (`:51-54`).

La imagen devuelve 404 «Imagen no encontrada» si: el slot no existe o no corresponde al tipo, no hay copia publicada, la vigencia no es `ACTIVE` (programada o vencida), o los bytes guardados no son un data URL válido (`service.ts:532-549`).

Orden y selección públicos (`service.ts:499-526`): HERO por `position`, luego `createdAt`, luego `id`, tope 6 y solo los que tienen imagen de escritorio; POPUP el más antiguo por `createdAt`, solo si tiene imagen. Solo se leen copias publicadas dentro de su vigencia; nunca el borrador.

### 3.3 Forma del resumen (`describe`, `service.ts:160-202`)

`{ id, revision, kind, name, alt, linkUrl, position, startsAt, endsAt, fit, focusX, focusY, hasImageDesktop, hasImageMobile, hasImage, status: 'DRAFT'|'PUBLISHED', hasPublished, hasUnpublishedChanges, validity: 'ACTIVE'|'SCHEDULED'|'EXPIRED'|null, isLive, createdAt, updatedAt }`. `validity` describe la copia publicada (null si no hay). `hasUnpublishedChanges` es verdadero solo si hay copia publicada y el borrador es distinto. El tipo TypeScript del frontend está en `marketing-api.ts:5-28`; el detalle añade `draft` (`:31-49`).

### 3.4 Límites de publicación

`MAX_PUBLISHED = { HERO: 6, POPUP: 1 }` (`rules.ts:49`). Al publicar se cuentan las otras campañas del mismo tipo con copia publicada cuya vigencia no ha vencido (`service.ts:410-418`); si ya hay el máximo responde 409 («Ya hay 6 banners del título publicados; retira uno antes de publicar otro» o «Ya hay un pop-up publicado; retíralo antes de publicar otro»). Las campañas con la ventana ya terminada no ocupan lugar.

## 4. Modelo de datos

### 4.1 Tabla y modelo

`StorefrontBanner` (`schema.prisma:1557-1567`): `id String @id` (sin default; el servicio genera `randomUUID()`, `service.ts:288`), `draft Json`, `publishedData Json?`, `revision Int @default(0)`, `createdAt`, `updatedAt`. Tabla `storefront_banners`, creada por la migración `20261009160000` (según el comentario del modelo). Sin migración nueva de esquema para este trabajo.

### 4.2 Contenido JSON (`CampaignContent`, `rules.ts:25-39`)

```ts
{ kind: 'HERO' | 'POPUP', name: string, alt: string, linkUrl: string | null,
  position: number, startsAt: string | null, endsAt: string | null,   // ISO 8601 UTC
  fit: 'cover' | 'contain', focusX: number, focusY: number,           // 0..100
  imageDesktop: string | null, imageMobile: string | null, image: string | null } // data URL base64
```

- `draft` siempre contiene este objeto. `publishedData` es `null` mientras no se publica; al publicar se copia el borrador completo, imágenes incluidas (`service.ts:426`).
- HERO usa `imageDesktop` e `imageMobile`; POPUP usa `image` (`SLOTS_BY_KIND`, `rules.ts:19-22`).
- Valores por defecto al crear (`service.ts:273-287`): `alt ''`, `linkUrl null`, `position 0`, `fit 'cover'`, `focusX/Y 50`, imágenes `null`, `revision 0`.
- Las imágenes viven dentro del JSON como base64. Por eso las consultas de lista y de lectura pública quitan esas claves en SQL (`draft - 'imageDesktop' - ...`) y devuelven solo banderas `has*`.

### 4.3 Reglas de la tabla de imágenes y del contenido

`CAMPAIGN_IMAGE_RULES` (`rules.ts:67-89`), 3 MB máximo (`:44`), lado máximo 6000 px (`:46`):

| Slot | Ancho mínimo | Proporción ancho/alto | Recomendado |
|---|---|---|---|
| `desktop` | 1000 | 2,0 a 2,6 | 1200 × 520 |
| `mobile` | 600 | 1,2 a 1,5 | 900 × 675 |
| `image` (pop-up) | 600 | 0,6 a 1,8 | 900 × 900 |

Funciones: `inspectImage(buffer)` (`:166-181`) detecta el formato por los bytes (`readPng :108`, `readJpeg :117`, `readWebp :139` para VP8, VP8L y VP8X) sin librerías; `assertImageDimensions(image, slot)` (`:184-201`) responde mensajes del estilo «La imagen mide W × H px; el ancho mínimo es N px, para el banner de escritorio sube una de 1200 × 520 px aproximadamente»; `toDataUrl` (`:203`) y `parseDataUrl` (`:208-213`, solo `image/png|jpeg|webp` en base64); `normalizeLinkUrl(raw)` (`:221-245`) acepta vacío (null), ruta interna que empiece por una sola `/` o `https://` sin credenciales, y rechaza `javascript:`, `data:`, `http:`, `//host`, espacios, barras invertidas, comillas, `<`, `>`; `normalizeDate` (`:248-256`); `assertValidity` (`:258-262`); `validityAt(content, now)` (`:267-271`) devuelve `SCHEDULED` si `startsAt` es futuro, `EXPIRED` si `endsAt <= now`, si no `ACTIVE` (ventana `[startsAt, endsAt)`); `isCampaignContent` (`:273-276`) solo exige `kind` HERO o POPUP; `stableStringify` (`:279-288`) compara dos JSON con claves ordenadas.

### 4.4 Filas heredadas sin `kind`

La migración `20261009160000` sembró 2 promociones del sistema anterior con otra forma de JSON (la forma antigua no se verificó, `[no verificado]`). Este módulo las ignora por tres vías:

1. `list()` filtra en SQL `("draft"->>'kind') IN ('HERO','POPUP')` (`service.ts:243`) y otra vez con `isCampaignContent` (`:246`).
2. `get`, `update`, imágenes, publicar, retirar y eliminar pasan por `loadRow`/`contentOf` (`:116-119`, `:154-158`), que responde 404 «Campaña no encontrada» si el `draft` no tiene `kind` válido.
3. La lectura pública filtra por `publishedData->>'kind'` en SQL (`:493`) y por `isCampaignContent` (`:495`).

Migración `20261104090000_remove_legacy_storefront_banners/migration.sql`: `DELETE FROM "storefront_banners" WHERE "id" IN ('3f7e1741-886c-4c54-931c-7aa577035e01','3f7e1741-886c-4c54-931c-7aa577035e02')`. Está sin commit y sin aplicar con Prisma. Según el handoff de la demo, en la base de la demo se borraron a mano (`[no verificado aquí]`).

### 4.5 Control optimista por `revision` (409)

- `commit` (`service.ts:136-152`) hace `updateMany({ where: { id, revision } , data: { ..., revision: { increment: 1 } } })`; si `count` es 0 lanza 409 con `CONFLICT_MESSAGE` (`:54`).
- `update` compara además `dto.revision` con la leída (`:308`). `publish` compara solo si el cliente mandó `revision` (`:396`). `remove` usa `deleteMany({ id, revision })` (`:464`).
- Si `update` no cambia ningún campo real no sube la revisión ni audita (`:321-324`).
- Subir revisión ocurre en cada escritura de borrador, publicación y retiro. Por eso `revision` del detalle puede ser mayor que la que mostraba el formulario si alguien más guardó; el frontend la envía tal como la recibió (`CampaignEditor.tsx:172`, `:208`).

### 4.6 SQL crudo y por qué

| Dónde | Qué | Por qué |
|---|---|---|
| `list()` `service.ts:233-244` | `$queryRaw` con `"draft" - 'imageDesktop' - 'imageMobile' - 'image'` (operador `-` de JSONB), `->>` para banderas, y `"publishedData" = "draft"` para `samePublished` | Prisma no puede quitar claves de un JSON ni comparar JSON en la consulta; así la lista no arrastra megabytes de base64. |
| `publish` `:394` | `SELECT pg_advisory_xact_lock(hashtext('marketing_campaigns_publish'))` | Serializa publicaciones concurrentes para que el límite por tipo no se rebase por carrera. El bloqueo se libera al cerrar la transacción. |
| `publish` `:410-415` | `$queryRaw` de las otras publicadas del mismo `kind` con `("publishedData"->>'endsAt')` | Contar cupo sin traer imágenes. |
| `listPublic` `:485-493` | `$queryRaw` solo sobre `publishedData` | Nunca lee `draft` (hay prueba: «nunca consulta la columna del borrador»). |
| `publicImage` `:537-542` | `("publishedData"->>${field}::text)` | Trae solo la imagen pedida. |

El SQL no se probó contra Postgres real en pruebas automáticas: el servicio se prueba con una base en memoria que reconoce las consultas por fragmentos de texto (`service.spec.ts:60-93`). Lo único contra Postgres real fue el uso manual en la demo (`[no verificado aquí]`).

### 4.7 Auditoría

Todas las escrituras usan `AuditService.logTx(tx, {...})` dentro de la misma transacción (`service.ts:293`, `:326`, `:358`, `:379`, `:427`, `:445`, `:466`). Si la auditoría falla, se revierte la escritura (hay prueba, `service.spec.ts:404-427`). Entidad `MarketingCampaign` (`:37`). Eventos (`:38-46`):

| Evento | Cuándo | Datos guardados |
|---|---|---|
| `marketing_campaign_create` | crear | `newValues`: metadatos + `hasImage*` |
| `marketing_campaign_edit` | editar | `oldValues`/`newValues` solo de los campos que cambiaron |
| `marketing_campaign_image_upload` | subir imagen | `slot, mime, width, height, bytes` (sin bytes de imagen) |
| `marketing_campaign_image_remove` | quitar imagen | `slot, removed: true` |
| `marketing_campaign_publish` | publicar | `oldValues { published }`, `newValues { published, revision, ...metadatos }` |
| `marketing_campaign_unpublish` | retirar | `published: true` a `false` |
| `marketing_campaign_delete` | eliminar | `oldValues`: metadatos |

`auditSnapshot` (`:97-99`) nunca incluye los base64. El `userId` sale de `user.sub ?? user.id` (`controller.ts:43`); sin usuario responde 403 (`service.ts:111-114`).

## 5. Permisos y paneles

### 5.1 Acciones (`access-catalog.ts:176-182`)

| Acción | Etiqueta del catálogo | Alcances | Depende de |
|---|---|---|---|
| `marketing:read` | Ver campañas | solo `global` | ninguna |
| `marketing:create` | Crear campaña | `global` | `marketing:read` |
| `marketing:edit` | Editar campaña | `global` | `marketing:read` |
| `marketing:publish` | Publicar y retirar campañas | `global` | `marketing:read` |
| `marketing:delete` | Eliminar campaña | `global` | `marketing:read` |

Preparar y editar no publican; publicar no edita (pruebas en `access-catalog.spec.ts:603-612`).

### 5.2 Paquetes asignables (`access-catalog.ts:420-436`)

| Paquete (id) | Nombre | Acciones que incluye (todas `global`) |
|---|---|---|
| `marketing-consulta` | Ver banners y pop-ups | `read` |
| `marketing-edicion` | Preparar banners y pop-ups | `read`, `create`, `edit`, `delete` |
| `marketing-publicacion` | Publicar y retirar banners | `read`, `publish` |

Se pueden combinar. Solo los paquetes `marketing-*` conceden acciones de marketing (prueba `access-catalog.spec.ts:614-619`). Ningún paquete se asigna automáticamente.

### 5.3 Versión del catálogo

`ACCESS_CATALOG_VERSION = 'panels-20261104-1'` en el backend (`access-catalog.ts:31`) y en el frontend (`users.service.ts:45`). Deben coincidir: el servidor rechaza una asignación cuya versión no sea la vigente (`access-assignments.service.ts:726`). Si cambias el catálogo, sube la versión en los dos sitios y en `access-catalog.spec.ts:390` (comprueba el valor literal).

### 5.4 Cómo aparece en «Asignar paneles»

`/users/access` (solo Super Admin, `App.tsx:146`). `UserAccessAssignments.tsx:51-56` define `PACKAGE_PANELS`; el bloque «Marketing y mercadeo» lista los tres paquetes (`:54`) y se pinta con la rama genérica de paquetes (`:295-310`: nombre, fuente, acciones con su etiqueta y casilla «Asignar paquete»). Las etiquetas de las acciones vienen de `ACTION_LABELS` (`access.ts:156-160`: «Ver banners y pop-ups», «Crear», «Editar», «Publicar y retirar», «Eliminar»).

### 5.5 Qué valida cada lado (diferencia con Biblioteca)

| | Navegador | Servidor |
|---|---|---|
| Biblioteca | Exige el panel asignado (paquete) y la acción. | Comprueba la acción global (y, según el endpoint, otras reglas de Biblioteca). |
| Marketing | `hasMarketingAction` (`marketing-access.ts:50-54`): Super Admin siempre; si no, exige un paquete `marketing-*` aplicado (`:39-43`) Y la acción con alcance `global`. Una acción suelta sin paquete no abre el panel. | `@RequireGrant('marketing:...')` (`GrantGuard`, `require-grant.ts:44-62`) comprueba solo la acción con alcance global. **No comprueba el paquete.** |

Consecuencia: una persona con la acción `marketing:read` asignada de forma manual (sin paquete) no ve el panel, pero sí podría llamar a la API directamente. Hoy no hay ruta que asigne la acción suelta desde la pantalla de marketing; endurecer el servidor para exigir el paquete queda pendiente (sección 12).

Rutas del navegador: `App.tsx:159` protege `/marketing` con `<AccessBoundary marketingPanel actions={['marketing:read']}>`. `AccessBoundary` (`:67-95`) con `marketingPanel` evalúa `hasMarketingAction(input, 'read')` (`:85-86`) y, si no pasa, muestra «No tienes acceso a este apartado». El ítem del menú aparece si `marketingRead` y no es vendedor (`Header.tsx:40`, `:451-455`).

### 5.6 Documentos de permisos

- `docs/PANELES-Y-PERMISOS.md:6-15`: describe los tres paquetes, las acciones y la versión `panels-20261104-1`. Coincide con el código. El resto del archivo (desde la línea 18) es el acuerdo de producto del 8 de octubre y no se revisó contra el código.
- `docs/MARKETING-BANNERS.md` (guía de usuario): desactualizada en estos puntos frente al código actual:
  - Línea 7: dice que el panel «tiene una pestaña, Banners». Hoy `/marketing` es un índice de páginas con una tarjeta «Banners» (`MarketingIndex.tsx`) y `/marketing/banners` es la página.
  - Líneas 9 y 29: usan «Banner del título». La tarjeta se llama «Banners de inicio» (`CampaignSection.tsx:22`). (Los mensajes del backend aún dicen «banners del título».)
  - Paso 8 (línea 35): dice que la vista previa «muestra cómo se verá». Hoy el editor se abre en un panel lateral de 560 px y la vista previa es la portada real de la tienda a la izquierda, con modo móvil compacto (sección 6.4).
  - No menciona el botón «Ver» (solo lectura) ni el aviso de cambios sin guardar al cerrar.
- `odd/tasks/marketing-campanas.md`: desactualizado. Línea 3 dice «Sin código escrito»; las tareas M0-M5 (líneas 34-39) siguen sin marcar; habla de la pestaña «Campañas» como si fuera la actual. Ya lo notaba el handoff de la demo (riesgo 13).

## 6. Frontend de administración

### 6.1 Rutas y menú

- `App.tsx:158-162`: `<Route path="marketing" element={<AccessBoundary marketingPanel actions={['marketing:read']}><MarketingLayout /></AccessBoundary>}>` con hijas `index` (`MarketingIndex`) y `banners` (`BannersTab`). Las rutas son `/marketing` y `/marketing/banners`.
- `marketing-access.ts:7-9`: `MARKETING_PANEL_LABEL = 'Marketing y mercadeo'`, `MARKETING_PATH = '/marketing'`, `MARKETING_BANNERS_PATH = '/marketing/banners'`. `MARKETING_PAGES` (`:18-20`) tiene una sola página: «Banners», «Imágenes de la portada de la tienda y ventana emergente». «Campañas» no está listada (futura).
- Menú: `Header.tsx:451-455`, `NavItem` a `/marketing` activo mientras la ruta empieza por `/marketing`.

### 6.2 `marketing-api.ts`

Usa el cliente `api` (axios, `../../services/api`) con base `/marketing/campaigns` (`:63`). Claves de React Query: `campaignsKey = ['marketing','campaigns']` (`:65`), `campaignKey(id)` (`:66`). Funciones: `fetchCampaigns()` (`:68`), `fetchCampaign(id)` (`:72`), `createCampaign(input)` (`:76`), `updateCampaign(id, input + revision)` (`:80`), `uploadCampaignImage(id, slot, file)` (`:84`, `FormData` con campo `file`), `removeCampaignImage` (`:90`), `publishCampaign(id, revision)` (`:94`), `unpublishCampaign` (`:98`), `deleteCampaign` (`:102`). Tipos: `CampaignSummary`, `CampaignDraft`, `CampaignDetail`, `CampaignFields`.

### 6.3 `marketing-rules.ts` (espejo del servidor)

- `CAMPAIGN_IMAGE_RULES` (`:28-32`), `MAX_IMAGE_BYTES`, `MAX_IMAGE_SIDE_PX`, `MAX_PUBLISHED`, límites de texto (`:35-40`): copia de los valores de `rules.ts` del backend. El servidor es la autoridad; si no coinciden, el servidor rechaza.
- Validación en el navegador: `validateImageFile` (`:64`, tipo y peso), `validateImageDimensions` (`:76`), `readImageSize` (`:94`, usa `Image` del DOM), `checkImageSelection` (`:111`).
- Estados: `campaignStatus` (`:136-144`): `Borrador`, `Programado`, `Vencido`, `Publicado`, `Publicado con cambios sin publicar`, con `tone` para `Badge`.
- Vista previa: `PREVIEW_CANVAS_WIDTH = { desktop: 1280, mobile: 390 }` (`:158`), `previewScale` (`:161`), `emptyPreviewText` (`:167`), `draftToCampaigns` (`:186-196`, convierte el borrador al formato público con `id: 'preview'`), `previewImageStyle` (`:198`), `measureGuideText` (`:51`).
- Fechas en hora Colombia (UTC-5 sin horario de verano): `localInputToIso` (`:206`, agrega `-05:00`), `isoToLocalInput` (`:215`), `formatCampaignDate` (`:222`, `es-CO`, zona `America/Bogota`), `validityText` (`:227`).
- `isRevisionConflict(error, 'edit'|'other')` (`:235-242`): en `PATCH` todo 409 es conflicto de revisión; en otras operaciones solo si el mensaje contiene «cambió mientras la editabas», porque publicar/retirar/eliminar usan 409 para reglas de negocio.

### 6.4 Estado actual de la pantalla (leído del código)

- `BannersTab.tsx`: título «Banners», texto «Elige qué quieres cambiar. Al crear o editar se abre un panel a la derecha.» y dos tarjetas (`CampaignSection` HERO y POPUP) en dos columnas desde 1024 px (`lg:grid-cols-2`). Consulta la lista con `useQuery` solo si hay `read`.
- `CampaignSection.tsx`: copias por tipo (`:12-39`): HERO «Banners de inicio» («Carrusel de imágenes que se ve arriba, en la portada de la tienda. Se muestran por orden.»), POPUP «Pop-up». Muestra «Publicados: N de M permitidos» (`:96-98`), botón «Nuevo banner/pop-up» solo con `create`, y la lista ordenada por `position` y nombre, con insignias de estado y botón «Editar» o «Ver» (`edit` o no). El formulario ya no está en la página: vive en el `Drawer` (`:136-158`) con `aside` = `CampaignPreview` cuando el editor reportó datos de vista previa.
- `Drawer.tsx`: panel a la derecha de 560 px (`md:w-[560px]`, `:87`); pantalla completa en teléfono. Desde 1024 px el `aside` ocupa el espacio a la izquierda del panel, sobre el fondo oscurecido (`index.css:252-261`, `right: 560px`); debajo de 1024 px el `aside` va arriba del contenido del panel (`Drawer.tsx:103`). Es modal: bloquea el scroll, atrapa el foco, cierra con Escape o clic en el fondo, y devuelve el foco (`:33-71`).
- Cerrar con cambios sin guardar: el editor informa `dirty` (campos distintos del último guardado) por `onDirtyChange`; `requestClose` pregunta con `window.confirm('Hay cambios sin guardar. ¿Salir sin guardarlos?')` (`CampaignSection.tsx:75-77`, `unsaved-guard.ts`).
- `CampaignEditor.tsx`: campos «Nombre interno» (obligatorio, no se muestra en la tienda), «Texto alternativo (obligatorio para publicar)», «Enlace (opcional)», solo HERO «Orden (menor primero)» y fieldset «Encuadre en el marco» (ajuste `cover|contain`, foco horizontal y vertical 0-100), «Inicio»/«Fin» (hora Colombia). Un bloque por slot (`SLOTS_BY_KIND`, `:318-343`) con guía de medidas, selector de archivo y «Quitar imagen». Un borrador nuevo debe guardarse antes de subir imágenes (`:336-337`). El navegador revisa archivo y medidas antes de subir (`:187-188`). Botones: «Guardar borrador/cambios» (con `create` o `edit`), «Publicar»/«Publicar cambios» (con `publish`, desactivado si hay cambios sin guardar), «Retirar de la tienda» (`publish` y publicado), «Eliminar borrador» (`delete` y no publicado; confirma con `window.confirm`), «Cerrar» (`:359-373`). Un 409 de revisión muestra «Otra persona cambió esto; recarga para ver la versión nueva» y «Recargar» (`:349-354`).
- Mapa de permisos de la pantalla (`marketingPermissions`, `marketing-access.ts:66-76`): `images = create || edit`; `editable = detail ? edit : create` (`CampaignEditor.tsx:111`).
- `CampaignPreview.tsx`: iframe same-origin de `PREVIEW_PATH` (`/tienda?vista-previa-campana=1`, `preview-frame.ts:9`). Recibe el borrador por `postMessage` con tipo `gs-campaign-preview:data` y el padre escucha `:ready` y `:layout` solo de su propio iframe y origen (`:81-95`). Selector «Escritorio / Móvil» (lienzo 1280 o 390 px, se reduce a escala para caber, nunca se agranda). Debajo de 1024 px (`useWideScreen` falso) es «compacto»: empieza en Móvil, tiene «Ocultar/Mostrar vista previa», y alinea el banner entero (`:99-103`). Es solo lectura: se puede desplazar (rueda, tacto o teclas en la región) pero no usar (`:105-122`). Texto de ayuda si no hay imagen (`emptyPreviewText`).
- `MarketingLayout.tsx`: título `h1`, «Cargando tus accesos…» mientras carga, «Sin acceso a este panel» sin `read`, migas «Marketing y mercadeo / Banners» dentro de una página (`:27-35`).

## 7. Frontend público

Integración: `StorefrontHome.tsx:49` (`const { campaigns } = useStorefrontCampaigns()`), `:92` (`<HeroBanner campaigns={campaigns.hero} />` dentro del panel del héroe), `:94` (`<CampaignPopup popup={campaigns.popup} />`). Ruta `/tienda` en `App.tsx:188`.

### 7.1 Datos

`useStorefrontCampaigns` (`hooks/useStorefrontCampaigns.ts:107-127`): estado `{ status: 'loading'|'ready'|'error', campaigns }`; empieza con `EMPTY_CAMPAIGNS` y vuelve a ello si falla. Una sola petición: `fetchStorefrontCampaigns(signal)` (`services/storefront-campaigns.service.ts:5-8`) hace `api.get('/storefront/campaigns', { signal })` (axios, no `fetch` directo) y pasa el resultado por `normalizeCampaigns`. Se cancela con `AbortController` al desmontar (`:115-123`).

Por qué no TanStack Query: el código no lo explica. Lo que sí se ve es que el hook necesita un caso especial (el iframe de vista previa no pide nada y recibe el borrador por mensaje, `:114`) y que un error deja la portada con su respaldo sin reintentos ni caché. La razón de diseño exacta `[no verificado]`.

`normalizeCampaigns` (`utils/campaigns.ts:93-107`): desenvuelve hasta 3 niveles de `data`, ignora todo lo inesperado (devuelve vacío), descarta campañas sin id o imagen, limita a 6 y descarta enlaces que no sean ruta interna o `http(s)` (`asLink` + `linkKind`, `:46-49`, `:115-120`). Nota: el frontend acepta `http://` externo; el servidor solo guarda `https://` (`rules.ts:236`).

### 7.2 Carrusel (`HeroBanner.tsx`)

- Sin campañas: `FallbackArt` (`:21-33`), la foto de la cámara `/images/home/storefront-art.png` como fondo; el héroe nunca queda vacío ni salta.
- Auto-avance cada `HERO_INTERVAL_MS = 6000` (`campaigns.ts:35`) con `setTimeout` (`:97-101`), solo si hay más de 1 diapositiva (`running`, `:95`).
- Pausas: pasar el cursor o enfocar dentro (`interacting`, `:113-117`), pestaña oculta (`useTabHidden`, `:66-74`), botón «Pausar/Reanudar el cambio automático» (`manualPause`, `:130-135`) y `prefers-reduced-motion` (`usePrefersReducedMotion`; con movimiento reducido arranca pausado, `paused = manualPause ?? reducedMotion`, `:94`). La transición CSS usa `motion-reduce:transition-none` (`:47`).
- Controles (solo si hay más de 1): anterior, pausa, un punto por diapositiva, siguiente, todos de 44 px (`h-11 min-w-11`, `:18`, `:125-154`). `nextIndex(current, delta, count)` da la vuelta (`campaigns.ts:123-126`).
- Accesibilidad: `section` con `aria-roledescription="carrusel"` y `aria-label="Promociones"`; cada diapositiva `role="group"` con «N de M» y `aria-hidden` si no está activa; `aria-live` es `off` mientras corre solo y `polite` si no (`:119`).
- Imágenes: `<picture>` con `<source media="(max-width: 767px)">` si hay imagen de móvil (`:50-51`); la primera con `fetchpriority="high"`, las demás `loading="lazy"` (`:39`); `objectFit` y `objectPosition` salen de `fit`, `focusX`, `focusY` (`:57`).
- Marco: si todas las diapositivas tienen imagen de móvil, en pantallas pequeñas el marco es 4:3 con tope de altura (`FRAME_MOBILE_PIECE`, `:15`); si no, 2,37:1 (`FRAME_WIDE_PIECE`, `:16`).
- Enlace: `CampaignLink` (interno por `Link`, externo con `target="_blank" rel="noreferrer noopener"`, sin enlace como `div`).

### 7.3 Pop-up (`CampaignPopup.tsx`)

- `CampaignPopup` decide entre `LivePopup` y `PreviewPopup` según `isCampaignPreviewFrame()` (`:127-129`).
- `LivePopup` (`:146-176`): espera `POPUP_DELAY_MS = 3000` (`campaigns.ts:36`), solo si `shouldShowPopup(popup)` (hay pop-up y no se vio en esta sesión). Precarga la imagen con `new Image()` y solo abre y marca como visto cuando carga (`:158-162`); si no carga, no abre. Se identifica por `id` y `revision` (`:172`).
- «Una vez por sesión»: `sessionStorage` con la clave `storefront:popup:<id>:<revision>` (`popupSessionKey`, `campaigns.ts:128-130`; `markPopupSeen` `:155`; `wasPopupSeen` `:146`). Editar y republicar sube la revisión, así que el pop-up vuelve a salir una vez. Si el almacenamiento falla, se ignora el error (puede salir otra vez).
- `PopupDialog` (`:61-117`): `role="dialog"`, `aria-modal`, `aria-label` = texto alternativo o «Promoción»; mueve el foco al botón «Cerrar», atrapa Tab, cierra con Escape o clic en el fondo, bloquea el scroll del `body` y lo restaura; devuelve el foco. Solo la imagen (`max-h-[85vh] max-w-[90vw]`, `object-contain`) y el botón «Cerrar» de 44 px. Un error al cargar la imagen cierra el diálogo (`onError={onClose}`, `:33`). El clic en la imagen sigue el enlace y cierra.
- `PreviewPopup` (`:135-144`): dentro del iframe de vista previa se muestra de inmediato, sin enlace, sin foco, sin Escape y sin marcar como visto.

### 7.4 Modo vista previa (iframe) y su aislamiento

`isCampaignPreviewFrame()` (`preview-frame.ts:27-34`) es verdadero solo si la página está dentro de un iframe (`window.self !== window.top`) y la URL trae `?vista-previa-campana`. Una visita normal a `/tienda` nunca se ve afectada. En ese modo `startPreviewFrame` (`useStorefrontCampaigns.ts:19-101`): no llama a la API, bloquea clics, envíos, teclas y menú contextual (`BLOCKED_EVENTS`, `:11`, `:84`), fija la cabecera arriba con una hoja de estilo inyectada, oculta el botón flotante de WhatsApp (`:80`), avisa `gs-campaign-preview:ready` al padre (`:89`), recibe el borrador (`readPreviewMessage` exige mismo origen y que el emisor sea `window.parent`, `preview-frame.ts:37-43`) y devuelve la posición del banner (`gs-campaign-preview:layout`).

## 8. Librerías

Versiones declaradas en `package.json`; entre paréntesis, la instalada leída de `node_modules` el 2026-11-04.

### 8.1 Backend (`src/backend/package.json`)

| Librería | Versión | Uso en este trabajo |
|---|---|---|
| `@nestjs/common`, `@nestjs/core` | `^11.2.3` | Controladores, guards, excepciones, pipes. |
| `@nestjs/platform-express` | `^11.2.3` (11.2.3) | `FileInterceptor` (subida con multer). |
| `multer` | transitiva de la anterior (2.2.0) | Procesa `multipart/form-data`; no está declarada en `package.json`. `@types/multer ^2.2.0` sí. |
| `@nestjs/throttler` | `^6.5.0` | `@Throttle` en el controlador público y guard global. |
| `@nestjs/swagger` | `^11.4.7` | `@ApiTags`, `@ApiOperation`, `@ApiProperty`. |
| `class-validator` / `class-transformer` | `^0.14.1` / `^0.5.1` | Validación y `@Transform(trim)` de los DTO. |
| `@prisma/client` / `prisma` | `6.19.3` | `StorefrontBanner`, `$queryRaw`, `$executeRaw`, `Prisma.DbNull`. |
| `helmet` | `^7.1.0` | Cabeceras de seguridad globales (`main.ts:17`). |
| `jest` / `ts-jest` / `supertest` | `^30.4.2` / `^29.4.12` / `^7.2.2` | Pruebas (`jest.config.ts`, `rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`, entorno `node`). |
| `typescript` | `^5.6.0` | |

No se usa ninguna librería de imágenes: las medidas se leen de la cabecera a mano (`rules.ts:108-159`).

### 8.2 Frontend (`src/frontend/package.json`)

| Librería | Versión | Uso |
|---|---|---|
| `react` / `react-dom` | `^18.3.0` | UI. En React 18 `fetchPriority` no existe como prop, por eso se pasa `fetchpriority` en minúsculas (`HeroBanner.tsx:38-39`). |
| `react-router-dom` / `react-router` | `^7.18.3` (7.18.4) | Rutas y `Link`. |
| `@tanstack/react-query` | `^5.60.0` | Lista y detalle en administración (no en la tienda pública). |
| `axios` | `^1.7.0` | Cliente `api` (`withCredentials: true`). |
| `zustand` | `^5.0.0` | Almacén de sesión (`useAuthStore`). |
| `tailwindcss` | `^3.4.0` (3.4.19) | Estilos. |
| `vite` | `^6.0.0` | Servidor de desarrollo y build. |
| `vitest` | `^5.0.1` (5.0.3) | Pruebas. No hay `jsdom` ni `@testing-library` declarados: los componentes se prueban con `renderToStaticMarkup` de `react-dom/server` (`marketing-panel.spec.tsx:2`). |
| `eslint` `^9.13.0`, `typescript` `^5.6.0` | | Lint y tipos. |

## 9. Verificación

Corrida hoy 2026-11-04 en este worktree (solo comandos de lectura).

| Comando | Desde | Resultado real |
|---|---|---|
| `npx jest src/modules/marketing-campaigns src/common/security/access-catalog` | `src/backend` | `Test Suites: 3 passed, 3 total`; `Tests: 169 passed, 169 total`; 52,6 s. |
| `npx tsc -b --noEmit` | `src/frontend` | Sin salida (sin errores). |
| `npx eslint src/features/marketing src/features/storefront` | `src/frontend` | Sin salida (sin avisos). |
| `npx vitest run src/features/marketing src/features/storefront` | `src/frontend` | `Test Files 30 passed (30)`; `Tests 348 passed (348)`; 11,2 s. |

Notas: `tsc -b` escribe `tsconfig.tsbuildinfo`, ignorado por git (`.gitignore:9`). Las pruebas del backend no tocan base de datos (base en memoria). Las del frontend no ejecutan eventos de navegador (sin `jsdom`), así que clics, `postMessage` y temporizadores no tienen prueba automática; solo las funciones puras (`nextIndex`, `readPreviewMessage`, etc.) y el HTML renderizado.

## 10. Recetas

### 10.1 Añadir una nueva sección de campañas (p. ej. franja de anuncio)

1. Backend `rules.ts`: añade el valor a `CAMPAIGN_KINDS` (`:10`), sus slots a `CAMPAIGN_SLOTS` (`:13`) y `SLOTS_BY_KIND` (`:19`), un límite en `MAX_PUBLISHED` (`:49`) y, si hay imágenes, una entrada en `CAMPAIGN_IMAGE_RULES` (`:67`). Si necesita un campo nuevo (p. ej. texto), añádelo a `CampaignContent` (`:25`), a los DTO (`dto.ts`) y a `create`/`update`/`describe` del servicio.
2. Servicio: `SLOT_FIELD` (`service.ts:48`) para el campo de la imagen; mensajes de `assertSlot` (`:125-133`) y de límite (`:419-423`); `list` ordena con `kindOrder` (`:259`); `listPublic` (`:484-529`) añade la nueva clave a la respuesta y su filtro SQL `IN ('HERO','POPUP')` (`:243`, `:493`); `isCampaignContent` ya lo acepta por `CAMPAIGN_KINDS`.
3. Frontend: tipos y espejo en `marketing-rules.ts` (`CampaignKind`, `CampaignSlot`, `CAMPAIGN_IMAGE_RULES`, `SLOTS_BY_KIND`, `MAX_PUBLISHED`), `marketing-api.ts`, una tarjeta en `BannersTab.tsx` o una página nueva (añádela a `MARKETING_PAGES` en `marketing-access.ts:18` y una `Route` hija en `App.tsx:159-162`), la copia por tipo en `CampaignSection.tsx:12-39`, y el espacio de la vista previa en `CampaignPreview.tsx` / `draftToCampaigns` (`marketing-rules.ts:186`).
4. Tienda pública: `utils/campaigns.ts` (tipos y `normalizeCampaigns`), un componente nuevo y su lugar en `StorefrontHome.tsx`.
5. Pruebas: añade casos a las specs de las sección 2 y corre la sección 9. Si no cambias permisos no hay que tocar el catálogo.

### 10.2 Cambiar las medidas de imagen (tres sitios)

1. `src/backend/src/modules/marketing-campaigns/marketing-campaigns.rules.ts:67-89` (`CAMPAIGN_IMAGE_RULES`; el comentario `:62-66` dice que es el único cambio del backend).
2. `src/frontend/src/features/marketing/marketing-rules.ts:28-32` (espejo; si cambia el peso o el lado máximo, también `:35-36`, y `rules.ts:44-46` en el backend; el mensaje «máximo 3 MB» está escrito a mano en `rules.ts:169` y en `marketing-rules.ts:53` y `:70`).
3. La guía de usuario `docs/MARKETING-BANNERS.md` (tabla «Medidas de las imágenes», líneas 42-46) y la decisión de producto en `odd/tasks/marketing-campanas.md:22`.
4. Además: los textos de ayuda del editor que citan «768 px» no dependen de las medidas; las pruebas con cifras exactas están en `marketing-rules.spec.ts` y `marketing-panel.spec.tsx` («muestra la guía de medidas…», `:235-243`, y «900 × 900», `:361`) y en `marketing-campaigns.rules.spec.ts`. Las imágenes ya subidas no se revalidan.

### 10.3 Añadir un permiso

1. Backend `access-catalog.ts`: nueva `action('marketing:xxx', etiqueta, propósito, CATALOG_SCOPES, ['marketing:read'])` en `:176-182`; incluirla en el paquete que corresponda (`:420-436`) con `selection('marketing:xxx', 'global')`; el chequeo de carga (`:440-454`) lanza error si el paquete referencia una acción desconocida o con alcance no permitido.
2. Sube `ACCESS_CATALOG_VERSION` (`:31`), `users.service.ts:45` y la prueba literal `access-catalog.spec.ts:390`.
3. Usa `@RequireGrant('marketing:xxx')` en el método del controlador y actualiza `service.spec.ts:149-159`.
4. Frontend: `ACTION_LABELS` (`access.ts:156-160`), `MarketingAction` y `marketingPermissions` (`marketing-access.ts:22`, `:56-76`), y úsalo en el editor.
5. Documenta en `docs/PANELES-Y-PERMISOS.md:6-15`. Cambiar el catálogo no se despliega solo: la asignación exige la versión nueva en navegador y servidor.

### 10.4 Probar contra la demo

El procedimiento completo (llave SSH, IP del contenedor `gs-test-demo-api-marketing`, túnel `-L 8080:<ip>:3000`, `VITE_API_TARGET=http://localhost:8080 npx vite --port 5175 --strictPort`) está en [2026-11-04-demo-vps-sesiones-y-pendientes.md](2026-11-04-demo-vps-sesiones-y-pendientes.md), secciones 4 a 6. No lo repitas aquí. Recuerda: cada acción sobre el VPS, contenedores, bases o migraciones exige aprobación explícita del usuario (`AGENTS.md`). Para validar sin servidor: `curl http://localhost:8080/api/storefront/campaigns` debe devolver `{"data":{"hero":[...],"popup":...}}`. En el navegador, `/tienda` muestra los publicados y `/marketing/banners` administra (con Super Admin o con un paquete `marketing-*`).

## 11. Riesgos y deuda

1. **El servidor no exige el paquete**, solo la acción global (sección 5.5). Una acción asignada suelta permite llamar a la API sin ver el panel.
2. **SQL crudo sin prueba contra Postgres real** (operador `-` de JSONB, `pg_advisory_xact_lock`, comparación `"publishedData" = "draft"`). Las pruebas usan una base en memoria que reconoce las consultas por texto; un cambio de redacción del SQL rompe esas pruebas sin que Postgres haya validado nada.
3. **Imágenes en base64 dentro de JSONB**: `GET /:id` devuelve el borrador completo (hasta 3 imágenes de hasta 3 MB, más 33 % de base64) y cada publicación duplica los bytes en `publishedData`. La lista pública no las lee, pero la fila crece. No se midió el impacto `[no verificado]`.
4. **Doble sitio de medidas** (backend y `marketing-rules.ts`) y mensajes «3 MB» escritos a mano: se desfasan si se cambia uno solo.
5. **Límite de 20 peticiones por minuto por defecto** en las rutas de administración (`app.module.ts:47-58`); al subir varias imágenes seguidas podría alcanzarse según la variable `THROTTLE_LIMIT` `[no verificado en la demo]`.
6. **Carrera de publicación** cubierta con bloqueo asesor, pero `publish` sin `revision` en el cuerpo no detecta cambios del borrador entre la lectura y la copia (el frontend siempre la envía, `CampaignEditor.tsx:208`).
7. **Enlace `http://`**: el servidor lo rechaza, el navegador público lo acepta si llegara en la respuesta (`campaigns.ts:117-119` frente a `rules.ts:236`). Hoy no hay forma de que llegue.
8. **Mensajes del servidor** dicen «banner del título» y la interfaz dice «Banners de inicio».
9. **Vista previa por iframe** depende del mismo origen y de que `/tienda` mantenga `section[aria-roledescription="carrusel"]` y `header` (`useStorefrontCampaigns.ts:29-30`); un cambio de marcado en el héroe rompe la alineación.
10. **Datos de PRUEBA publicados en la demo** (sección 12, punto 5).
11. **Todo sin commit** en este worktree; un cambio de rama o `git clean` lo perdería.

## 12. Pendientes

Hecho: backend completo (módulo, controladores, servicio, reglas, auditoría, 169 pruebas), permisos y paquetes, pantalla de administración con panel lateral y vista previa, carrusel y pop-up públicos, guía de usuario, despliegue a la demo.

No hecho:

1. Pestaña futura «Campañas» (una campaña reunirá más cosas que un banner). `MARKETING_PAGES` solo tiene «Banners».
2. Revisión visual pendiente (según el handoff de la demo, sección 10 punto 8): tablet, pop-up en móvil, banner sin imagen, cabecera en la vista previa móvil. No verificado por esta sesión.
3. Pruebas del SQL contra Postgres real (y pruebas HTTP de extremo a extremo con multer y el filtro de errores).
4. Endurecer el servidor para exigir el paquete `marketing-*`, no solo la acción.
5. Limpiar los 3 banners y el pop-up de PRUEBA publicados en la demo («PRUEBA banner 1 - Cámaras», «PRUEBA banner 2 - Alarmas», «PRUEBA banner 3 - Control de acceso», «PRUEBA pop-up - Promoción»; según el handoff de la demo, `[no verificado aquí]`). Retirar y eliminar desde el panel tras la validación del usuario.
6. Actualizar `docs/MARKETING-BANNERS.md` y `odd/tasks/marketing-campanas.md` (sección 5.6).
7. Aplicar, con aprobación, la migración `20261104090000_remove_legacy_storefront_banners` donde corresponda.
8. Nunca se ha desplegado a producción; cualquier despliegue, migración o commit exige aprobación explícita (`AGENTS.md`).

## Cómo se hizo

1. Un agente de backend escribió el módulo `marketing-campaigns` (reglas, servicio, controladores, DTO, helpers y pruebas).
2. Otro agente construyó la administración (`features/marketing`), y una sesión posterior la rediseñó (índice de páginas, dos tarjetas, panel lateral de 560 px, vista previa con la portada real).
3. Otro agente hizo la portada pública (carrusel, pop-up, vista previa en iframe, servicio y hook).
4. Otro agente añadió las acciones, los paquetes, la versión del catálogo y el bloque en «Asignar paneles».
5. La sesión principal verificó cada parte; este documento lo redactó un agente de documentación leyendo el código del 2026-11-04 y corriendo los comandos de la sección 9.

## Referencias

- [Handoff de la demo en el VPS](2026-11-04-demo-vps-sesiones-y-pendientes.md)
- [Guía de usuario: Marketing y banners](../MARKETING-BANNERS.md) (desactualizada, sección 5.6)
- [Cómo se asigna el trabajo: paneles y permisos](../PANELES-Y-PERMISOS.md)
- [Plan del panel de Marketing](../../odd/tasks/marketing-campanas.md) (desactualizado)
- [README de traspasos](README.md)
- [Mapa de la tienda pública](../MAPA-TIENDA-PUBLICA.md)
