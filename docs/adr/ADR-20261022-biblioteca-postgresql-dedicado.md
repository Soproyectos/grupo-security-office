# ADR: Biblioteca de productos en un PostgreSQL dedicado

**Estado: propuesta consolidada para aprobación. Documentación solamente: no hay código, esquema, migración ni servicio cambiado por este documento.**
**Fecha:** 22 de octubre de 2026 · **Decide:** el usuario (Soporte) · **Índice y estado de la obra:** [`docs/biblioteca-dominio/README.md`](../biblioteca-dominio/README.md)

Etiquetas: **[CONFIRMADO]** lo dijo el usuario · **[PROPUESTA]** recomendación a revisión · **[PENDIENTE]** decisión abierta · **[COMPROBADO]** visto en código o documentos del repo · **[NO VERIFICADO]** no se comprobó en ejecución.

## 1. Contexto
Hoy hay un solo PostgreSQL (`gs-db`, base `grupo_security`) con un solo esquema Prisma (63 modelos) que mezcla catálogo, precios, usuarios, clientes, cotizaciones y pedidos [COMPROBADO]. La auditoría del 22/10 (`traspaso-codex-biblioteca/auditoria-biblioteca-precios-2026-10-22.md`, fuera del repositorio) concluyó que el sistema actual puede ser la fuente única del catálogo sin reescribirse, con brechas por cerrar (inyección SQL en `GET /api/products`, archivos sin respaldo, sin reversa de importaciones, campos duplicados sin dueño, cuatro reglas de visibilidad).

## 2. Decisión (arquitectura objetivo)
**[CONFIRMADO]**
1. La biblioteca vive en un **PostgreSQL dedicado**, en un contenedor nuevo de la VPS, separado de la base operativa.
2. Se **conservan la web y NestJS**: un solo backend con **módulos y conexiones separadas por dominio**. No se crea otra API por defecto.
3. **Biblioteca** contiene: productos, marcas, categorías, variantes, fichas, proveedores, referencias, listas, tarifas, precios, importaciones, revisiones e historial del catálogo, más los archivos del dominio con almacenamiento y respaldo definidos.
4. **Operativo** conserva: usuarios, autenticación, clientes, cotizaciones, pedidos y demás operaciones. Que una tabla mencione productos no la hace de biblioteca.
5. **Auditoría por dominio:** los cambios de productos, precios, importaciones y publicación se registran dentro de biblioteca; usuarios, clientes y operaciones, en operativo. Biblioteca guarda la **referencia del actor**, sin credenciales ni otra base de usuarios. Los registros de auditoría existentes se conservan sin borrar ni mover.
6. El servicio usa una **imagen oficial de PostgreSQL** compatible; no se instala PostgreSQL a mano dentro del contenedor.
7. La tienda **no muestra precios a visitantes**; ese acceso no se rediseña.
8. Sin **doble escritura** ni **dos catálogos oficiales**. No se editan ni borran las migraciones históricas ya aplicadas.
9. Un producto pertenece **como máximo a una lista** ([ADR-20261014](./ADR-20261014-producto-una-sola-lista.md), vigente).
10. El **parche SQL** de `findAll` es un pendiente de seguridad independiente y debe resolverse antes de desplegar código afectado.

## 3. Qué se conserva y qué cambia
| Se conserva | Cambia (propuesto) |
|---|---|
| Web React y API NestJS; contratos HTTP existentes siempre que sea posible | Cada dominio tiene su cliente de base de datos, su esquema Prisma y su historial de migraciones |
| Identidad por SKU (único y único normalizado), `Product.listaId` 0..1, `Price(productId, priceListId)` único | Referencias a usuarios dejan de ser llaves foráneas: pasan a **referencia de actor** (id + nombre visible) |
| Flujo de precios: vista previa → revisión guardada → aplicación atómica con idempotencia y `ProductChange` | `AuditLog` general no se usa para eventos de biblioteca; se añade un registro de eventos propio |
| `ProductRevision`, `PublicationEvent`, `ProductChange`, cola `catalog-jobs` en PostgreSQL | Proveedores, referencias, costos de compra, faltantes y evidencia (tablas nuevas, ver modelo de datos) |
| ACL, roles y permisos bajo control del backend | El ACL pide al módulo operativo las listas permitidas y consulta biblioteca con esos ids |
| Cotizaciones con copia del precio, SKU y nombre en cada línea | Respaldo del volumen de archivos de biblioteca (hoy no existe) y respaldo conjunto compatible de ambas bases |

