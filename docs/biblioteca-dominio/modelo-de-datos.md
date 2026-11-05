# Modelo de datos de la biblioteca (diseño implementable)

**Estado:** propuesta de rediseño para aprobación; sus cambios de negocio no están implementados. Base: `schema.prisma` en `cb230aa` ([diccionario actual](./diccionario-esquema-actual.md)). [T03](./t03-esquema-candidato.md) prepara únicamente la separación de los 23 modelos actuales, sin aplicar SQL ni adelantar las ampliaciones de T07/T13 descritas aquí. Decisiones: [ADR-20261022](../adr/ADR-20261022-biblioteca-postgresql-dedicado.md). Etiquetas: **EXISTE** · **MODIFICAR** · **NUEVO** · **[PENDIENTE Dn]** depende de una decisión abierta. Los tipos de esta propuesta usan nombres de PostgreSQL; los nombres físicos existentes se conservan en el candidato.

**Principios.** (1) Identidad estable: el id (`text`, UUID) y el SKU no cambian al cambiar de proveedor. (2) No se inventan valores para satisfacer restricciones: lo desconocido es `NULL` o un faltante registrado, nunca un valor de relleno. (3) Documentos faltantes no bloquean; quedan en `product_gaps`. (4) Referencias hacia el dominio operativo son ids sin FK. (5) Tablas en snake_case plural (`@@map`), columnas existentes en camelCase y fechas `timestamp(3)`. El candidato conserva **cinco enums PostgreSQL nativos**; `lifecycleStatus` es texto con CHECK de siete estados. Otros `text` con CHECK de este documento son propuestas, no una descripción de todos los enums existentes.

## 1. Diagrama

```mermaid
erDiagram
  brands ||--o{ products : "marca"
  categories ||--o{ products : "categoría"
  categories }o--o| category_families : "familia"
  category_families ||--o{ spec_attribute_definitions : "atributos"
  product_model_groups ||--o{ products : "modelo base (opcional)"
  listas |o--o{ products : "una lista como máximo"
  products ||--o{ product_images : ""
  products ||--o{ product_catalog_resources : "documentos"
  products ||--o{ product_catalog_spec_groups : ""
  product_catalog_spec_groups ||--o{ product_catalog_spec_items : ""
  products ||--o{ product_revisions : "versiones de ficha"
  products ||--o{ prices : "precio de venta"
  price_lists ||--o{ prices : "tarifa"
  provider_profiles ||--o{ provider_equivalences : "referencias"
  products ||--o{ provider_equivalences : ""
  provider_profiles ||--o{ supplier_costs : "costo de compra"
  products ||--o{ supplier_costs : ""
  products ||--o{ product_gaps : "faltantes"
  products ||--o{ field_evidence : "fuentes y verificación"
  price_import_revisions ||--o{ price_import_revision_rows : ""
  price_import_revisions ||--o{ price_import_revision_prices : ""
  products ..> product_changes : "por id, sin FK"
  products ..> publication_events : "por id, sin FK"
  products ..> library_audit_events : "por id, sin FK"
```
Las tablas de importación de productos (`import_sessions`, `import_mappings`) y de trabajos (`catalog_jobs`, `catalog_job_units`, `export_bundles`) no cambian y no se dibujan.

