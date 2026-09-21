# Plan — Incremento 1: Gestión de Listas, ACL por Lista y deny-by-default

**Estado:** Fase 1A — Análisis y plan (SIN cambios de código).
**Agente:** comercial-dev
**Ambiente objetivo de implementación:** LOCAL (`DATABASE_URL=...localhost:5432/...`).
**Base de inspección:** `schema.prisma`, migraciones, backfill, módulos backend (Catalog/Product/Price/PriceList/Assignment/Role/User/Audit), guards/DTOs/tests, y frontend (App/CatalogsPage/Assignments/Commercial).

---

## 1. Inspección de estado actual (LOCAL)

### 1.1 Entidad Lista
- `listas` existe (migración `20260814171500_lista_entidad_raiz`, aplicada en LOCAL).
- 1 fila: `LISTA-GENERAL` / `Lista General` / `COP` / `isActive=true`.

### 1.2 Usuarios, roles y memberships
| Usuario | Email | Rol | Assignment LISTA? |
|---|---|---|---|
| 68394ab3 | admin@gruposecurity.co | Super Admin | NO (bypass implícito) |
| 16209879 | soportepereira2@gruposecurity.co | Super Admin | NO (bypass implícito) |
| 2870b200 | pepito@gruposecurity.co | Operador | **SÍ** — LISTA-GENERAL, `level=view`, `isActive=true` |

- Roles sembrados: `Super Admin`, `Supervisor`, `Admin Comercial`, `Operador`, `Consulta`.
- **No existe usuario con rol `Admin Comercial`** en este ambiente.
- **No existen assignments de tipo `CATALOG`** (el backfill los migró a `LISTA`). Assignments actuales: 1 (LISTA, pepito, view, activo).
- `roleId` en `Assignment` es NULL para todos (assignments actuales son por usuario). El XOR user/role aún no se impone a nivel app (ver limitación §9).

### 1.3 Lectura de productos y precios (puntos de acceso abierto)
- `CatalogsService.buildAclWhere` / `assertCatalogAccess` → usan `resourceType='CATALOG'` (legacy) y son **default-open**: usuario sin assignments CATALOG ve TODO. ← punto 1 a migrar a LISTA + deny-by-default.
- `ProductsService.findAll/findOne` → **sin ACL** (solo `@Roles(...)`). Cualquier Operador/Consulta lee TODO. ← punto 2.
- `PricesService.findPricesByProduct / findPricesByPriceList / findAllPriceLists` → **sin ACL**. ← punto 3.
- `AssignmentsController` CRUD → `@Roles('Super Admin')` exclusivamente; `validateResource` no soporta `LISTA` (así como `ASSIGNMENT_RESOURCE_TYPES` no incluye `LISTA`). ← punto 4.
- `PermissionsGuard` está **definido pero no registrado** en `app.module.ts` (solo `RolesGuard` activo). Los permisos granulares del seed no se consumen. Se mantiene así (fuera de alcance).

### 1.4 JWT / AuthN
- `JwtAuthGuard` global salta `@Public()`. `JwtStrategy.validate` rechaza usuarios inactivos (`isActive=false`). Claims: `{ sub, email, name, roles, permissions }`.
- `@CurrentUser()` expone `user.sub` (userId) y `user.roles` (string[]).

---

## 2. Usuarios legítimos y asignaciones mínimas (decision 11)

**Conclusión: no se requieren asignaciones nuevas para activar deny-by-default sin bloquear usuarios legítimos.**

- `Super Admin` (admin@, soportepereira2@): acceso total por bypass de rol → **no necesita assignment**. Verificado seguro bajo deny-by-default.
- `Operador` (pepito@): tiene assignment **LISTA-GENERAL / view / activo** → bajo deny-by-default verá LISTA-GENERAL y su productos/precios. **Preservado.**
- `Admin Comercial`: no hay usuario con este rol en DB → la ruta `manage` se valida con **fixtures de test** (no se crea usuario/assignment real). No se otorga ningún assignment `manage` a pepito (que es Operador) — evita escalamiento.
- `Supervisor`/`Consulta`: no hay usuarios con estos roles activos en DB.