## 4. Límites de los dominios
Clasificación de los 63 modelos de `schema.prisma` (cada uno con una sola clasificación o marcado pendiente):
- **Biblioteca (23):** `Product`, `Brand`, `Category`, `ProductCatalogSpecGroup`, `ProductCatalogSpecItem`, `ProductCatalogResource`, `ProductImage`, `ProductRevision`, `PublicationEvent`, `ProductChange`, `Lista`, `PriceList`, `Price`, `PriceImportRevision`, `PriceImportRevisionRow`, `PriceImportRevisionPrice`, `ImportMapping`, `ImportSession`, `ProviderProfile`, `ProviderEquivalence`, `CatalogJob`, `CatalogJobUnit`, `ExportBundle`.
- **Operativo (34):** `User`, `Role`, `UserRole`, `RolePermission`, `UserPermission`, `Assignment`, `Session`, `UserMfa`, `MfaBackupCode`, `LoginAttempt`, `AccessState`, `AccessSource`, `AccessGrant`, `AccessOperation`, `StepUpGrant`, `Customer`, `CustomerAccount`, `CustomerSession`, `CustomerAccessToken`, `PortalAccount`, `PortalSession`, `PortalTier`, `PortalPriceListMapping`, `Quote`, `QuoteItem`, `SalesOrder`, `SalesTarget`, `TeamActivity`, `TeamActivityLink`, `TeamActivityEvent`, `TeamRequest`, `NotionToken`, `Notification`, `AuditLog`.
- **Pendiente (6):** `Stock`, `UploadedFile`, `StorefrontBanner`, `StorefrontSettings`, `StorefrontInquiry`, `SalesPromotion` (recomendación provisional: tienda y promociones, operativo; `Stock` y `UploadedFile`, por decidir).

**Relaciones que hoy son llaves foráneas y cruzarían bases** [COMPROBADO en `schema.prisma`]:
| Dirección | Relación | Tratamiento propuesto |
|---|---|---|
| Operativo → biblioteca | `QuoteItem.productId`, `QuoteItem.priceId`; `Quote.listaId`, `Quote.priceListId`; `PortalTier.priceListId`, `CustomerAccount.priceListId`, `PortalPriceListMapping.priceListId`; `Stock.productId` | Id opaco sin FK + validación por el módulo dueño al escribir; las cotizaciones siguen con su copia del precio |
| Biblioteca → operativo | `Lista.{createdById, updatedById, responsibleId, deletionRequestedById}`, `Product.publishedById`, `ProductRevision.createdById`, `PriceImportRevision.{createdById, appliedById}` | Referencia de actor: id + nombre visible, sin FK, sin *join* contra usuarios |
| Mixto | `AuditLog.productId`, `AuditLog.userId` | `AuditLog` queda en operativo; biblioteca registra en su propio historial |

**Consistencia sin llaves entre bases:** un dueño por dato; referencias por id validadas por una interfaz interna del módulo dueño; sin transacciones entre bases (se lee en biblioteca y luego se escribe en operativo con la copia); productos con referencias externas se **archivan, no se borran**; informe periódico de solo lectura de ids huérfanos entre dominios.