## 2. Qué existe, qué cambia, qué es nuevo
| Tabla | Estado | Resumen del cambio |
|---|---|---|
| `products` | EXISTE · MODIFICAR | `brand_id` y `category_id` admiten NULL mientras sea borrador; nuevas columnas `manufacturer_ref`, `model_group_id`; `published_by` pasa a referencia de actor |
| `brands`, `categories` | EXISTE · MODIFICAR (categorías) | `categories.family_key` nuevo, anulable |
| `product_catalog_spec_groups`, `product_catalog_spec_items` | EXISTE · MODIFICAR | `spec_items.attribute_key` nuevo, anulable |
| `product_catalog_resources`, `product_images` | EXISTE | Sin cambios de estructura |
| `product_revisions` | EXISTE · MODIFICAR | `created_by` → referencia de actor |
| `publication_events`, `product_changes` | EXISTE · MODIFICAR | `product_changes.actor_name` nuevo |
| `listas` | EXISTE · MODIFICAR | cuatro columnas de usuario → referencia de actor |
| `price_lists` | EXISTE · MODIFICAR | `is_reference_sale` **[PENDIENTE D4]** |
| `prices` | EXISTE · MODIFICAR | `CHECK (value > 0)`; uso de `valid_from/valid_until` **[PENDIENTE D4]** |
| `price_import_revisions` (+ filas y precios) | EXISTE · MODIFICAR | actores como referencia; `provider_profile_id` anulable |
| `provider_profiles` | EXISTE · MODIFICAR | pasa a ser la entidad Proveedor |
| `provider_equivalences` | EXISTE · MODIFICAR | referencias de proveedor/fabricante con FK al producto |
| `product_model_groups` | NUEVO **[PENDIENTE D2]** | modelo base opcional para variantes |
| `supplier_costs` | NUEVO | costo de compra por proveedor, separado de las tarifas |
| `product_gaps` | NUEVO | faltantes registrados |
| `field_evidence` | NUEVO | fuente y nivel de verificación por dato |
| `category_families`, `spec_attribute_definitions` | NUEVO **[PENDIENTE D5]** | atributos esenciales por familia |
| `library_audit_events` | NUEVO | historial propio del dominio |
| `library_files` | NUEVO **[PENDIENTE D1/D7]** | metadatos de los archivos del dominio |

## 3. Cambios sobre tablas existentes

### 3.1 `products` (MODIFICAR)
| Campo | Tipo | Nulo | Restricción / índice | Nota |
|---|---|---|---|---|
| `id` | text | no | PK | sin cambio |
| `sku` | text | no | UNIQUE y UNIQUE normalizado (`products_sku_normalized_key`) | identidad interna; no cambia por proveedor |
| `name` | text | no en T03 | — | requerido en la base de transición. Si falta, la fila permanece en preparación; no copiar SKU ni un marcador como nombre para satisfacer NOT NULL. Un borrador sin nombre requerirá otro contrato aprobado |
| `brand_id` | text | **sí** (antes no) | FK `brands` | borrador sin marca es válido. Ver CHECK |
| `category_id` | text | **sí** (antes no) | FK `categories` | ídem |
| `manufacturer_ref` | text | sí | índice sobre (`brand_id`, referencia normalizada) | referencia exacta del fabricante cuando difiere del SKU **[PENDIENTE D3]** |
| `model_group_id` | text | sí | FK `product_model_groups` | variantes **[PENDIENTE D2]** |
| `lista_id` | text | sí | FK `listas`; índice | una lista como máximo (ADR-20261014) |
| `lifecycleStatus` (nombre físico actual) | text | no | CHECK en (`DRAFT`,`READY`,`SCHEDULED`,`PUBLISHED`,`HIDDEN`,`DISCONTINUED`,`ARCHIVED`) | **EXISTE**: corrección verificada contra `20260820185813_lifecycle_status`; T03 conserva los siete estados |
| `public_revision_id` | text | sí | FK `product_revisions` ON DELETE SET NULL | revisión pública activa |
| `published_by_actor_id`, `published_by_actor_name` | text | sí | — | reemplazan `published_by_id` (FK a usuarios) |
| resto (`catalog_*`, `description`, `publish_at`…) | — | — | — | sin cambio estructural; los duplicados se retiran por etapas según D3 |

**Nuevas restricciones:**
- `CHECK (lifecycle_status <> 'PUBLISHED' OR (brand_id IS NOT NULL AND category_id IS NOT NULL))`. Solo cubre lo estructural; el resto del mínimo (nombre, especificaciones esenciales, precio, imagen) depende de filas relacionadas y de la familia de la categoría, así que lo evalúa el motor de validación, no un CHECK.
- Migración de datos **[PENDIENTE D10]**: hoy hay una marca real llamada «Sin marca» (en la copia de srv-soporte); para no «inventar valores», los productos que la usan pasarían a `brand_id = NULL`. No se hace sin aprobación.