**Plan de mínimas (no ejecuta, documenta):** mantener el assignment existente de pepito (view/LISTA-GENERAL). No crear assignments nuevos en datos reales. Los fixtures de test crearán assignments `edit`/`manage` para validar niveles.

**Condición de detención (decision 11) NO disparada:** se pudieron identificar y asegurar los usuarios legítimos actuales.

---

## 3. Matriz ACL (backend)

Resolución de acceso a Listas (y recursos dependientes) para NO Super Admin:
- `getAllowedListaIds(userId, roles, level)`: conjunto de `resourceId` donde existe `Assignment(resourceType='LISTA', userId, isActive=true)` con `level` >= nivel solicitado.
- Orden de niveles: `view=0 < edit=1 < manage=2`. Un assignment de nivel superior implica los inferiores.
- `Super Admin` → `null` (sin filtro: ve todo).
- `deny-by-default`: si no Super Admin y el conjunto está vacío → **negar** (lista vacía / 404).

### 3.1 Niveles por recurso y operación

| Operación | Rol mínimo implícito | Assignment LISTA requerido |
|---|---|---|
| Ver Listas (list) | cualquiera autenticado | `view` (cualquier nivel) sobre la Lista |
| Ver Lista (findOne/:id) | cualquiera autenticado | `view`+ sobre la Lista (404 si no) |
| Ver productos de una Lista | cualquiera autenticado | `view`+ sobre la Lista |
| Ver precios de un producto | cualquiera autenticado | `view`+ sobre la Lista del producto |
| Crear Lista | — | **Super Admin** (role) |
| Editar Lista (name/code/desc/currency/isActive) | — | `edit`+ sobre la Lista (Admin Comercial con manage también) |
| Activar/desactivar Lista | — | `edit`+ sobre la Lista |
| Archivar/restaurar Lista | — | `manage` sobre la Lista |
| Gestionar assignments LISTA (create/update/delete) | — | `manage` sobre la Lista (o Super Admin) |
| Crear/editar producto (dentro de Lista) | Admin Comercial/Super Admin | `edit`+ sobre la Lista del producto |
| Crear/editar precio | Admin Comercial/Super Admin | `edit`+ sobre la Lista del producto |
| Publicar (isVisible) / toggleActive producto | Admin Comercial/Super Admin | `manage` sobre la Lista del producto |

### 3.2 Resolución de role vs assignment (Admin Comercial)
- `Admin Comercial` puede **crear productos/precios** solo dentro de Listas donde tenga `edit` o `manage`.
- `Admin Comercial` puede **gestionar (state + assignments) Listas** solo donde tenga `manage`.
- `Admin Comercial` NO puede crear Listas (solo Super Admin). ← decisión documentada D-1-crea-lista.
- No se habilita assignment por `roleId` (XOR no implementado). Los assignments siguen por usuario. Documentado como limitación D-1-asig-por-rol.

---

## 4. Matriz de pruebas de acceso (objetivo)

