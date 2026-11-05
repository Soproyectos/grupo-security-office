# Diccionario de datos: esquema actual de los modelos de biblioteca

> **Generado automáticamente** a partir de `src/backend/prisma/schema.prisma` (commit base `cb230aa`). No se edita a mano: se regenera con `node docs/biblioteca-dominio/herramientas/generar-diccionario.js <schema.prisma> <salida.md> <commit>`. Describe el estado **actual** (un solo esquema); los cambios propuestos están en [modelo-de-datos.md](./modelo-de-datos.md).
> Convención: `?` = admite NULL. «Relación» lista llaves foráneas declaradas en Prisma; los índices únicos que solo existen en migraciones SQL (por ejemplo el SKU normalizado) no aparecen aquí.

## Product → tabla `products`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| sku | String | no | @unique |
| name | String | no | — |
| description | String | sí | — |
| categoryId | String | no | — |
| brandId | String | no | — |
| technicalSpecs | Json | sí | — |
| isActive | Boolean | no | @default(false) |
| isVisible | Boolean | no | @default(false) |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |
| extraAttributes | Json | sí | — |
| listaId | String | sí | — |
| publishAt | DateTime | sí | — |
| publishStatus | String | no | @default("borrador") |
| publishedAt | DateTime | sí | — |
| publishedById | String | sí | — |
| unpublishAt | DateTime | sí | — |
| unpublishReason | String | sí | — |
| documents | Json | sí | — |
| lifecycleStatus | String | no | @default("DRAFT") |
| nameSource | String | no | @default("sistema") |
| nameLockedAt | DateTime | sí | — |
| lastSeenAt | DateTime | sí | — |
| catalogAvailableModels | String[] | no | @default([]) |
| catalogBadges | String[] | no | @default([]) |
| catalogBrand | String | sí | — |
| catalogBreadcrumb | Json | no | @default("[]") |
| catalogFeatures | Json | no | @default("[]") |
| catalogFirmwareNote | String | sí | — |
| catalogHighlights | String[] | no | @default([]) |
| catalogImageAlt | String | sí | — |
| catalogImageUrl | String | sí | — |
| catalogModel | String | sí | — |
| catalogName | String | sí | — |
| catalogPublished | Boolean | no | @default(false) |
| catalogSlug | String | sí | @unique |
| catalogSpecsDisclaimer | String | sí | — |
| catalogInternalNotes | String | sí | — |
| catalogManufacturerRefs | String[] | no | @default([]) |
| sheetVersion | Int | no | @default(0) |
| catalogStatus | ProductCatalogStatus (enum) | sí | @default(ACTIVE) |
| publicRevisionId | String | sí | — |
| scheduledRevisionId | String | sí | — |

**Relaciones (FK):** brand → Brand (brandId); category → Category (categoryId); lista → Lista (listaId); publishedBy → User (publishedById); publicRevision → ProductRevision (publicRevisionId) onDelete SetNull
**Restricciones e índices:** `@@index([categoryId])` · `@@index([brandId])` · `@@index([listaId])` · `@@index([publishStatus])` · `@@index([publishAt])` · `@@index([unpublishAt])` · `@@index([publicRevisionId])` · `@@index([isActive, isVisible])` · `@@index([lifecycleStatus])` · `@@index([catalogPublished, catalogBrand])`

## Brand → tabla `brands`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| name | String | no | @unique |
| slug | String | no | @unique |
| logo | String | sí | — |
| description | String | sí | — |
| website | String | sí | — |
| isActive | Boolean | no | @default(true) |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |


## Category → tabla `categories`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| name | String | no | — |
| description | String | sí | — |
| slug | String | no | @unique |
| parentId | String | sí | — |
| sortOrder | Int | no | @default(0) |
| isActive | Boolean | no | @default(true) |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |
| iconUrl | String | sí | @db.VarChar(500) |
| imageUrl | String | sí | @db.VarChar(500) |
| isFeatured | Boolean | no | @default(false) |

**Relaciones (FK):** parent → Category (parentId)
**Restricciones e índices:** `@@index([parentId])`