## 5. Una autoridad por dato
Ningún dato tiene dos campos oficiales. Los campos duplicados actuales se resuelven así [PROPUESTA; el campo oficial del nombre y la ficha está **PENDIENTE de decisión D3**]:
| Concepto | Campo oficial propuesto | Quién lo modifica | Quién lo lee | Tratamiento del duplicado |
|---|---|---|---|---|
| SKU interno | `Product.sku` (+ índice normalizado) | Alta de producto o importación autorizada; no cambia por proveedor | Todo | — |
| Referencia de fabricante | Campo propio en biblioteca (hoy `catalogModel`/`catalogManufacturerRefs`) | Editor de ficha / enriquecimiento con revisión | Ficha pública, importador | Se separa del SKU cuando difieren |
| Nombre de vitrina | `catalogName` | Editor de ficha con revisión | Web pública, listados | `name` queda como nombre interno; el PUT legado deja de escribir `catalog*` |
| Marca | Relación `brandId` | Editor de ficha | Web, filtros | `catalogBrand` deja de ser fuente |
| Categoría | Relación `categoryId` | Editor de ficha | Web, filtros | — |
| Descripción, especificaciones, destacados | Campos `catalog*` / grupos de especificaciones | Editor de ficha | Web | `technicalSpecs`/`documents` legados se retiran cuando no tengan lectores |
| Imágenes | `ProductImage` (portada = principal) | Editor de ficha | Web | `catalogImageUrl` se deriva, no se edita |
| Documentos | `ProductCatalogResource` | Editor de ficha / enriquecimiento | Web | `Product.documents` (JSON) se retira cuando no tenga lectores |
| Publicación | `lifecycleStatus` + `publicRevisionId` | Publicación autorizada | Web, tienda, portal | `isActive`, `isVisible`, `publishStatus`, `catalogPublished` son espejo o se unifican |
| Precio de venta | `Price` por tarifa | Aplicación de una revisión de precios aprobada | Web (sin mostrarlo a visitantes), cotizaciones | — |
| Costo de compra | Tabla nueva por proveedor | Importación de costos aprobada | Compras | **Nunca** sustituye al precio de venta |
| Proveedor | `ProviderProfile` ampliado | Compras | Importador | — |
| Historial | `ProductChange`, `PublicationEvent`, registro de eventos de biblioteca | Solo el sistema | Compras, auditoría | — |
| Actor | `User` (operativo) | Operativo | Biblioteca guarda id y nombre al momento del evento | No se duplican credenciales |

## 6. Decisiones
**Confirmadas:** las del apartado 2 más las reglas de publicación del usuario (mínimo para publicar, documentos faltantes no bloquean, «no encontrado» ≠ «no aplica», no cambiar automáticamente la publicación existente; detalle en [reglas-de-publicacion.md](../biblioteca-dominio/reglas-de-publicacion.md)).
**Propuestas (a aprobar):** P1 ampliar `ProviderProfile` como entidad Proveedor; P2 referencias de proveedor/fabricante en `ProviderEquivalence` ampliado; P3 variantes como SKU propios con modelo base opcional; P4 campo oficial `catalog*`; P5 referencia de actor; P6 registro de eventos de biblioteca; P7 tablas de faltantes y de evidencia; P8 familias de categorías y atributos esenciales; P9 marca y categoría anulables en borrador; P10 archivos en volumen propio con respaldo; P11 una tarifa de referencia marcada.
**Pendientes:** D1 `UploadedFile` y `Stock`; D2 variantes; D3 campo oficial del nombre y la ficha; D4 tarifa de referencia, IVA, vigencia y qué hacer con un precio inválido; D5 atributos esenciales (los valida compras) y categorías amplias; D6 separación entre quien carga y quien aplica precios; D7 almacenamiento de los originales y retención; D8 retención de `import_sessions` y revisiones; D9 copia histórica de `AuditLog` hacia biblioteca; D10 qué hacer con la marca «Sin marca» (hoy una fila real); D11 API externa y tokens (fuera de este alcance).

### Confirmación del usuario — 23/10/2026

**D1 confirmada:** UploadedFile de productos y marcas pertenece a biblioteca; Stock permanece operativo. Los archivos de otros dominios no quedan reclasificados por esta decisión. D7 sigue abierta para almacenamiento de originales/retención. No se trasladaron datos reales.

**D3 confirmada:** catalogName/catalog* es la ficha comercial oficial, name queda interno y los datos actuales se conservan sin sobrescribir. Esto permite adaptar transporte/lectores; no aprueba limpieza masiva, defaults inventados ni un manufacturer_ref nuevo. Las tablas/secciones previas describen el corte histórico de propuesta; esta confirmación sustituye únicamente D1/D3.

## 7. Consecuencias
- **Positivas:** copias de seguridad, restauración y permisos independientes por dominio; el catálogo puede evolucionar sin riesgo para usuarios y clientes; el historial de biblioteca queda en un solo lugar.
- **Negativas / costos:** dos esquemas y dos clientes Prisma; hay que repartir el código que hoy cruza dominios (inventario en [infraestructura-e-integracion.md](../biblioteca-dominio/infraestructura-e-integracion.md)); sin transacciones entre bases; el respaldo debe tomarse de forma conjunta.
- **Riesgos abiertos:** el esfuerzo real depende de dependencias aún no revisadas una a una; no hay mediciones de rendimiento; el estado de migraciones y datos de producción [NO VERIFICADO].

## 8. Fuera de alcance
Rediseñar el acceso de la tienda, una API independiente, Hermes y Gentle AI, el enriquecimiento automático (flujo separado, ver plan) y la corrección de las demás brechas de la auditoría.
