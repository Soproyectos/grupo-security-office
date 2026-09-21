# Reporte de ejecución — Incremento 1 (2026-08-14)

**Incremento:** 1 — Gestión de Listas, ACL por Lista y deny-by-default.
**Agente:** comercial-dev
**Modo:** ejecución supervisada (plan aprobado Fase 1A → Fase 1B implementada).
**Fecha:** 2026-08-14.

---

## 1. Ambiente detectado y clasificación
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/grupo_security?schema=public`
- Host: `localhost` → **LOCAL**.
- **LOCAL** → autorizado para aplicar migraciones/backfill (regla de ambiente). En este incremento **no se aplicaron migraciones ni backfill** (el esquema Incremento 0 ya está aplicado y validado). Solo se añadió código aplicación.

## 2. Fases completadas
- **Fase 1A — Análisis y plan:** COMPLETADA (inspección DB, usuarios/roles/assignments, puntos de acceso abierto, matriz ACL, T1–T20, decisiones). Plan documentado en `.kilo/context/plan-incremento-1-acl.md`.
- **Fase 1B — Implementación:** COMPLETADA (backend listas + ACL centralizado + assignments LISTA + deny-by-default en Products/Prices + frontend rutas/páginas + tests).

## 3. Archivos modificados (cambios funcionales del Incremento 1)

**Backend — nuevo módulo Listas + ACL:**
- `src/backend/src/common/acl/acl.service.ts` — **NUEVO** (`LEVEL_RANK`, `levelsAtLeast`, `getAllowedListaIds`, `getUserLevel`, `assertListaAccess`, `assertProductAccess`, `assertPriceAccess`, `can`).
- `src/backend/src/common/acl/acl.module.ts` — **NUEVO** (exporta AclService; importa PrismaModule).
- `src/backend/src/modules/listas/listas.module.ts`, `listas.controller.ts`, `listas.service.ts` — **NUEVO**.
- `src/backend/src/modules/listas/dto/create-lista.dto.ts`, `dto/update-lista.dto.ts` — **NUEVO**.

**Backend — integración ACL en módulos existentes:**
- `src/backend/src/modules/assignments/assignments.service.ts` — `LISTA` en `validateResource`; `findAll/create/update/remove` reciben `ctx` opcional; `authorizeAssignmentMutation` (Super Admin / Admin Comercial manage-scoped para LISTA; legacy Super Admin-only).
- `src/backend/src/modules/assignments/assignments.controller.ts` — pasa `@CurrentUser` a service; `@Roles('Super Admin','Admin Comercial')` en CRUD.
- `src/backend/src/modules/assignments/assignments.module.ts` — importa `AclModule`.
- `src/backend/src/modules/assignments/dto/create-assignment.dto.ts` — `LISTA` agregado a `ASSIGNMENT_RESOURCE_TYPES`.
- `src/backend/src/modules/products/products.service.ts` — `AclService` inyectado; `findAll/findOne/create/update/toggleVisibility/toggleActive` aceptan `ctx` (deny-by-default en reads; `edit` en create/update/toggleActive; `manage` en toggleVisibility).
- `src/backend/src/modules/products/products.controller.ts` — pasa `@CurrentUser`; importa `Currentuser`/`AccessContext`.
- `src/backend/src/modules/products/products.module.ts` — importa `AclModule`.
- `src/backend/src/modules/prices/prices.service.ts` — `AclService` inyectado; `findOnePriceList/findPricesByProduct/findPricesByPriceList/createPrice/updatePrice` aceptan `ctx` (deny-by-default en reads; `edit` en writes).
- `src/backend/src/modules/prices/prices.controller.ts` — pasa `@CurrentUser`.
- `src/backend/src/modules/prices/prices.module.ts` — importa `AclModule`.
- `src/backend/src/app.module.ts` — registra `ListasModule` y `AclModule` (import AclModule en ListasModule).

**Backend — tests:**
- `src/backend/src/modules/listas/listas.service.spec.ts` — **NUEVO** (T1–T20 + casos de creación/audit con AclService real).
- `src/backend/src/modules/products/products.service.spec.ts` — provee `AclService` real; + bloque ACL deny-by-default (view ve solo su Lista, no-auth 404, view no edita, view no crea).
- `src/backend/src/modules/prices/prices.service.spec.ts` — provee `AclService` real; + bloque ACL deny-by-default (view ve precios de su Lista, no-auth 404, view no crea precio, Super Admin sin scope).
- `src/backend/src/modules/assignments/assignments.service.spec.ts` — + mock `AclService` en provider.

**Frontend — Listas:**
- `src/frontend/src/services/listas.service.ts` — **NUEVO** (cliente API Lista + sub-recursos).
- `src/frontend/src/pages/ListasPage.tsx` — **NUEVO** (lista, filtros, acciones, empty state, modal crear/editar).
- `src/frontend/src/pages/ListaDetailPage.tsx` — **NUEVO** (pestañas Productos/Precios/Accesos/Auditoría).
- `src/frontend/src/lib/rbac.ts` — `canCreateLista`/`canManageListas`/`canViewListas`.
- `src/frontend/src/services/assignments.service.ts` — `LISTA` agregado a `ASSIGNMENT_RESOURCE_TYPES`.
- `src/frontend/src/pages/AssignmentsPage.tsx` — `RESOURCE_TYPE_LABELS` incluye `LISTA`.
- `src/frontend/src/components/layout/CommercialLayout.tsx` — tab "Listas" (`/commercial/lists`).
- `src/frontend/src/App.tsx` — rutas `/commercial/lists` y `/commercial/lists/:id`.

**Documentación (.kilo):** `backlog-activo.md` (actualizado), `decisiones.md` (decisiones Incremento 1 agregadas), `reporte-incremento-1.md` (este archivo).

## 4. Matriz ACL implementada (backend, `AclService`)
- **Super Admin** → `null` (sin filtro: ve todo, incluye Listas inactivas/archivadas).
- **Usuario autenticado** → `getAllowedListaIds(userId, roles, level)` = `resourceId[]` de assignments `LISTA` activos con `level` >= solicitado.
- **Niveles:** `view` < `edit` < `manage` (rank 0/1/2). Nivel superior implica inferiores.
- **deny-by-default:** sin assignment activo → 404 (oculta existencia) en findOne; `[]` en findMany.
- **Assignment inactivo** → tratado como inexistente.
- **Lista inactiva (`isActive=false`) o archivada (`archivedAt<>null`)** → 404 para no-admin.
- **Listas:** list/view → `view` (Super Admin ve incluso inactivas); create → Super Admin; update/toggleActive → `edit`; archive/restore → `manage`; assignments/audit → `manage`.
- **Productos:** reads → `view` sobre la Lista del producto; create/update/toggleActive → `edit`; toggleVisibility → `manage`.
- **Precios:** reads → `view` sobre la Lista del producto; create/update → `edit`.
- **Assignments (gestión):** LISTA → Super Admin o Admin Comercial con `manage` sobre la Lista (scope); tipos legacy (CATALOG/PRICE_LIST/CATEGORY) → Super Admin exclusivamente. `findAll` no-admin → solo assignments LISTA bajo su `manage`.

## 5. Usuarios y accesos validados (LOCAL, datos reales)
- **Super Admin** (`admin@`, `soportepereira2@`): acceso total por rol — ve/listas/gestiona todo sin assignment. Validado T1/T2.
- **Pepito** (`pepito@`, Operador): assignment `view` sobre `LISTA-GENERAL` → ve únicamente `LISTA-GENERAL` y sus productos/precios; NO puede crear/editar/archivar ni gestionar accesos. Preservado. Validado T5/T6/T7/T8.
- **Admin Comercial** (no existe usuario real): soportado en controladores y service con autorización inline; `manage` sobre Listas validado con **fixtures de test** (EDITER/MANAGER). Validado T9/T11/T12/T13.
- Usuario sin assignment (`none-1` fixture) → 404/lista vacía en Listas/Productos/Precios, incluso por ID. Validado T3/T4/T19/T20.
- Assignment inactivo / Lista inactiva / Lista archivada → deny. Validado T16/T17/T18.

## 6. Pruebas ejecutadas y resultados
- `npx prisma format` → OK (esquema formateado).
- `npx prisma validate` → "The schema at prisma/schema.prisma is valid 🚀".
- `npx prisma generate` → **rechazado en este entorno** (EPERM en `query_engine-windows.dll.node` por proceso dev local; el cliente ya está regenerado con el esquema Incremento 0). No se re-generó (no hubo cambio de esquema).
- `npx tsc --noEmit` (backend) → **limpio (0 errores)**.
- `npm run build` (backend, `nest build`) → **OK**.
- `npx jest` (backend) → **272/272 pass** (18 suites). Nuevas: listas.service.spec (19 tests T1–T20 + creación/audit), products.service.spec (+6 ACL), prices.service.spec (+5 ACL).
- Frontend `npx tsc --noEmit` → **limpio**.
- `npm run build` (frontend, `tsc -b && vite build`) → **OK** (201 módulos transformados).
- `npx eslint` (frontend) → **no ejecutable** en este entorno: ESLint 9.39.5 sin `eslint.config.*` (proyecto usa config legacy `.eslintrc` incompatible). No se instaló nada. (Análogo a backend: ESLint no instalado.)
- `prisma migrate status` → "Database schema is up to date" (6/6 migraciones; la nueva de Incremento 0 ya aplicada en LOCAL en execución previa).

## 7. Riesgos / limitaciones pendientes
- **deny-by-default sobre el metadato legacy `Catalog`:** la vista Catálogos `/commercial/catalogs` se mantiene como legado default-open (Catalog no se asocia a Lista en DB). Las lecturas de Productos/Precios están protegidas por `listaId` aunque provengan de la vista Catálogos (ProductsService.findAll scopia por Lista). Ver decisión D-1-cat-legacy-scope.
- **`Assignment` XOR `userId`/`roleId` a nivel DB:** pendiente Fase A2 (CHECK/índice coalescente). No se implementó (regla 13).
- **`PermissionsGuard` sigue NO registrado** en `app.module`; la autorización granular se implementa vía `AclService` + `@Roles` (no se alteró la política global).
- **Creación de assignments `LISTA` desde UI:** el formulario global de Asignaciones mantiene selector CATALOG-only (legacy); la creación LISTA se expone vía API para Admin Comercial. Extensión de UI diferida.
- **Precios: solapamiento de vigencias** no bloqueado a nivel DB (única DB es `Price @@unique([productId, priceListId])`); la validación `value≥0` y `validFrom≤validUntil` sí aplica (Fase C).
- **`PriceList` (tier) vs `Lista`:** PriceList se mantiene como metadato de tarifa; no se reconcilia con Lista (decisión 4/8). Pending D-1-precio-tier.
- El working tree contiene reestructuras frontend preexistentes no atribuibles a este incremento (p.ej. páginas eliminadas `BrandsPage`/`CategoriesPage`/`PricesPage`); no fueron tocadas.

## 8. Funcionalidades diferidas (NO implementadas en este incremento)
- Permisos por rol en Assignment (`roleId` XOR) — Fase A2.
- Excepciones por Producto — futura.
- PriceHistory / historial de precios.
- Importación masiva por Lista (reactivación `ImportModule`).
- Publicación programada.
- Proveedores, stock, solicitudes y órdenes de compra.
- Borrado físico de Listas (se usa archivo lógico).
- Retiro físico de `Catalog`/`PriceList` (legacy preservado).
- Confirmación de precios y excepciones por producto (Incrementos 5-8).

## 9. Confirmación
- **No se tocó producción.** Todas las operaciones fueron contra `localhost:5432` (LOCAL).
- **No se modificaron migraciones ni el modelo Prisma.** Solo código aplicación + tests. `prisma format` no alteró el esquema (sin cambios de modelo).
- **No se modificaron secretos, `.env` ni credenciales.** `.env` solo lectura.
- **No se hicieron deploy ni commits.** Working tree con cambios sin commitear.
- **No se realizaron `migrate reset`, `db push`, `DELETE`, `TRUNCATE`, `DROP` ni eliminación de datos.**
- **No se eliminaron** estructuras antiguas (`Catalog`, `PriceList`, `catalogId`, `priceListId` preservados).
- No se implementó nada fuera del incremento activo (1, 2, 3, 4, 5, 6, 7 u 8).