### 3.2 Referencias de actor (MODIFICAR en varias tablas)
Patrón: `<rol>_actor_id text NULL` + `<rol>_actor_name text NULL`, sin FK. Aplica a: `products.published_by_*`, `product_revisions.created_by_*`, `listas.{created_by,updated_by,responsible,deletion_requested_by}_*`, `price_import_revisions.{created_by,applied_by}_*`, `price_import_revision_rows.resolved_by_*`, `provider_profiles.{created_by,updated_by}_*`, `product_changes.actor_name` (ya tiene `actor_id`), `publication_events.actor_name`. El nombre es la copia del momento del evento; el id permite resolver al usuario actual en la capa de aplicación. Ninguna tabla de biblioteca guarda credenciales ni correos.

### 3.3 Precios y tarifas
- `price_lists.is_reference_sale boolean NOT NULL DEFAULT false` con índice único parcial (`WHERE is_reference_sale`): a lo sumo una tarifa de referencia para evaluar «precio de venta válido». **[PENDIENTE D4]**
- `prices`: `CHECK (value > 0)`; `valid_from` / `valid_until` existen y hoy no se escriben **[PENDIENTE D4]**; `lista_id` es copia y debe coincidir con `products.lista_id` (regla de API, no de BD).
- Los costos de compra **no** se guardan en `prices` ni en `price_lists`.

### 3.4 Proveedores y referencias
- `provider_profiles` (MODIFICAR): es hoy el perfil de formato de la lista de un proveedor (hoja, fila de encabezado, separadores, tarifas, columnas esperadas) con `provider_name` único. Se conserva como **Proveedor**; añade `is_active boolean NOT NULL DEFAULT true`. No se crea una tabla `providers` paralela.
- `provider_equivalences` (MODIFICAR) = **referencia de proveedor o equivalente de un producto**:

| Campo | Tipo | Nulo | Restricción |
|---|---|---|---|
| `id` | text | no | PK |
| `provider_profile_id` | text | no | FK `provider_profiles` ON DELETE CASCADE |
| `product_id` | text | no | **FK `products` ON DELETE RESTRICT** (hoy sin FK) |
| `external_ref` | text | no | referencia tal cual la usa el proveedor |
| `normalized_ref` | text | no | referencia normalizada; **UNIQUE (`provider_profile_id`, `normalized_ref`)** |
| `ref_kind` | text | no | CHECK en (`PROVEEDOR`,`EQUIVALENTE`) |
| `is_primary` | boolean | no | DEFAULT false; índice único parcial (`product_id`, `provider_profile_id`) `WHERE is_primary` |
| `created_at`, `updated_at` | timestamp(3) | no | — |

Un producto puede tener varias referencias de varios proveedores; una referencia de un proveedor apunta a un solo producto. La ficha pública no se duplica por proveedor.

## 4. Tablas nuevas

### 4.1 `supplier_costs` — costo de compra por proveedor (NUEVO)
| Campo | Tipo | Nulo | Restricción |
|---|---|---|---|
| `id` | text | no | PK |
| `product_id` | text | no | FK `products` ON DELETE RESTRICT |
| `provider_profile_id` | text | no | FK `provider_profiles` |
| `amount` | numeric(14,2) | no | CHECK (`amount > 0`) |
| `currency` | text | no | CHECK (longitud 3), DEFAULT 'COP' |
| `tax_included` | boolean | no | — (sin valor por defecto: debe declararse) |
| `valid_from`, `valid_until` | timestamp(3) | sí | CHECK (`valid_until IS NULL OR valid_until > valid_from`) |
| `source_revision_id` | text | sí | revisión de importación de origen, sin FK |
| `created_by_actor_id`, `created_by_actor_name` | text | sí | — |
| `created_at` | timestamp(3) | no | — |
Índice: (`product_id`, `provider_profile_id`, `valid_from` desc). **Nunca se publica y un cambio de costo no modifica `prices`.** Su flujo de importación está **[PENDIENTE]** (no existe hoy).