## ProductCatalogSpecGroup → tabla `product_catalog_spec_groups`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| productId | String | no | — |
| key | String | no | — |
| title | String | no | — |
| position | Int | no | — |

**Relaciones (FK):** product → Product (productId) onDelete Cascade
**Restricciones e índices:** `@@unique([productId, key])` · `@@index([productId, position])`

## ProductCatalogSpecItem → tabla `product_catalog_spec_items`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| groupId | String | no | — |
| label | String | no | — |
| value | String | no | — |
| position | Int | no | — |

**Relaciones (FK):** group → ProductCatalogSpecGroup (groupId) onDelete Cascade
**Restricciones e índices:** `@@index([groupId, position])`

## ProductCatalogResource → tabla `product_catalog_resources`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| productId | String | no | — |
| kind | ProductResourceKind (enum) | no | — |
| title | String | no | — |
| language | String | no | @default("es") |
| url | String | no | — |
| fileName | String | sí | — |
| version | String | sí | — |
| region | String | sí | — |
| requiresLicense | Boolean | no | @default(false) |
| position | Int | no | @default(0) |

**Relaciones (FK):** product → Product (productId) onDelete Cascade
**Restricciones e índices:** `@@index([productId, kind])`

## ProductImage → tabla `product_images`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| productId | String | no | — |
| url | String | no | — |
| alt | String | sí | — |
| isPrimary | Boolean | no | @default(false) |
| sortOrder | Int | no | @default(0) |
| type | ProductImageType (enum) | no | @default(PRINCIPAL) |

**Relaciones (FK):** product → Product (productId)
**Restricciones e índices:** `@@index([productId])`

## ProductRevision → tabla `product_revisions`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id |
| productId | String | no | — |
| createdById | String | sí | — |
| status | RevisionStatus (enum) | no | — |
| notes | String | sí | @db.Text |
| version | Int | no | — |
| content | Json | no | — |
| publishedAt | DateTime | sí | — |
| validatedAt | DateTime | sí | — |
| rulesVersion | String | sí | — |
| issues | Json | sí | — |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |

**Relaciones (FK):** product → Product (productId) onDelete Cascade; createdBy → User (createdById) onDelete SetNull
**Restricciones e índices:** `@@unique([productId, version])` · `@@index([productId, status])`

## PublicationEvent → tabla `publication_events`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| productId | String | no | — |
| revisionId | String | sí | — |
| action | String | no | — |
| result | String | no | — |
| actorId | String | sí | — |
| issues | Json | sí | — |
| createdAt | DateTime | no | @default(now()) |

**Restricciones e índices:** `@@index([productId, createdAt])` · `@@index([action, createdAt])`

## ProductChange → tabla `product_changes`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| productId | String | no | — |
| sku | String | no | — |
| field | String | no | — |
| oldValue | Json | sí | — |
| newValue | Json | sí | — |
| source | String | no | — |
| sourceRef | String | sí | — |
| actorId | String | sí | — |
| batchId | String | sí | — |
| createdAt | DateTime | no | @default(now()) |

**Restricciones e índices:** `@@index([productId, createdAt(sort: Desc)])` · `@@index([sourceRef])`

## Lista → tabla `listas`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| code | String | no | @unique |
| name | String | no | — |
| description | String | sí | — |
| currency | String | no | @default("COP") |
| isActive | Boolean | no | @default(true) |
| archivedAt | DateTime | sí | — |
| createdById | String | sí | — |
| updatedById | String | sí | — |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |
| defaultVisibility | Boolean | no | @default(false) |
| responsibleId | String | sí | — |
| type | String | sí | — |
| validFrom | DateTime | sí | — |
| validUntil | DateTime | sí | — |
| codigo | String | sí | @unique |
| deletionStatus | String | sí | — |
| deletionRequestedAt | DateTime | sí | — |
| deletionPurgeAt | DateTime | sí | — |
| deletionReason | String | sí | — |
| deletionRequestedById | String | sí | — |