| # | Caso | Expectativa |
|---|---|---|
| T1 | Super Admin sin assignment → lista Listas | ve todas (bypass) |
| T2 | Super Admin → findOne Lista → producto → precio | 200 |
| T3 | Usuario no Super Admin sin assignment → lista Listas | `[]` (deny) |
| T4 | Usuario no Super Admin sin assignment → findOne LISTA-GENERAL | 404 |
| T5 | Usuario `view` (pepito) sobre LISTA-GENERAL → lista productos/precios | 200, solo LISTA-GENERAL |
| T6 | Usuario `view` → findOne Producto de LISTA-GENERAL | 200 |
| T7 | Usuario `view` → intento de crear Lista | 403 |
| T8 | Usuario `view` → intento de editar Lista | 403 |
| T9 | Usuario `edit` → puede editar Lista asignada | 200 |
| T10 | Usuario `edit` → puede editar producto de Lista asignada | 200 |
| T11 | Usuario `edit` → intento de archivar Lista | 403 |
| T12 | Usuario `manage` → archive/restore Lista | 200 |
| T13 | Usuario `manage` → gestionar assignment LISTA | 200 |
| T14 | Usuario `manage` → intento sobre Lista NO asignada | 404 |
| T15 | Usuario desactivado (`isActive=false`) | 401 (rechazado por JwtStrategy) |
| T16 | Assignment inactivo (`isActive=false`) | tratado como inexistente (deny) |
| T17 | Lista inactiva (`isActive=false`) para no-admin | 404 / no aparece |
| T18 | Lista archivada (`archivedAt<>null`) para no-admin | 404 / no aparece |
| T19 | Id directo de Producto cuyo Lista no está asignada | 404 (no salta ACL) |
| T20 | Id directo de Precio cuyo producto → Lista no asignada | 404 |

---

## 5. Fase 1B — Implementación (plan de archivos)

### 5.1 Backend (nuevo módulo Listas + refuerzo ACL)
- **Nuevo:** `src/backend/src/modules/listas/` (`listas.module.ts`, `listas.controller.ts`, `listas.service.ts`, `dto/create-lista.dto.ts`, `dto/update-lista.dto.ts`, `listas.service.spec.ts`).
- **DTOs:** `create-lista.dto.ts` (name, code@unique, description?, currency@COP/USD/EUR, isActive?); `update-lista.dto.ts` (parcial + archivedAt? para archive/restore).
- **Servicio:** 
  - `findAll(userId,roles)` / `findOne(id,userId,roles)` con `getAllowedListaIds` deny-by-default.
  - `create` → Super Admin; `update` (incluye activate/desactivate) → `edit+`/manage; `archive`/`restore` → `manage`.
  - `productCount` vía `_count`.
  - Auditoría: `AuditService.log` en create/update/archive/restore/toggle.
- **ACL compartido:** factorrar `getAllowedListaIds` + `assertListaAccess` como método privado de `ListasService` (o `AssignmentsService.resolveUserListaIds`). Se reutiliza desde Products/Prices/Assignments.
- **Assignment:** 
  - `dto/create-assignment.dto.ts`: añadir `'LISTA'` a `ASSIGNMENT_RESOURCE_TYPES`.
  - `assignments.service.ts`: en `validateResource` añadir rama `LISTA` (valida existencia en `listas`); en `create/update/remove` añadir autorización inline: permite `LISTA` solo si `userId` tiene `manage` sobre `resourceId` (o Super Admin); mantiene `@Roles('Super Admin')` en controller para tipos legacy y lista el scope LISTA al Admin Comercial con manage. Controller pasa `@CurrentUser()` al service para la verificación inline (NO cambia RolesGuard global → respeta criterio de no cambios globales de permisos).
- **Products:** `ProductsService.findAll/findOne` reciben `(userId,roles)`; se añade filtro `listaId: { in: allowedListas }` (o `null` deny si no Super Admin y sin assignments → `[]`). `create/update/toggle/publish` verifican `edit`/`manage` sobre la Lista del producto. Controller pasa `@CurrentUser()`.
- **Prices:** `findPricesByProduct` verifica que el producto pertenezca a una Lista en `allowedListas(view)`. `createPrice/updatePrice` verifican `edit`/`manage` sobre la Lista del producto.
- **Catalogs:** `buildAclWhere`/`assertCatalogAccess` migrados a LISTA (resourceType='LISTA') + deny-by-default; se mantiene compatibilidad leyendo `Product.catalogId` para fallback transitorio. (Se preserva Catalog como legado.)