### 4.2 `product_gaps` — faltantes registrados (NUEVO)
| Campo | Tipo | Nulo | Restricción |
|---|---|---|---|
| `id` | text | no | PK |
| `product_id` | text | no | FK `products` ON DELETE CASCADE |
| `gap_key` | text | no | dato o documento faltante: `datasheet`, `manual`, `firmware`, `image_primary`, `spec:<attribute_key>`… |
| `status` | text | no | CHECK en (`NO_ENCONTRADO`,`NO_PUBLICADO`,`NO_APLICA`,`PENDIENTE`) |
| `severity` | text | no | CHECK en (`BLOQUEA`,`AVISO`); los documentos son siempre `AVISO` |
| `reason` | text | sí | obligatoria si `status = 'NO_APLICA'` (CHECK) |
| `detected_at` | timestamp(3) | no | — |
| `resolved_at` | timestamp(3) | sí | — |
| `set_by_actor_id`, `set_by_actor_name` | text | sí | quién decidió `NO_PUBLICADO` o `NO_APLICA` |
UNIQUE (`product_id`, `gap_key`) para los faltantes abiertos (índice parcial `WHERE resolved_at IS NULL`). **`NO_ENCONTRADO` nunca se convierte en `NO_APLICA` automáticamente.**

### 4.3 `field_evidence` — fuente y verificación por dato (NUEVO)
| Campo | Tipo | Nulo | Restricción |
|---|---|---|---|
| `id` | text | no | PK |
| `product_id` | text | no | FK `products` ON DELETE CASCADE |
| `field_key` | text | no | nombre del dato (`catalog_name`, `manufacturer_ref`, `spec:<key>`, `image_primary`, …) |
| `level` | text | no | CHECK en (`VERIFICADO`,`DECLARADO`,`INFERIDO`,`CONTRADICTORIO`) |
| `source_kind` | text | no | CHECK en (`FABRICANTE`,`LISTA_PROVEEDOR`,`MANUAL`,`SCRIPT`) |
| `source_url` | text | sí | obligatoria si `level = 'VERIFICADO'` y `source_kind = 'FABRICANTE'` (CHECK) |
| `reason` | text | sí | obligatoria si `level = 'INFERIDO'` (CHECK) |
| `value_hash` | text | sí | huella del valor evaluado, para detectar cambios |
| `captured_at` | timestamp(3) | no | — |
| `actor_id`, `actor_name` | text | sí | persona o proceso |
UNIQUE (`product_id`, `field_key`) para el registro vigente. Un `CONTRADICTORIO` impide mostrarlo como verificado. La regla «la referencia exacta debe aparecer en la fuente» se registra aquí como evidencia, no como texto libre.

### 4.4 Familias y atributos esenciales (NUEVO) **[PENDIENTE D5]**
- `category_families(key text PK, label text NOT NULL)`; `categories.family_key text NULL` (FK).
- `spec_attribute_definitions`: `id` PK, `family_key` FK, `attribute_key` text, `label` text, `value_type` CHECK en (`TEXTO`,`NUMERO`,`BOOLEANO`,`LISTA`), `unit` text NULL, `is_essential` boolean, `position` int. UNIQUE (`family_key`, `attribute_key`).
- `product_catalog_spec_items.attribute_key text NULL`: enlaza un valor existente con su definición. Los valores actuales (texto libre) siguen válidos; no se reescriben.
Las familias y los esenciales de [reglas-de-publicacion.md](./reglas-de-publicacion.md) son una propuesta que compras debe validar. Una categoría sin familia no puede evaluar el mínimo de especificaciones (queda como faltante `BLOQUEA`).

