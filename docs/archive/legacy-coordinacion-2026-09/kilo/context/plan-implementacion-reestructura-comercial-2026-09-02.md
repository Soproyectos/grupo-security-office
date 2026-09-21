# Plan de implementación — Reestructura comercial y gobierno de accesos

---

## Inventario real encontrado

### Esquema Prisma (`src/backend/prisma/schema.prisma`)

**Modelos encontrados (359 líneas):**

| Modelo | Campos clave | Relaciones dependientes |
|---|---|---|
| `User` | id, email@unique, name, password, isActive | roles, auditLogs, assignments, createdListas, updatedListas, responsibleListas, supplierEvaluations, purchaseOrders, publishedProducts |
| `Role` | id, name@unique, description | permissions, users, assignments |
| `UserRole` | userId+roleId PK | user, role |
| `RolePermission` | roleId+permission PK | role |
| `Lista` | id, code@unique, codigo@unique?, name, description, type?, defaultVisibility, currency, isActive, archivedAt?, createdById?, updatedById?, responsibleId?, supplierId?, validFrom?, validUntil? | creator, updater, responsible, supplier; products[], prices[] |
| `Assignment` | id, userId, roleId?, resourceType, resourceId, level(default "view"), isActive | user, role; `@@unique([userId,resourceType,resourceId])` |
| `Product` | id, sku@unique, name, description, categoryId, brandId, listaId?, technicalSpecs (Json?), extraAttributes (Json?), documents (Json?), isActive, isVisible, publishStatus(default "borrador"), publishedAt?, publishAt?, unpublishAt?, publishedById?, unpublishReason?, lifecycleStatus(default "DRAFT") | category, brand, lista, publishedBy; prices[], images[], auditLogs[], stock? |
| `PriceList` | id, code@unique, name, currency, isActive, validFrom?, validUntil? | prices[] |
| `Price` | id, productId, priceListId, listaId?, value (Decimal 12,2), currency, validFrom?, validUntil? | product, priceList, lista; `@@unique([productId,priceListId])` |
| `Category` | id, name, slug@unique, parentId?, sortOrder, isActive | parent/children (tree); products[] |
| `Brand` | id, name@unique, slug@unique, logo?, description?, website?, isActive | products[] |
| `ProductImage` | id, productId, url, alt?, type(enum PORTADA/LOGO/PRINCIPAL/COMPLEMENTARIA/EXTRA), isPrimary, sortOrder | product |
| `Stock` | id, productId@unique, availableQty, reservedQty, location?, updatedAt | product (onDelete: Cascade) |
| `Supplier` | id, name, nit@unique, contact(Json?), category, status(default "active"), rating(Decimal 3,2) | evaluations[], purchaseOrders[], listas[] |
| `SupplierEvaluation` | id, supplierId, evaluatedById?, date, criteria(Json), score(Decimal 5,2), observations? | supplier (onDelete: Cascade), evaluatedBy |
| `PurchaseOrder` | id, code@unique, supplierId, status(default "requested"), requestedById?, items(Json), notes? | supplier (onDelete: Restrict), requestedBy |
| `AuditLog` | id, userId?, productId?, action, entity, entityId, oldValues(Json?), newValues(Json?), ipAddress?, userAgent?, createdAt | user, product |
| `ImportMapping` | id, name, mappings(Json), userId, isDefault | — |

**Hecho crítico:** `AuditLog` **no tiene** columna `listaId`, `result` ni `location`. El filtro por Lista actual funciona mediante `entity='LISTA' AND entityId=<id>`.

### Backend — archivos encontrados y estado

| Ruta | Estado | Observaciones |
|---|---|---|
| `listas.controller.ts` | Existe | CRUD + duplicate+toggle-active+archive/restore+remove. Endpoints GET products/prices/assignments/audit por Lista. |
| `listas.service.ts` | Existe | AclService integrado. `removeLista` actual: borrado físico directo con masterKey para asociados. NO tiene PENDING_DELETION. |
| `products.controller.ts` | Existe | CRUD + toggle-visibility(obsoleto) + toggle-active(obsoleto) + publish(obsoleto) + unpublish(obsoleto) + transition + bulk-transition + import + images. |
| `products.service.ts` | Existe | FSM completa (transition → doTransition), scheduler @Cron EVERY_MINUTE inline (handleLifecycleTick → processScheduledPublishes). |
| `transition.service.ts` | **NO EXISTE** | La FSM está dentro de `products.service.ts` |
| `products.scheduler.ts` | **NO EXISTE** | El scheduler @Cron está dentro de `products.service.ts` |
| `assignments.controller.ts` | Existe | CRUD + matrix + preview endpoints. Roles Super Admin / Admin Comercial. |
| `assignments.service.ts` | Existe | Autorización inline, anti-escalada, validateResource. |
| `audit.controller.ts` | Existe | GET /api/audit (filtros skip/take/entity/entityId/userId/action) + GET /api/audit/:entity/:entityId |
| `audit.service.ts` | Existe | Scope comercial para Admin Comercial (COMERCIAL_ENTITIES). Normalización entity/action. **Sin filtro de fecha/rango**, sin result, sin listaId directo. |
| `users.controller.ts` | Existe | CRUD users. Roles Super Admin. |
| `users.service.ts` | Existe | Gestión de usuarios, roles, clave. |
| `roles.controller.ts` | Existe | CRUD roles+permisos. Roles Super Admin. |
| `roles.service.ts` | Existe | Validaciones; Super Admin no modifica ni elimina. |
| `acl.service.ts` | Existe | Niveles view(0), edit_prices(1), edit_products(2), edit alias(2), manage(3), manage_access(4). |

**Niveles de acceso reales (en AclService):**
```typescript
view: 0           → ver Lista SIN precios
edit_prices: 1    → view + ver precios + editar precios
edit_products: 2  → edit_prices + editar productos
edit: 2           → ALIAS legacy de edit_products
manage: 3         → todo + archivar/duplicar/eliminar Lista + administrar accesos inferiores
manage_access: 4  → manage + administrar accesos (otorgar manage/manage_access)
```

### Frontend — archivos encontrados y estado