### 5.2 Frontend (lista de Listas + detalle)
- **Rutas `App.tsx`:** `/commercial/catalogs` → alias `/commercial/listas`; `/commercial/catalogs/:id` → `/commercial/listas/:listaId`. Mantener redirects por compat.
- **Nueva página:** `src/frontend/src/pages/ListasPage.tsx` (lista, búsqueda, filtro estado, productCount, updatedAt, acciones por nivel, empty state).
- **Nueva página:** `src/frontend/src/pages/ListaDetailPage.tsx` (pestañas: Productos, Precios, Accesos, Auditoría).
- **Formulario:** `ListasFormModal` (name, code, description, currency, estado).
- **Cliente API:** `src/frontend/src/services/listas.service.ts` (CRUD + archive/restore + lista-scoped products/prices).
- **Tipos:** `Lista` en `src/frontend/src/types/index.ts`; `Assignment.resourceType` extiende a `LISTA`.
- **RBAC:** `lib/rbac.ts` + helpers `canViewLista(level)`, `canEditLista(level)`, `canManageLista(level)`; ocultar controles según nivel.

### 5.3 Tests
- `listas.service.spec.ts`: T1–T20 vía mock de Prisma (`createPrismaMock` extendido con bloque `lista`).
- Extender `products.service.spec.ts`, `prices.service.spec.ts`, `assignments.service.spec.ts` con cases T5–T13.
- Mock compartido: añadir `prisma.lista.findMany/findUnique/count` + `assignment.findMany` filtrables a `createPrismaMock`.

---

## 6. Riesgos y criterios de detención

| Riesgo | Mitigación / Detención |
|---|---|
| Cambio de comportamiento denegado→abierto en Catálogos/Productos/Precios | Implementar deny-by-default SOBRE todo el flujo; tests T3–T8/T19–T20 bloquean regresión. |
| Admin Comercial sin assignment real → no se puede validar manage en vivo | Se valida con fixtures; si surge duda, detener (criteria 4/2). |
| Assignment por rol (`roleId`) sin XOR | NO habilitar; documentar limitación D-1-asig-por-rol. |
| Escalamiento: pepito (Operador) gana manage | No modificar su assignment; tests T11/T13 fallan si se permite. |
| Alteración de API pública existente (Products/Prices/Catalogs endpoints) | Los endpoints existentes conservan shape; se añaden filtros de scope. Se documenta como behavior-change de la matriz 3.1. |
| Necesidad de borrar Catalog/PriceList/fields | NO — se preservan como legado. Si surge, detener (criteria 5). |
| Fallan tests de código modificado | Detener y documentar (criteria 6). |

---

## 7. Decisiones propuestas (para registro en `decisiones.md`)

- **D-1-crea-lista:** crear Lista es exclusivo de `Super Admin` (Admin Comercial administra state+assignments de Listas que gestiona, no crea nuevas).
- **D-1-asig-por-rol:** en Incremento 1 las assignments siguen por `userId`; el soporte `roleId` (XOR) queda diferido hasta que se imponga a nivel DB/app.
- **D-1-deny-activado:** deny-by-default se activa tras garantizar assignments mínimos (§2) y validar T1–T20.
- **D-1-cat-legacy:** `Catalog` se mantiene como legado (read dual) hasta Fase D; bajo deny-by-default las lecturas legadas de `catalogId` se scopean a la Lista equivalente.
- **D-1-product-write:** crear/editar/visibilizar producto exige `edit`/`manage` sobre la Lista del producto (behavior change, matriz 3.1).

---

## 8. Confirmaciones de entorno
- LOCAL (`localhost:5432`) → autorizado para aplicar migraciones/backfill (regla de ambiente).
- No se ejecutarán: `db push`, `migrate reset`, `DELETE/TRUNCATE/DROP` destructivos, despliegues ni commits, en Fase 1A.
- No se tocarán secretos, `.env` ni credenciales.

---

## 9. Próximos pasos
1. Aprobación del plan (§3 matriz ACL, §5 alcance, §7 decisiones).
2. Fase 1B: implementación backend → tests → build → lint.
3. Fase 1B: implementación frontend → build/lint.
4. Re-ejecución full `jest` + `nest build` + `tsc --noEmit` + frontend `build`.
5. Si todos los tests de ACL pasan (T1–T20) → activar deny-by-default en runtime.