**Relaciones (FK):** creator → User (createdById); deletionRequester → User (deletionRequestedById); responsible → User (responsibleId); updater → User (updatedById)
**Restricciones e índices:** `@@index([isActive])` · `@@index([archivedAt])` · `@@index([responsibleId])` · `@@index([deletionPurgeAt])`

## PriceList → tabla `price_lists`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| name | String | no | — |
| code | String | no | @unique |
| currency | String | no | @default("COP") |
| isActive | Boolean | no | @default(true) |
| validFrom | DateTime | sí | — |
| validUntil | DateTime | sí | — |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |


## Price → tabla `prices`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| productId | String | no | — |
| priceListId | String | no | — |
| value | Decimal | no | @db.Decimal(12, 2) |
| currency | String | no | @default("COP") |
| validFrom | DateTime | sí | — |
| validUntil | DateTime | sí | — |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |
| listaId | String | sí | — |

**Relaciones (FK):** lista → Lista (listaId); priceList → PriceList (priceListId); product → Product (productId)
**Restricciones e índices:** `@@unique([productId, priceListId])` · `@@index([productId])` · `@@index([priceListId])` · `@@index([listaId])`

## PriceImportRevision → tabla `price_import_revisions`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| listaId | String | sí | — |
| createdById | String | sí | — |
| fileName | String | no | — |
| fileHash | String | no | — |
| fileSize | Int | no | — |
| storagePath | String | sí | — |
| idempotencyKey | String | no | — |
| status | PriceImportRevisionStatus (enum) | no | @default(GUARDADA) |
| currency | String | no | @default("COP") |
| taxIncluded | Boolean | no | @default(true) |
| rounding | String | no | @default("HALF_UP") |
| policyVersion | String | no | — |
| parserVersion | String | no | — |
| trailerVersion | String | sí | — |
| tariffs | Json | no | — |
| summary | Json | no | — |
| appliedAt | DateTime | sí | — |
| appliedById | String | sí | — |
| appliedResult | Json | sí | — |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |

**Relaciones (FK):** lista → Lista (listaId) onDelete SetNull; createdBy → User (createdById) onDelete SetNull; appliedBy → User (appliedById) onDelete SetNull
**Restricciones e índices:** `@@unique([idempotencyKey])` · `@@index([listaId, status])` · `@@index([createdById])` · `@@index([status])`

## PriceImportRevisionRow → tabla `price_import_revision_rows`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| revisionId | String | no | — |
| rowNumber | Int | no | — |
| sku | String | no | — |
| status | String | no | — |
| issues | Json | no | — |
| productId | String | sí | — |
| listaId | String | sí | — |
| resolution | String | sí | — |
| resolvedAt | DateTime | sí | — |
| resolvedById | String | sí | — |

**Relaciones (FK):** revision → PriceImportRevision (revisionId) onDelete Cascade
**Restricciones e índices:** `@@unique([revisionId, rowNumber])` · `@@index([revisionId, status])` · `@@index([listaId])` · `@@index([productId])`

## PriceImportRevisionPrice → tabla `price_import_revision_prices`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| revisionId | String | no | — |
| rowNumber | Int | no | — |
| sku | String | no | — |
| tariffCode | String | no | — |
| priceListId | String | sí | — |
| receivedValue | String | no | — |
| roundedValue | String | no | — |
| previousValue | String | sí | — |
| difference | String | sí | — |
| wasRounded | Boolean | no | — |
| change | String | no | — |
| productId | String | sí | — |
| changePercent | Decimal | sí | @db.Decimal(9, 2) |
| largeChange | Boolean | no | @default(false) |

**Relaciones (FK):** revision → PriceImportRevision (revisionId) onDelete Cascade
**Restricciones e índices:** `@@unique([revisionId, rowNumber, tariffCode], map: "price_import_revision_prices_revisionId_rowNumber_tariffCode_ke")` · `@@index([revisionId])`

## ImportMapping → tabla `import_mappings`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| name | String | no | — |
| mappings | Json | no | — |
| userId | String | no | — |
| isDefault | Boolean | no | @default(false) |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |

**Restricciones e índices:** `@@index([userId])`

## ImportSession → tabla `import_sessions`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id |
| userId | String | no | — |
| data | Json | no | — |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |

**Restricciones e índices:** `@@index([userId])`

## ProviderProfile → tabla `provider_profiles`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| providerName | String | no | @unique |
| sheet | String | no | — |
| headerRow | Int | no | @default(1) |
| thousandsSeparator | String | no | @default("") |
| decimalSeparator | String | no | @default(".") |
| currency | String | no | @default("COP") |
| tariffs | Json | no | — |
| expectedColumns | Json | no | — |
| version | Int | no | @default(1) |
| createdById | String | sí | — |
| updatedById | String | sí | — |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |


## ProviderEquivalence → tabla `provider_equivalences`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| providerProfileId | String | no | — |
| externalRef | String | no | — |
| productId | String | no | — |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |

**Relaciones (FK):** profile → ProviderProfile (providerProfileId) onDelete Cascade
**Restricciones e índices:** `@@unique([providerProfileId, externalRef])` · `@@index([productId])`

## CatalogJob → tabla `catalog_jobs`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| kind | String | no | — |
| actorId | String | no | — |
| scope | Json | no | — |
| state | String | no | @default("QUEUED") |
| progressDone | Int | no | @default(0) |
| progressTotal | Int | no | @default(0) |
| checkpoint | Json | sí | — |
| attempt | Int | no | @default(0) |
| maxAttempts | Int | no | @default(3) |
| leaseUntil | DateTime | sí | — |
| retryKey | String | sí | — |
| resultSummary | Json | sí | — |
| error | String | sí | — |
| cancelRequested | Boolean | no | @default(false) |
| createdAt | DateTime | no | @default(now()) |
| updatedAt | DateTime | no | @updatedAt |
| startedAt | DateTime | sí | — |
| finishedAt | DateTime | sí | — |

**Restricciones e índices:** `@@unique([kind, actorId, retryKey], map: "catalog_jobs_kind_actor_retry_key_key")` · `@@index([state, leaseUntil])` · `@@index([actorId, createdAt])`

## CatalogJobUnit → tabla `catalog_job_units`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| jobId | String | no | — |
| unitId | String | no | — |
| state | String | no | @default("PENDING") |
| error | String | sí | — |
| attempts | Int | no | @default(0) |
| updatedAt | DateTime | no | @default(now()) @updatedAt |

**Relaciones (FK):** job → CatalogJob (jobId) onDelete Cascade
**Restricciones e índices:** `@@id([jobId, unitId])` · `@@index([jobId, state])`

## ExportBundle → tabla `export_bundles`

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| jobId | String | no | @unique |
| actorId | String | no | — |
| bundleBytes | Bytes | no | — |
| sizeBytes | Int | no | — |
| sha256 | String | no | — |
| manifestJson | Json | no | — |
| createdAt | DateTime | no | @default(now()) |
| expiresAt | DateTime | sí | — |

**Relaciones (FK):** job → CatalogJob (jobId) onDelete Cascade
**Restricciones e índices:** `@@index([actorId, createdAt])` · `@@index([expiresAt])`

## Stock → tabla `stocks` (clasificación pendiente)

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| productId | String | no | @unique |
| availableQty | Int | no | @default(0) |
| reservedQty | Int | no | @default(0) |
| location | String | sí | — |
| updatedAt | DateTime | no | @updatedAt |

**Relaciones (FK):** product → Product (productId) onDelete Cascade
**Restricciones e índices:** `@@index([productId])`

## UploadedFile → tabla `uploaded_files` (clasificación pendiente)

| Campo | Tipo | Nulo | Atributos |
|---|---|---|---|
| id | String | no | @id @default(uuid()) |
| mimeType | String | no | — |
| data | Bytes | no | — |
| createdAt | DateTime | no | @default(now()) |
| sizeBytes | Int | sí | — |
| sha256 | String | sí | — |
| detectedKind | String | sí | — |
| originalName | String | sí | — |
| visibility | String | no | @default("PUBLIC") |
| ownerProductId | String | sí | — |

**Restricciones e índices:** `@@index([ownerProductId])` · `@@index([visibility])`