| Ruta | Estado | Observaciones |
|---|---|---|
| `App.tsx` | Existe | Rutas: `/login`, `/` (AdminLayout: index Dashboard, /commercial/**, /users, /audit). Comercial: products, lists, lists/:id, assignments, suppliers, purchase-orders, purchasing-dashboard, settings. |
| `Header.tsx` | Existe | Navegación raíz: Dashboard, Comercial (dropdown), Usuarios (canViewUsers condicional), Auditoría (canViewAudit condicional). Items Comercial: Productos, Listas, Asignaciones, Configuración. |
| `CommercialLayout.tsx` | Existe | Tabs: Productos, Listas, Asignaciones, Proveedores, Órdenes de Compra, Panel de Compras, Configuración. |
| `ListasPage.tsx` | Existe | Listado con filtros avanzados, selección masiva, modales crear/editar/importar, DeleteConfirmModal (eliminación directa). |
| `ListaDetailPage.tsx` | Existe | Tabs: Productos, Precios, Accesos, Auditoría, Configuración. Accesos es SOLO lectura con enlace de texto. |
| `ProductsPage.tsx` | Existe | Catálogo global de productos con filtros, selección masiva, bulk transitions, bulk delete. |
| `ProductDetailPage.tsx` | Existe | URI `/commercial/products/:productId`. Tabs: Información, Atributos, Imágenes, Precios, Stock, Proveedores, Accesos, Publicación, Auditoría. |
| `UsersPage.tsx` | Existe | Pestañas Usuarios / Roles y Permisos. **No tiene pestaña Asignaciones** (Assignments está en `/commercial/assignments`). |
| `AuditPage.tsx` | Existe | URI `/audit`. Tabla con fecha/usuario/acción/entidad/ID. Filtros cliente-side: entidad, acción. **Sin paginación server-side**, sin fecha/rango, sin resultado, sin ubicación, sin cargo/teléfono, sin Lista. |
| `listas.service.ts` | Existe | Cliente API de Lista (CRUD, archive, restore, duplicate, template). |
| `assignments.service.ts` | Existe | Cliente API de asignaciones. Niveles: view/edit_prices/edit_products/edit/manage/manage_access. |
| `audit.service.ts` | **NO EXISTE** | AuditPage llama a `api.get('/audit')` directamente en el componente. |
| `types/index.ts` | **NO EXISTE** | Tipos frontend en `features/products/types/product.types` y servicios individuales. |
| `rbac.ts` | Existe | Helpers: hasRole, hasPermission, canCreateLista, canManageListas, canDeleteLista, canViewUsers, canViewAudit, etc. |
| `BulkDeleteModal.tsx` | Existe | Flujo: confirm → clave usuario → done. Sin masterKey en el modal (el service deleteProduct maneja clave+masterKey interno). |
| `product-detail.service.ts` | Existe | Servicio de detalle: fetchProductStock, updateProductStock, fetchProductAudit, fetchProductSuppliers, upload/delete images, schedulePublish, cancelScheduledPublish, deleteProduct. |

### Brechas encontradas respecto al objetivo

| Brecha | Estado actual | Necesario |
|---|---|---|
| **Eliminación diferida 90 días** | `Lista.removeLista` borra físicamente con masterKey | Nuevo campo `deletionStatus` (enum: null/NONE, PENDING_DELETION), `deletionRequestedAt`, `deletionPurgeAt`, `deletionReason`, `deletionRequestedById`. Scheduler purga automática. |
| **Permiso `listas:delete` global** | Solo rol verificado (isListasAdmin), no hay permiso granular en BD | Añadir `listas:delete` a `RolePermission` y verificar en `removeLista` |
| **No exigir masterKey para eliminar Lista** | `removeLista` exige masterKey (pide 409/403) | La eliminación diferida solicita motivo, no clave maestra. La purga automática es interna. |
| **Product editor bajo Lista** | URI: `/commercial/products/:productId` (sin contexto de Lista) | URI: `/commercial/lists/:listaId/products/:productId` |
| **isActive/isVisible editable en Información** | `InfoTab` permite editar isActive/isVisible | No deben editarse desde Información; son derivados del FSM |
| **Pestaña Accesos en ProductDetail** | `AccessTab` existe con ProductAccessModal que escribe assignments | Según objetivo, solo consulta contextual; escritura solo en Usuarios → Asignaciones |
| **Autoría única Asignaciones** | CRUD en `/commercial/assignments` **y** modal en ProductDetail **y** auto-asignación en crear Lista | Unificar escritura en Usuarios → Asignaciones; las vistas contextuales son solo lectura |
| **Navegación Asignaciones en Comercial** | Assignments bajo `/commercial/assignments` | Debe estar bajo `/users/assignments` según árbol objetivo |
| **UsersPage sin pestaña Asignaciones** | Tabs: Usuarios, Roles y Permisos. No hay Asignaciones. | Agregar tercera pestaña "Asignaciones" que reemplaza la vista comercial |
| **Auditoría sin `result`, sin `listaId`, sin fecha/rango, sin ubicación** | AuditLog no tiene `result` (string), sin `listaId` directo | Añadir campo `result` (SUCCESS/ERROR/WARNING), `location` (string modulo). El `listaId` se resuelve por entity/entityId. Filtros server-side de rango fecha, resultado, ubicación pendientes. |
| **Auditoría global sin paginación server-side ni filtros completos** | Backend tiene skip/take pero frontend no los usa | Frontend debe pasar skip/take/dateRange/result a `/api/audit` |
| **Auditoría por Lista: misma fuente de datos** | `listas.controller` GET audit con `entity='LISTA'` | Es el mismo endpoint /audit con entity y entityId fijo |
| **User sin `cargo`, `telefono`, `ubicacion`** | Model solo tiene name/email/password/isActive | Añadir columns: `position String?` (cargo), `phone String?`, `location String?` (ubicación) |
| **Tarifas sin UI de Config Comercial** | No hay endpoint PriceList CRUD en scope. PriceList existe en BD. PriceList se selecciona al crear precio. | Config Comercial → Tarifas debe tener CRUD de PriceList (módulo ya existe en BD pero sin UI dedicada) |
| **Config Comercial desordenada** | CommercialSettingsPage agrupa categorías, marcas, y otros mixes | Debe haber sub-secciones: Categorías, Marcas, Proveedores, Tarifas |
| **Publicación por Lista completa sin endpoint** | bulkTransition existe (por IDs) pero no operación "publicar todos los publicables de una Lista" | Nuevo endpoint `POST /api/lists/:id/publish-all` o similar |
| **Scheduler de purga de Lista** | No existe | Nuevo @Cron similar a handleLifecycleTick que barra listas cuyo purgeAt ya venció |

---

## Decisiones funcionales cerradas

Las decisiones 1-9 del enunciado se aceptan como vínculo:

1. **Navegación raíz objetivo** — estructura con Dashboard, Comercial (submenú), Usuarios (submenú), Auditoría.
2. **Responsabilidad única** — cada área hace solo lo suyo.
3. **Operación por Lista** — ListaDetailPage tabs.
4. **Editor de producto** — ruta bajo Lista, tabs definidos, isActive/isVisible read-model.
5. **Autorización** — permiso global + asignación LISTA + nivel suficiente.
6. **Eliminación de Lista: 90 días** — retención + purga automática.
7. **Publicación programada** — individual, masiva (IDs), por Lista completa.
8. **Auditoría global** — única fuente, filtros completos.
9. **Enrutamiento:** Asignaciones bajo Usuarios no bajo Comercial.

---

## Relaciones de cascada para eliminación de Lista (inventario exacto)

Basado en `schema.prisma` líneas 85-118 y relaciones FK:

| Tabla | FK a Lista | Comportamiento al eliminar Lista |
|---|---|---|
| `Product.listaId` | FK nullable, `onDelete: SetNull` (por relación `lista`) | **Desvincular:** productos quedan sin Lista (no se borran). Para borrado en cascada, se deben eliminar manualmente. |
| `Price.listaId` | FK nullable, `onDelete: SetNull` (por relación `lista`) | **Desvincular:** precios quedan sin Lista (no se borran). Para cascada deben eliminarse manualmente. |
| `Assignment` | **No tiene FK a Lista** (resourceId es String, resourceType='LISTA') | **Borrar manualmente:** `deleteMany({ resourceType: 'LISTA', resourceId })` — ya implementado en removeLista. |
| `AuditLog` | No tiene FK a Lista (se filtra por entity/entityId) | **NO se borra:** se conserva como rastro. |
| `ProductImage` | No tiene FK a Lista | Se elimina con su Product padre (si se elimina Product). |
| `Stock` | No tiene FK a Lista | Se elimina con su Product padre (`onDelete: Cascade`). |
| `SupplierEvaluation` | No relacionada con Lista | No se elimina. |
| `PurchaseOrder` | No relacionada con Lista | No se elimina (solo referencia User). |

**Decisión para purga de 90 días:** la eliminación física de una Lista debe:
1. Hard-delete de `Assignment(resourceType:'LISTA', resourceId)` — sin FK, deleteMany directo.
2. Hard-delete de `Price` con `listaId` — deleteMany directo.
3. Hard-delete de `Product` con `listaId` — cascada para `ProductImage` (borrado manual) y `Stock` (onDelete: Cascade propio); `AuditLog` se conserva.
4. Hard-delete de `Lista` — delete único.
5. NO eliminar: Users, Roles, RolePermissions, Categories, Brands, Suppliers, SupplierEvaluations, PurchaseOrders, PriceLists, ImportMappings, AuditLog.

---

## Fase 1 — Contrato de datos y backend seguro

### Objetivo
Extender el modelo de datos con campos faltantes (propuesta no ejecutada), inventariar cascadas, y preparar el backend seguro sin migraciones.

### Propuesta de cambio de schema (NO EJECUTAR, solo documentar)

Los siguientes campos nuevos se proponen para `schema.prisma` (Fase 1A — diseño, Fase 1B — migración):

```prisma
// En User
position    String?   // cargo (auditoría)
phone       String?   // teléfono (auditoría)
location    String?   // ubicación/área (auditoría)

// En Lista — eliminación diferida
deletionStatus     String?    // null | 'PENDING_DELETION'
deletionRequestedAt DateTime?
deletionPurgeAt    DateTime?  // requestedAt + 90 días en America/Bogota
deletionReason     String?
deletionRequestedById String?
deletionRequestedBy User? @relation("ListaDeletionRequester", fields: [deletionRequestedById], references: [id], onDelete: SetNull)

// En AuditLog
result       String?   // 'SUCCESS' | 'ERROR' | 'WARNING'
```

### Archivos autorizados para Fase 1
- `src/backend/prisma/schema.prisma` — editar modelos User, Lista, AuditLog
- `src/backend/src/modules/listas/listas.service.ts` — agregar lógica de validación de estado PENDING_DELETION (no permitir mutaciones)
- `src/backend/src/modules/listas/listas.controller.ts` — agregar endpoint POST `:id/request-deletion` y POST `:id/cancel-deletion`
- `src/backend/src/modules/audit/audit.service.ts` — soportar filtro `result`, `dateFrom`, `dateTo`
- `src/backend/src/modules/audit/audit.controller.ts` — aceptar query params `result`, `dateFrom`, `dateTo`

### Archivos prohibidos en Fase 1
- Migraciones (no se ejecutan)
- Seed
- Frontend
- .env

### Cambios verificables
- Backend `npx tsc --noEmit` limpio
- Tests `npx jest` pasan (no se rompen tests existentes)
- Endpoint `POST /api/listas/:id/request-deletion` acepta `{ reason: string }`, responde 200, setea `deletionStatus=PENDING_DELETION`
- Endpoint `POST /api/listas/:id/cancel-deletion` acepta solo si está PENDING_DELETION
- Las operaciones de escritura sobre una Lista en PENDING_DELETION devuelven 409

### Comandos de validación
```bash
cd src/backend
npx prisma format
npx prisma validate
npx tsc --noEmit
npx jest --passWithNoTests
npm run build
```

### Criterios de aceptación
- Existe endpoint de solicitud de eliminación (no destructivo)
- Existe endpoint de cancelación
- Lista en PENDING_DELETION rechaza editar/crear productos/importar/publicar con 409
- Backend compila y tests pasan

---

## Fase 2 — API y reglas de autorización

### Objetivo
Implementar permiso global `listas:delete`, nuevo endpoint de publicación por Lista completa, filtros de auditoría completos, y scheduler de purga de Lista.

### Archivos autorizados
- `src/backend/src/modules/listas/listas.service.ts` — verificar `listas:delete` en removeLista; método `publishAllElegible(listaId, ctx)`; método `cancelDeletion`; método `restoreFromDeletion`
- `src/backend/src/modules/listas/listas.controller.ts` — POST `:id/publish-all`, POST `:id/request-deletion`, POST `:id/cancel-deletion`
- `src/backend/src/modules/products/products.service.ts` — método público `publishAllForLista(listaId)` (reutiliza bulkTransition interno)
- `src/backend/src/modules/audit/audit.service.ts` — filtros `dateFrom`, `dateTo`, `result`, `location`, paginación server-side completa
- `src/backend/src/modules/audit/audit.controller.ts` — query params `dateFrom`, `dateTo`, `result`, `listaId`
- `src/backend/src/common/acl/acl.service.ts` — método `hasGlobalPermission(userId, permission)` para verificar RolePermission
- `src/backend/src/modules/assignments/assignments.controller.ts` — añadir query param `listaId` para filtrar assignments de una Lista
- `src/backend/src/modules/assignments/assignments.service.ts` — soportar filtro `listaId`
- **NUEVO** `src/backend/src/modules/listas/listas-purge.scheduler.ts` — scheduler @Cron diario que purga listas cuyo `deletionPurgeAt <= now`
- `src/backend/src/modules/listas/listas.module.ts` — registrar scheduler
- `src/backend/src/app.module.ts` — importar ListasModule si no lo está

### Archivos prohibidos en Fase 2
- Migraciones (ya deben estar aplicadas de Fase 1)
- Frontend
- Seed

### Cambios verificables
- Permiso `listas:delete` en RolePermission y verificado en removeLista
- `POST /api/listas/:id/publish-all` publica productos elegibles de la Lista, reporta { applied, rejected }
- `GET /api/audit` acepta `dateFrom`, `dateTo`, `result` y pagina correctamente
- Scheduler purga Listas cuyo `deletionPurgeAt` ya venció, borra en cascada controlada, conserva auditoría

### Comandos de validación
```bash
cd src/backend
npx tsc --noEmit
npm run build
npx jest
```

### Criterios de aceptación
- Backend compila con todos los cambios de Fase 1 y 2
- Tests existentes siguen pasando (0 regresiones)
- Nuevos tests: publish-all, request-deletion, cancel-deletion, purge-scheduler, audit-filters
- Purge scheduler no tiene endpoint público ejecutable manualmente

---

## Fase 3 — Navegación y páginas frontend

### Objetivo
Reestructurar la navegación raíz según árbol objetivo: Comercial solo Productos/Listas/Configuración; Usuarios con Usuarios/Roles/Asignaciones; Auditoría raíz.

### Archivos autorizados
- `src/frontend/src/App.tsx` — rutas: mantener `/` layout. Comercial: products, lists, lists/:id, lists/:listaId/products/:productId, config/*. Users: `/users`, `/users/assignments`. Auditoría: `/audit`.
- `src/frontend/src/components/layout/Header.tsx` — Comercial dropdown solo Productos, Listas, Configuración. Navegador raíz: Dashboard, Comercial, Usuarios (subrayado con Usuarios/Roles/Asignaciones), Auditoría.
- `src/frontend/src/components/layout/CommercialLayout.tsx` — Tabs: Productos, Listas. Eliminar Asignaciones/Proveedores/Órdenes de Compra/Panel de Compras. Añadir enlace a Configuración.
- `src/frontend/src/pages/UsersPage.tsx` — Agregar tercera pestaña "Asignaciones". Migrar lógica de AssignmentsPage a esta pestaña. Filtro `listaId` para vista desde Acceso contextual de Lista.
- `src/frontend/src/pages/ListasPage.tsx` — Botón de eliminar solo como solicitud (no borrado directo). Modal de confirmación con motivo obligatorio.
- `src/frontend/src/pages/ListaDetailPage.tsx` — Pestaña Accesos: solo consulta con enlace a `/users/assignments?listaId=:listaId`; eliminar descarga plantilla/importar de acciones generales.
- `src/frontend/src/pages/ProductsPage.tsx` — Eliminar botón de nuevo producto (creación solo desde ListaDetail). Catálogo global solo consulta.
- `src/frontend/src/pages/ProductDetailPage.tsx` — Mover a ruta `/commercial/lists/:listaId/products/:productId`. En InfoTab, eliminar checkboxes isActive/isVisible (read-model). Eliminar pestaña Accesos (solo consulta contextual → eliminar). Navegación breadcrumb: Listas → Lista → Producto.
- `src/frontend/src/pages/AuditPage.tsx` — Paginación server-side, filtros completos: rango fecha, acción, resultado, módulo, entidad, ID de entidad, Lista, producto/SKU, usuario, correo, cargo, marca, proveedor, tarifa, estado publicación.
- `src/frontend/src/services/listas.service.ts` — Agregar métodos `requestDeletion(id, reason)`, `cancelDeletion(id)`, `publishAll(id)`.
- `src/frontend/src/services/assignments.service.ts` — Agregar query param `listaId` al fetchAssignments.
- `src/frontend/src/lib/rbac.ts` — Agregar `canDeleteLista()` basado en permiso `listas:delete` (o rol). Ajustar `canManageListas()` para no incluir eliminar.
- **NUEVO** `src/frontend/src/pages/CommercialConfigPage.tsx` — página de Configuración Comercial con sub-secciones (Categorías, Marcas, Proveedores, Tarifas) usando tabs.

### Archivos prohibidos
- Backend
- Migraciones
- Seed
- .env

### Cambios verificables
- Navegación raíz: al hacer hover en Usuarios se ve submenú Usuarios/Roles/Asignaciones
- Al hacer clic en Asignaciones, lleva a `/users/assignments` (con context `?listaId=` si vino de una Lista)
- ProductDetailPage carga en `/commercial/lists/:listaId/products/:productId`
- InfoTab no muestra isActive/isVisible
- AuditPage tiene paginación en el frontend y pasa skip/take al backend

### Comandos de validación
```bash
cd src/frontend
npx tsc --noEmit
npm run build
```

### Criterios de aceptación
- Frontend compila sin errores
- Todas las rutas nuevas navegan correctamente
- No hay referencias a rutas antiguas eliminadas
- El catálogo global de productos (`/commercial/products`) sigue funcionando pero sin botón "Nuevo Producto"

---

## Fase 4 — Flujos de Lista, producto, publicación y eliminación

### Objetivo
Implementar flujos completos: solicitud de eliminación con motivo, restauración desde PENDING_DELETION, publicación individual/masiva/por Lista, y binding de editor de producto a Lista.

### Archivos autorizados
- `src/backend/src/modules/listas/listas.service.ts` — `requestDeletion(id, reason, ctx)`: setea PENDING_DELETION + purgeAt = now+90d Bogotá. `cancelDeletion(id, ctx)`: resetea a null. `restoreFromPending(id, ctx)`: solo durante PENDING_DELETION. Guardas ACL manage + listas:delete.
- `src/backend/src/modules/listas/listas.controller.ts` — POST `:id/request-deletion`, POST `:id/cancel-deletion`, POST `:id/restore-from-pending`.
- `src/backend/src/modules/listas/listas-purge.scheduler.ts` — @Cron diario a las 3am Bogotá: findMany donde deletionPurgeAt <= now, ejecuta purge transaccional, deja audit snapshot con oldValues completos.
- `src/frontend/src/pages/ListasPage.tsx` — Modal de solicitud de eliminación con motivo obligatorio (textarea). Sin masterKey. Confirmación "Solicitar eliminación" en vez de "Eliminar definitivamente". Badge "Eliminación en 90 días" para listas PENDING_DELETION.
- `src/frontend/src/pages/ListaDetailPage.tsx` — Pestaña Configuración: si PENDING_DELETION, mostrar estado con fecha de purga y motivo, y botón Cancelar solicitud + Restaurar.
- `src/frontend/src/pages/ProductDetailPage.tsx` — Editor bajo Lista: breadcrumb Listas → Lista → Producto. En PublishTab: botón "Publicar todos los elegibles de la Lista" (publishAll). Nota: el scheduler de purga no tiene UI.
- `src/frontend/src/services/listas.service.ts` — Métodos requestDeletion, cancelDeletion, restoreFromPending, publishAll.
- `src/frontend/src/pages/ListasPage.tsx` — Ajustar selección masiva: botón "Solicitar eliminación" en vez de "Eliminar definitivamente".

### Archivos prohibidos
- Migraciones (ya aplicadas)
- Seed
- .env

### Cambios verificables
- Al solicitar eliminación, la Lista queda con `deletionStatus=PENDING_DELETION`, motivo guardado, purgeAt calculado
- La Lista en PENDING_DELETION no permite editar campos, crear productos, importar, publicar (409)
- Durante PENDING_DELETION, solo usuarios con `manage` + `listas:delete` pueden restaurarla o cancelar
- El scheduler corre silentemente sin endpoint público
- Al purgar, se conserva auditoría con snapshot completo incluso después de borrada la Lista

### Comandos de validación
```bash
cd src/backend
npx tsc --noEmit
npm run build
npx jest
cd src/frontend
npx tsc --noEmit
npm run build
```

### Criterios de aceptación
- Flujo UI completo: Lista → Solicitar eliminación → motivo → PENDING_DELETION → no editable
- Cancelar solicitud restaura a estado normal
- Publicar Lista completa ejecuta bulkTransition internamente
- Scheduler no invocable desde API pública

---

## Fase 5 — QA y validación

### Objetivo
Validar que los cambios no rompen funcionalidades existentes, ejecutar tests de integración y revisar regresiones.

### Archivos autorizados (solo lectura/ejecución)
- Todos los archivos modificados en Fases 1-4
- `src/backend/src/modules/listas/listas.service.spec.ts` — tests existentes
- `src/backend/src/modules/products/products.service.spec.ts` — tests existentes
- `src/backend/src/modules/prices/prices.service.spec.ts` — tests existentes
- `src/backend/src/modules/assignments/assignments.service.spec.ts` — tests existentes
- `src/backend/src/modules/audit/audit.service.spec.ts` — tests existentes (si existe)
- `src/backend/src/modules/users/users.service.spec.ts` — tests existentes

### Prohibido
- Modificar código de aplicación
- Ejecutar migraciones
- Acceder a producción

### Validación permitida
```bash
cd src/backend
npx eslint "src/**/*.ts"
npm run build
npx jest --coverage --verbose
cd src/frontend
npx eslint .
npx tsc --noEmit
npm run build
```

### Criterios de aceptación
- Backend: 0 errores tsc, build OK, 100% tests existentes pasan
- Frontend: 0 errores tsc, build OK, 0 errores eslint
- No hay regresiones en rutas, autorización, ACL
- No hay exposición de datos no autorizados
- No hay secretos en el repositorio

---

## Dependencias entre fases

```
Fase 1 (schema propuesto) ──→ Fase 2 (API + scheduler) ──→ Fase 4 (flujos UI completos)
                                     │
                                     └──→ Fase 3 (navegación frontend)
                                              │
                                              └──→ Fase 4 (flujos UI completos)
                                                       │
                                                       └──→ Fase 5 (QA)
```

- Fase 1 debe completarse antes que Fase 2 (los endpoints dependen de nuevos campos de Lista)
- Fase 2 y Fase 3 pueden ejecutarse en paralelo (backend API y frontend navegación son independientes)
- Fase 4 depende de Fase 2 (endpoints de publicación/eliminación) y Fase 3 (navegación reorganizada)
- Fase 5 es final y validación integral

---

## Riesgos y controles

| Riesgo | Control |
|---|---|
| Cambio de ruta de producto existente (`/commercial/products/:productId` → `/commercial/lists/:listaId/products/:productId`) rompe enlaces guardados/notificaciones | Mantener redirect en App.tsx: `path="commercial/products/:productId" → Navigate` |
| Eliminación de pestaña Accesos en ProductDetail rompe flujos de usuarios acostumbrados | Reemplazar con sección solo lectura que enlace a Usuarios → Asignaciones |
| Admin Comercial pierde acceso a gestión de asignaciones si se mueven a Usuarios | UsersController actualmente es solo Super Admin; abrir `@Roles('Super Admin', 'Admin Comercial')` en endpoints de assignments bajo `/users/assignments` |
| Scheduler de purga no se activa en producción porque no se registró el módulo | Asegurar que `ListasPurgeScheduler` se importe en `listas.module.ts` y app.module |
| Purga accidental de datos por error en scheduler | Auditoría previa al borrado + snapshot completo + prueba en staging antes de producción |
| Conflictos de merge por cambios masivos en frontend | Trabajar por commits pequeños, una fase a la vez, sin cambios no solicitados |

---

## Órdenes Kilo listas para ejecutar

### Orden Fase 1A — Diseño de esquema (solo documento, no migración)

**Agente:** `GS Comercial Backend Implementer`

**Archivos autorizados:**
- `src/backend/prisma/schema.prisma` | solo lectura (inspección)
- `.kilo/context/plan-implementacion-reestructura-comercial-2026-09-02.md` | actualizar con propuesta de schema

**Modificaciones permitidas:** ninguna en código de aplicación. Solo actualizar el plan con la propuesta de schema exacta (campos, tipos, relaciones, índices) para User, Lista y AuditLog.

**Archivos prohibidos:** migrations, seed, .env, frontend, todo lo no listado.

**Cambios verificables:** el documento actualizado contiene las sentencias Prisma exactas para los nuevos campos.

**Comandos de validación:**
```bash
git diff --check
```

**Criterios de aceptación:**
- La propuesta de schema incluye todos los campos necesarios para eliminar una lista (deletionStatus, deletionRequestedAt, deletionPurgeAt, deletionReason, deletionRequestedById) con FK y onDelete SetNull
- Incluye los campos de User (position, phone, location)
- Incluye el campo AuditLog.result
- No se ejecuta migración ni se modifica schema.prisma real

**Respuesta requerida del agente:**
```
ESTADO: completado | bloqueado
ARCHIVOS MODIFICADOS: .kilo/context/plan-implementacion-reestructura-comercial-2026-09-02.md
DECISIONES: [propuesta de schema aceptada o rechazada]
SIGUIENTE: Fase 1B — migración (requiere aprobación)
```

---

### Orden Fase 1B — Migración de datos (solo propuesta, no ejecutar)

**Agente:** `GS Comercial Backend Implementer`

**Archivos autorizados:**
- `src/backend/prisma/schema.prisma`
- `src/backend/prisma/migrations/` | solo listar directorio (no modificar)

**Modificaciones permitidas:** ninguna en código. Solo redactar el contenido exacto del archivo de migración SQL y cualquier script de backfill necesario.

**Archivos prohibidos:** seed.ts, .env, frontend.

**Nota:** Está terminantemente prohibido ejecutar `prisma migrate dev`, `prisma db push`, `prisma migrate deploy` o cualquier comando que escriba en la base de datos.

**Migración propuesta (documentar solo, no ejecutar):**
```sql
ALTER TABLE users ADD COLUMN position TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN location TEXT;

ALTER TABLE listas ADD COLUMN deletion_status TEXT;
ALTER TABLE listas ADD COLUMN deletion_requested_at TIMESTAMPTZ;
ALTER TABLE listas ADD COLUMN deletion_purge_at TIMESTAMPTZ;
ALTER TABLE listas ADD COLUMN deletion_reason TEXT;
ALTER TABLE listas ADD COLUMN deletion_requested_by_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE audit_logs ADD COLUMN result TEXT;
```

**Criterios de aceptación:**
- El SQL propuesto es correcto para PostgreSQL
- No se ejecutó ningún comando en la base de datos

**Respuesta requerida:**
```
ESTADO: completado
MIGRACIÓN PROPUESTA: [SQL exacto]
NO SE EJECUTÓ NINGÚN COMANDO EN BD
```

---

### Orden Fase 2A — API de eliminación diferida y autorización

**Agente:** `GS Comercial Backend Implementer`

**Archivos autorizados para modificar:**
- `src/backend/src/modules/listas/listas.service.ts`
- `src/backend/src/modules/listas/listas.controller.ts`
- `src/backend/src/modules/listas/listas.module.ts`
- **NUEVO** `src/backend/src/modules/listas/dto/request-deletion.dto.ts`
- **NUEVO** `src/backend/src/modules/listas/dto/cancel-deletion.dto.ts`
- `src/backend/src/modules/audit/audit.service.ts`
- `src/backend/src/modules/audit/audit.controller.ts`
- `src/backend/src/common/acl/acl.service.ts`
- `src/backend/src/app.module.ts` (solo registrar módulos nuevos)

**Archivos prohibidos:** migrations, seed, frontend.

**Cambios técnicos verificables:**
1. En `listas.service.ts`:
   - Método `requestDeletion(id, reason, ctx)`: verifica `manage` + `listas:delete`, setea `deletionStatus=PENDING_DELETION`, `deletionRequestedAt=now`, `deletionPurgeAt=now+90d` (zona Bogotá), `deletionReason=reason`, `deletionRequestedById=ctx.userId`. Audita evento `request_deletion`.
   - Método `cancelDeletion(id, ctx)`: verifica `manage` + `listas:delete`, solo si `deletionStatus=PENDING_DELETION`. Resetea campos a null. Audita `cancel_deletion`.
   - Modificar `update()`, `toggleActive()`, `archive()`, `restore()`, `duplicateLista()` para rechazar con 409 si `deletionStatus=PENDING_DELETION`.
2. En `listas.controller.ts`:
   - Nuevo endpoint `POST :id/request-deletion` con DTO `{ reason: string }`, body no vacío.
   - Nuevo endpoint `POST :id/cancel-deletion` (body vacío).
3. En `audit.service.ts`:
   - Soporte para `dateFrom`, `dateTo`, `result` en `findAll()`.
   - Normalización de `result` (uppercase: SUCCESS/ERROR/WARNING).
4. En `audit.controller.ts`:
   - Query params `dateFrom?: string`, `dateTo?: string`, `result?: string`, `listaId?: string`.
   - `listaId` se traduce a `entity: 'LISTA', entityId: listaId`.
5. En `acl.service.ts`:
   - Método `hasGlobalPermission(userId, permission)` que busca en RolePermission via User → UserRole → Role → RolePermission.
   - Método `assertGlobalPermission(ctx, permission)` que lanza 403 si no tiene.

**Comandos de validación:**
```bash
cd src/backend
npx tsc --noEmit
npm run build
npx jest --passWithNoTests
```

**Criterios de aceptación:**
- Backend compila
- Tests existentes siguen pasando
- `POST /api/listas/:id/request-deletion` funciona con motivo
- `POST /api/listas/:id/cancel-deletion` revierte
- Las mutaciones en PENDING_DELETION devuelven 409
- Audit `GET /api/audit?dateFrom=&dateTo=&result=` filtra correctamente

**Respuesta requerida del agente:**
```
ESTADO: completado | bloqueado
ARCHIVOS MODIFICADOS: [lista]
PRUEBAS: [resultado jest]
RIESGOS: [cualquier riesgo nuevo detectado]
```

---

### Orden Fase 2B — Publicación por Lista y purge scheduler

**Agente:** `GS Comercial Backend Implementer`

**Archivos autorizados para modificar:**
- `src/backend/src/modules/listas/listas.service.ts`
- `src/backend/src/modules/listas/listas.controller.ts`
- `src/backend/src/modules/products/products.service.ts` | exportar método `publishAllForLista(listaId): Promise<AppliedRejected>`
- **NUEVO** `src/backend/src/modules/listas/listas-purge.scheduler.ts`
- `src/backend/src/modules/listas/listas.module.ts`
- `src/backend/src/modules/assignments/assignments.controller.ts` | añadir query param `listaId`
- `src/backend/src/modules/assignments/assignments.service.ts` | soportar `listaId` en findAll

**Archivos prohibidos:** migrations, seed, frontend.

**Cambios técnicos verificables:**
1. `listas.service.ts`:
   - Método `publishAllElegible(listaId, ctx)`: verifica `edit` sobre Lista, obtiene productos elegibles de la Lista (DRAFT, cumplen checklist), ejecuta `productsService.publishAllForLista(listaId)`.
2. `products.service.ts`:
   - Método `publishAllForLista(listaId)`: bulkTransition interno sobre IDs elegibles (no llama a la API HTTP, reutiliza `doTransition`).
3. `listas-purge.scheduler.ts`:
   - @Cron a las 3am Bogotá (`CronExpression.EVERY_DAY_AT_3AM` o expresion cron `0 3 * * *`).
   - Query: `lista.findMany({ where: { deletionStatus: 'PENDING_DELETION', deletionPurgeAt: { lte: now } } })`.
   - Por cada Lista: transacción (order: assignments deleteMany, prices deleteMany, products deleteMany + images filesystem, lista delete). Conserva auditLog con snapshot.
   - Reporte interno (sin endpoint público).
4. `assignments.controller.ts`:
   - Query param `listaId?` en GET /api/assignments.
5. `assignments.service.ts`:
   - Si `listaId` está presente, filtrar assignments con resourceType='LISTA' y resourceId=listaId.

**Comandos de validación:**
```bash
cd src/backend
npx tsc --noEmit
npm run build
npx jest
```

**Criterios de aceptación:**
- `POST /api/listas/:id/publish-all` ejecuta y reporta applied/rejected
- Scheduler compila y se registra
- Assignments GET acepta `?listaId=`

**Respuesta requerida:**
```
ESTADO: completado
ARCHIVOS MODIFICADOS: [lista]
VALIDACIÓN: tsc limpio, build OK, jest OK
```

---

### Orden Fase 3A — Navegación raíz y rutas frontend

**Agente:** `GS Frontend Implementer`

**Archivos autorizados para modificar:**
- `src/frontend/src/App.tsx`
- `src/frontend/src/components/layout/Header.tsx`
- `src/frontend/src/components/layout/CommercialLayout.tsx`
- `src/frontend/src/pages/UsersPage.tsx`
- **NUEVO** `src/frontend/src/pages/CommercialConfigPage.tsx` | o modificar CommercialSettingsPage

**Archivos prohibidos:** backend, migraciones.

**Cambios técnicos verificables:**
1. `App.tsx`:
   - Añadir ruta `path="commercial/lists/:id/products/:productId"` → `ProductDetailPage` (nuevo contexto con listaId).
   - Redirect de `/commercial/products/:productId` → `/commercial/lists/default/products/:productId` o mantener ambas (la nueva prevalece).
   - Nueva ruta `path="users/assignments"` → `AssignmentsPage` (o integrar en UsersPage).
   - Rutas de Configuración Comercial: `path="commercial/config/categories"`, `/config/brands`, `/config/suppliers`, `/config/tarifas`.
2. `Header.tsx`:
   - Comercial dropdown: Productos, Listas, Configuración (sin Asignaciones).
   - Usuarios: enlaces directos, subrayado con: Usuarios, Roles y permisos, Asignaciones.
3. `CommercialLayout.tsx`:
   - Tabs: Productos, Listas. Eliminar Asignaciones/Proveedores/Órdenes de Compra/Panel de Compras.
4. `UsersPage.tsx`:
   - Tercer tab "Asignaciones" que carga `AssignmentsPageContent` con filtro opcional `?listaId`.
   - Si viene query param `listaId`, filtrar assignments por esa Lista y mostrar contexto.

**Comandos de validación:**
```bash
cd src/frontend
npx tsc --noEmit
npm run build
```

**Criterios de aceptación:**
- Navegación reorganizada según árbol objetivo
- /users/assignments funciona y filtra por listaId
- ProductDetailPage carga en la nueva ruta

**Respuesta requerida:**
```
ESTADO: completado
ARCHIVOS MODIFICADOS: [lista]
VALIDACIÓN: tsc limpio, build OK
```

---

### Orden Fase 3B — Páginas de lista, producto y auditoría

**Agente:** `GS Frontend Implementer`

**Archivos autorizados para modificar:**
- `src/frontend/src/pages/ListasPage.tsx`
- `src/frontend/src/pages/ListaDetailPage.tsx`
- `src/frontend/src/pages/ProductsPage.tsx`
- `src/frontend/src/pages/ProductDetailPage.tsx`
- `src/frontend/src/pages/AuditPage.tsx`
- `src/frontend/src/services/listas.service.ts`
- `src/frontend/src/lib/rbac.ts`

**Archivos prohibidos:** backend, migraciones.

**Cambios técnicos verificables:**
1. `ListasPage.tsx`:
   - Botón "Eliminar" → "Solicitar eliminación" (abre modal con textarea motivo).
   - Listas en PENDING_DELETION muestran badge con fecha de purga y motivo.
   - Botones de acción deshabilitados en PENDING_DELETION.
2. `ListaDetailPage.tsx`:
   - Pestaña Accesos: solo tabla de lectura, sin botones de edición. Enlace a `/users/assignments?listaId=:listaId`.
   - Pestaña Configuración: si PENDING_DELETION, mostrar estado + motivo + fecha purga + botón Cancelar solicitud y Restaurar (solo si authorize).
3. `ProductsPage.tsx`:
   - Eliminar botón "Nuevo Producto" (creación solo desde ListaDetail).
   - Ajustar texto de empty state.
4. `ProductDetailPage.tsx`:
   - Aceptar `listaId` de parámetro de ruta.
   - Breadcrumb: Listas → [nombre Lista] → [nombre Producto] (con links).
   - InfoTab: eliminar checkboxes isActive/isVisible. El estado se muestra solo como badge (read-model derivado del lifecycleStatus).
   - Eliminar pestaña Accesos (se reemplaza por enlace a Usuarios → Asignaciones contextual).
5. `AuditPage.tsx`:
   - Paginación server-side: enviar skip, take al backend.
   - Filtros: rango fecha (dateFrom/dateTo inputs), resultado (select SUCCESS/ERROR/WARNING), entidad, acción, listaId (input text o select), usuario (input nombre), correo, cargo, marca, proveedor, tarifa, estado publicación.
   - Tabla expandible: oldValues/newValues como JSON expandible.
6. `listas.service.ts`:
   - Método `requestDeletion(id: string, reason: string): Promise<void>`
   - Método `cancelDeletion(id: string): Promise<void>`
   - Método `publishAll(id: string): Promise<AppliedRejected>`
7. `rbac.ts`:
   - `canDeleteLista()`: verificar `listas:delete` permission además de rol.

**Comandos de validación:**
```bash
cd src/frontend
npx tsc --noEmit
npm run build
```

**Criterios de aceptación:**
- Flujo "Solicitar eliminación" completo en UI
- ProductDetailPage sin isActive/isVisible editables, sin pestaña Accesos
- AuditPage con paginación y filtros expandidos
- Frontend compila

**Respuesta requerida:**
```
ESTADO: completado
ARCHIVOS MODIFICADOS: [lista]
VALIDACIÓN: tsc limpio, build OK
```

---

### Orden Fase 4 — Flujos completos de eliminación y publicación

**Agente:** `GS Frontend Implementer` (con dependencia a backend Fase 2B)

**Archivos autorizados:** mismos que Fase 3B más `src/frontend/src/pages/ListaDetailPage.tsx`.

**Cambios técnicos:**
- Conectar UI de solicitud de eliminación con endpoint real `POST /api/listas/:id/request-deletion` y cancelación con `POST /api/listas/:id/cancel-deletion`.
- Conectar `publishAll` con `POST /api/listas/:id/publish-all` y mostrar resultados en UI.
- Mostrar estado en tarjeta de Lista (PENDING_DELETION badge).

**Comandos de validación:**
```bash
cd src/frontend
npx tsc --noEmit
npm run build
```

**Respuesta requerida:**
```
ESTADO: completado
VALIDACIÓN: tsc limpio, build OK
RIESGOS: [si hay dependencias no cumplidas]
```

---

### Orden Fase 5 — QA final

**Agente:** `GS QA Verifier`

**Archivos autorizados (solo lectura/ejecución):**
- Todos los archivos modificados en Fases 1-4.
- `src/backend/src/modules/listas/listas.service.spec.ts`
- `src/backend/src/modules/products/products.service.spec.ts`
- `src/backend/src/modules/prices/prices.service.spec.ts`
- `src/backend/src/modules/assignments/assignments.service.spec.ts`
- `src/backend/src/modules/audit/audit.service.spec.ts` (si existe)
- `src/backend/src/modules/users/users.service.spec.ts`

**Modificaciones permitidas:** ninguna en código de aplicación.

**Validación permitida:**
```bash
cd src/backend
npx eslint "src/**/*.ts"
npx tsc --noEmit
npm run build
npx jest --coverage --verbose --silent=false
cd src/frontend
npx eslint .
npx tsc --noEmit
npm run build
git diff --check
```

**Criterios de aceptación:**
- Backend: 0 errores tsc, build OK, todos los tests existentes pasan
- Frontend: 0 errores tsc, build OK, 0 errores eslint
- No hay whitespace errors nuevos en git diff --check
- Cobertura de código no decrece en los módulos modificados
- No hay secretos ni credenciales en el diff
- No se ejecutaron migraciones, commits, pushes ni deploys

**Respuesta requerida:**
```
ESTADO: completado | bloqueado
RESUMEN: [tests pasaron/fallaron, build OK/error]
REGRESIONES: [lista de cualquier regresión detectada]
COBERTURA: [porcentaje]
RECOMENDACIÓN: [aprobar/rechazar/bloquear]
NO SE MODIFICÓ NINGÚN ARCHIVO.
```

---

*Fin del plan. Ninguna migración, commit, push o deploy fue ejecutado. Los cambios propuestos en schema son documentación, no implementación.*