### 4.5 `product_model_groups` — variantes (NUEVO) **[PENDIENTE D2]**
`id` PK, `brand_id` FK, `model_name` text NOT NULL, UNIQUE (`brand_id`, `model_name`), `created_at`. Cada variante sigue siendo un producto con SKU propio; el grupo solo permite mostrarlas juntas. `products.model_group_id` la referencia (ON DELETE SET NULL).

### 4.6 `library_audit_events` — historial propio (NUEVO)
| Campo | Tipo | Nulo | Restricción |
|---|---|---|---|
| `id` | text | no | PK |
| `occurred_at` | timestamp(3) | no | índice (`occurred_at` desc) |
| `actor_id`, `actor_name` | text | sí | actor o proceso (`NULL` = sistema) |
| `action` | text | no | ej.: `PRICE_IMPORT_PREVIEW`, `PRICE_IMPORT_SAVED`, `PRICE_IMPORT_DISCARDED`, `LISTA_CHANGED`, `FILE_ADDED` |
| `entity_type`, `entity_id` | text | no | índice (`entity_type`, `entity_id`, `occurred_at` desc) |
| `summary` | jsonb | no | solo datos no sensibles (conteos, ids); sin credenciales ni datos personales |
| `request_id` | text | sí | correlación con el registro operativo |
Complementa a `product_changes` (cambios campo a campo) y `publication_events`; no los reemplaza. Los eventos históricos que hoy están en `audit_logs` **se conservan allí** **[PENDIENTE D9]**.

### 4.7 `library_files` — archivos del dominio (NUEVO) **[PENDIENTE D1/D7]**
`id` PK, `kind` (CHECK: `IMAGEN`,`DATASHEET`,`MANUAL`,`ORIGINAL_LISTA`,`OTRO`), `mime` text, `size_bytes` bigint, `sha256` text, `storage` (CHECK: `DB`,`DISCO`), `path` text NULL (obligatorio si `DISCO`), `bytes` bytea NULL (obligatorio si `DB`), `owner_type`, `owner_id` (sin FK), `created_at`. Hoy `UploadedFile` guarda imágenes en la base y los originales de listas de precios van a disco sin respaldo. La propuesta es que `library_files` sea el índice único (con huella) de ambos y que los binarios grandes vivan en un volumen con respaldo propio; la decisión de qué va en base y qué en disco es D7.

## 5. Tres momentos del producto
| Momento | Qué significa | Qué lo determina | Qué se exige |
|---|---|---|---|
| **Alta incompleta** | Hay una fila pendiente de completar | En T03: zona de preparación, sin `Product`. Borrador con columnas anulables y `product_gaps`: propuesta posterior de T13 | Conservar SKU y datos recibidos sin inventar nombre/marca/categoría. DRAFT no anula los NOT NULL heredados; solo promover al producto cuando exista un contrato válido y datos reales |
| **Ficha que cumple mínimos** | Puede publicarse | Resultado de validación vigente en la `product_revisions` de trabajo (`LISTA_PARA_PUBLICAR`) | Nombre de vitrina, referencia exacta, marca, especificaciones esenciales, precio de venta e imagen principal correcta; ver reglas |
| **Publicado** | Visible según el canal | `lifecycle_status = 'PUBLISHED'` + `public_revision_id` | Pasar la validación y una acción de publicación autorizada; documentos faltantes no bloquean |
Estos tres momentos no se mezclan en un solo campo: el segundo se calcula y se guarda con la revisión; el tercero lo cambia solo una publicación explícita. **Ningún proceso cambia la publicación de productos existentes de forma automática.**

**Límite de la preparación actual:** el flujo de precios ya conserva un SKU desconocido en `PriceImportRevisionRow` con `resolution = PENDING_PRODUCT` y `productId = NULL`. Eso permite revisar sin crear un producto ni valores de relleno. No es un staging general nuevo de productos: unificar el ingreso incompleto y su promoción queda pendiente de T11/T13. El importador legado usa SKU como nombre y defaults de marca/categoría; ese comportamiento no cumple el nuevo criterio y no se autoriza reutilizarlo para hacer pasar filas incompletas. [Evidencia de revisión](./t03-revision-local.md).

## 6. Referencias entre dominios (sin fingir FK)
| Columna (dominio operativo) | Apunta a | Regla |
|---|---|---|
| `quote_items.product_id`, `quote_items.price_id` | `products`, `prices` | Sin FK. La línea conserva SKU, nombre y precio; el id se valida al crear la línea |
| `quotes.lista_id`, `quotes.price_list_id` | `listas`, `price_lists` | Sin FK; validación al escribir |
| `portal_tiers.price_list_id`, `customer_accounts.price_list_id`, `portal_price_list_mappings.price_list_id` | `price_lists` | Sin FK |
| `stocks.product_id` | `products` | Sin FK **[PENDIENTE D1]** |
| `assignments` / `access_grants` (ids de lista en operativo) | `listas` | El backend resuelve los ids permitidos y consulta biblioteca con ellos |
Cada columna conserva su índice. **Conciliación** (solo lectura, periódica): líneas de cotización cuyo `product_id` ya no existe, asignaciones a listas inexistentes, eventos de biblioteca con actor desconocido. Detecta y reporta; no corrige solos.

## 7. Reglas en base de datos frente a reglas de API
| En la base de datos | En la API / permisos |
|---|---|
| Unicidad: SKU (y normalizado), (producto, tarifa), (producto, versión), clave de idempotencia, (proveedor, referencia normalizada) | Qué rol puede crear, editar, cargar, aplicar o publicar |
| `CHECK`: ciclo de vida, `price > 0`, `amount > 0`, estados de faltantes y evidencia, marca y categoría en publicado | Vista previa → revisión → aplicación; confirmaciones; límite de cambio grande (30 %) |
| FK internas del dominio y reglas de borrado (cascada, restringir, anular) | Mínimos de publicación dependientes de la familia (exigen leer varias tablas) |
| Índices parciales (una tarifa de referencia, una referencia principal, faltantes abiertos) | Control de acceso por lista, vigencia, políticas de negocio pendientes |
| Transacción única del dominio para aplicar precios + historial | Validación de ids del otro dominio y conciliación |

## Corte implementado en desarrollo — 23/10/2026

T07: library_audit_events y eventos de categorías probados. T13: product_gaps, field_evidence y supplier_costs se añadieron por una migración nueva sobre el esquema activo; no alteran Product ni datos históricos. Contratos de las secciones 4.1–4.3 probados en PostgreSQL18.6 aislado: cuatro FK internas, once CHECK, unicidad parcial de faltante abierto, evidencia vigente única, IVA sin default, costos sin efecto en Price/publicación, RESTRICT/CASCADE y rollback/tablas vacías. [Resultados y hashes](./evidencia/t13-contratos-intento-1/resultado-ejecucion.json). API/web de revisión en curso; estas tablas no constituyen todavía el flujo completo.

T13b (23/10/2026): proveedores y referencias del §3.4 codificados en la migración `20261023020000_t13_provider_references`: `provider_profiles.is_active`; `provider_equivalences.normalized_ref` (único por proveedor), `ref_kind` (CHECK), `is_primary` (índice único parcial) y FK `products` ON DELETE RESTRICT. Restricciones probadas en PostgreSQL 18 (recorrido, paso 7). No hay flujo de importación de costos todavía.

D1/D3 confirmadas por el usuario el 23/10: UploadedFile productos/marcas a biblioteca, Stock operativo; catalogName/catalog* ficha oficial y name interno sin sobrescribir. No se ha aplicado todavía su transporte completo. D4/D5/D7 siguen pendientes. Las reglas de catálogo/precio/familia que dependen de ellas no se activaron con estas tablas.
