# Análisis técnico — Incremento 0

**Estado:** Análisis (sin cambios de código, migraciones ni ejecución de build/tests).
**Fecha:** 2026-08-14
**Responsable:** comercial-dev
**Base de inspección:** rama de trabajo actual en `C:\Users\sopor\grupo-security-office`

---

## 1. Resumen ejecutivo

El módulo comercial existe parcialmente implementado como un monolito NestJS + Prisma + PostgreSQL (backend) y una SPA React/Vite (frontend). Las funcionalidades cubiertas hoy son: usuarios/roles, catálogo general de productos, categorías, marcas, listas de precios, precios con vigencia, asignaciones (ACL) y auditoría básica; más un pipeline de importación Excel/CSV construido pero **no activado**.

El punto central del incremento es hacer de **"Lista" la entidad raíz** del flujo producto → precio → permisos. Hoy **no existe ninguna entidad "Lista"**: el rol de raíz recae en dos entidades distintas y sin unificar:

- **Catalog** (catálogo general): contenedor actual de `Product` (`product.catalogId`, obligatorio). Tiene ACL (`Assignment resourceType = CATALOG`).
- **PriceList** (lista de precios): contenedor actual de `Price` (`price.priceListId`). Tiene ACL (`Assignment resourceType = PRICE_LIST`), pero **el nivel de permiso (view/edit/manage) no se usa para restringir lecturas ni la gestión de precios está nivelada por lista**.

Además, la documentación funcional (`docs/data-model.md`, `docs/data-model-v1.md`, `docs/mvp-scope-v1.md`) describe un modelo (`isDefault`, `CAT-DEFAULT`, `Product.status` enum, `Assignment.roleId/permissionLevel`) que **se desvía de `schema.prisma`** — el código real es la fuente de verdad usada en este análisis.

## 2. Alcance de esta inspección (qué sí / qué no)

**Sí inspeccionado (lectura directa):**
- Reglas/contexto: `.kilo/rules/00..02`, `backlog-activo.md`, `decisiones.md`, `CLAUDE.md`, `kilo.jsonc`, `.kilo/agents/comercial-dev.md`, `.env.example`.
- Backend: `schema.prisma`, las 4 migraciones en `prisma/migrations/*/*.sql`, `main.ts`, `app.module.ts`, todos los `*service.ts`/`*controller.ts`/`*module.ts` de: auth, users, roles, permissions, assignments, catalog, categories, brands, products, prices, import( import.module/service/controller/interfaces ), audit, health.
- DTOs: create/update product, price-input, create/update price-list, create/update catalog, create-assignment, update-assignment, create-user, update-user, login.
- Decoradores/guards: `roles.decorator.ts`, `permissions.decorator.ts`, `current-user.decorator.ts`, `public.decorator.ts`, `jwt-auth.guard.ts`, `roles.guard.ts`, `permissions.guard.ts`.
- Seed completo (`prisma/seed.ts`).
- Frontend: `App.tsx`, rutas, `CatalogsPage`, `ProductsPage`, `ProductDetailPage`, `CommercialSettingsPage`, `CommercialLayout`, `Header.tsx`, services (api, catalogs, assignments, users, dashboard, trending), hooks (`useProducts`, `useProductMutations`, `usePriceLists`), `types`, `auth.store`, `lib/rbac`, `lib/roles`.
- Docs: `data-model.md`, `data-model-v1.md`, `mvp-scope-v1.md`.

**No inspeccionado en profundidad (fuera del alcance de Incremento 0 y no modificado):**
- Implementaciones internas de `prices.service.ts`/`products.service.ts` más allá de lo leído, `categories.service.ts`, `brands.service.ts`, `audit.service.ts`, los adapters de importación, y el resto del frontend (`CommercialSettingsPage`, `useProducts` paginado, etc.). Se usó evidencia directa de los archivos críticos; el resto se sintetiza a partir de `schema.prisma` y `app.module.ts` (que define qué está registrado).

## 3. Arquitectura y stack

| Capa | Tecnología | Observaciones |
|---|---|---|
| Backend | **NestJS 10** + TypeScript (CommonJS). `tsconfig` **no es strict** (`strictNullChecks:false`, `noImplicitAny:false`). | ESLint configurable. Throttler global (20 req/60s default). Helmet + cookie-parser. |
| ORM | **Prisma 5.20** (cliente JS). | `prisma generate/migrate/seed/studio` como scripts `db:*`. |
| DB | **PostgreSQL** (`DATABASE_URL` en `.env`). | Migrations en `prisma/migrations/`. |
| Frontend | **React 18** + **Vite 6** + **TS estricto** (`strict:true`, `noUncheckedIndexedAccess:true`, `noUnusedLocals/Parameters:true`) + **Tailwind 3** + **TanStack Query** + **Zustand** + **Axios**. | `tsconfig` frontend SÍ es strict; backend no. Inequidad de calidad. |
| Auth | **JWT** (`@nestjs/jwt`) en **cookie HttpOnly** (`access_token`, 8h, `secure` en prod, `sameSite:lax`). También acepta `Authorization: Bearer`. | `bcrypt` (salt 10 usuarios, salt 12 seed admin). Passport `passport-jwt`. |

**Comandos (npm workspaces = dos proyectos independientes):**
- Backend (`src/backend`): `npm run dev` (nest start --watch), `npm run build`, `npm run lint`, `npm test` (Jest/ts-jest), `npm run db:migrate/dev`, `db:seed`, `db:studio`.
- Frontend (`src/frontend`): `npm run dev` (vite 5173, proxy `/api`→`localhost:3000`), `npm run build` (tsc + vite), `npm run lint`. **Sin suite de tests** (no jest/vitest). El frontend `App.tsx` define rutas `/commercial/products`, `/catalogs`, `/assignments`, `/settings`.

> Nota de proceso: por la restricción de este incremento, **no se ejecutaron** `npm test`, `npm run build` ni `npm run lint`. Se verifican en el incremento de implementación. La cobertura declarada en `CLAUDE.md` (235 tests) corresponde a 18 archivos `*.spec.ts` en `src/backend/src` (jest.config `testRegex: .*\.spec\.ts$`); el frontend no tiene tests.

## 4. Modelo de datos actual (fuente de verdad: `schema.prisma`)

Relaciones principales:

```
Catalog 1—N Product  (product.catalogId, obligatorio, @@index)
Product 1—N Price    (price.productId)
PriceList 1—N Price  (price.priceListId)
Price  @@unique([productId, priceListId])   → un solo precio por (producto, lista)
```

**Entidades y constraints exactos (schema.prisma):**

| Modelo | Campos clave | Constraints relevantes |
|---|---|---|
| `User` | id(uuid), email(@unique), name, password, isActive(true), createdAt, updatedAt | → `@@map("users")` |
| `UserRole` | userId, roleId | PK compuesta `(userId,roleId)` |
| `Role` | id, name(@unique), description, permissions[], users[] | 5 roles sembrados (ver §7) |
| `RolePermission` | roleId, permission | PK `(roleId,permission)` |
| `Catalog` | id(uuid), name, **code(@unique)**, description, isActive(true), products[] | NO `isDefault` (los docs sí lo mencionan → drift) |
| `Product` | id, **sku(@unique)**, name, description, **categoryId**(req), **brandId**(req), **catalogId**(req), technicalSpecs(Json?), extraAttributes(Json?), isActive(false), isVisible(false), prices[], images[], auditLogs[] | sku único **global** (no por catálogo); isActive/isVisible sustituyen al enum `status` de los docs |
| `Category` | id, name, slug(@unique), description, parentId(?), parent/children (tree), products[], isActive(true) | jerarquía self-ref `CategoryTree` |
| `Brand` | id, name(@unique), slug(@unique), logo, description, website, isActive(true) | |
| `ProductImage` | id, productId, url, alt?, isPrimary(false), sortOrder(0) | |
| `PriceList` | id, name, **code(@unique)**, currency(COP), isActive(true), validFrom?, validUntil?, prices[] | NO `isDefault` (drift con docs) |
| `Price` | id, productId, priceListId, **value(Decimal 12,2)**, currency(COP), validFrom?, validUntil? | `@@unique([productId,priceListId])`. **No unique por vigencia** → solapamiento no bloqueado a nivel DB |
| `Assignment` | id, userId, **resourceType(String)**, **resourceId(String)**, **level(String, default 'view')**, isActive(true) | `@@unique([userId,resourceType,resourceId])`; levels: `view|edit|manage`; resourceTypes: `CATALOG|PRICE_LIST|CATEGORY`. **No `roleId`/`permissionLevel`** (los docs sí → drift) |
| `AuditLog` | id, userId?, productId?, action, entity, entityId, oldValues, newValues, ipAddress, userAgent | PK→User, FK→Product |
| `ImportMapping` | id, name, mappings(Json), userId, isDefault(false) | |

**Migraciones (4, históricas — ruta `src/backend/prisma/migrations/`):**
1. `20260805120000_init` — tablas base (users, roles, user_roles, role_permissions, categories, brands, products, catalogs, price_lists, prices, audit_logs). *(No leído aún; se asume por schema.)*
2. `20260805121500_import_mapping` — tabla `import_mappings`.
3. `20260805120000_catalogs_y_catalog_id` — crea `catalogs` y añade `catalogId` FK a `products`.
4. `20260806100000_extra_attributes` — `technicalSpecs`/`extraAttributes` Json, `isVisible`, índices.
5. `20260805153529_assignments_acl` — tabla `assignments` (level default 'view', UNIQUE(userId,resourceType,resourceId), FK userId).

Orden cronológico exacto de timestamps no es monótono (2↔3) → no afecta el analysis.

## 5. Autenticación y autorización (AuthN/AuthZ)

**AuthN (login):** `AuthController.login` → `AuthService.validateUser` (bcrypt compare) → firma JWT con claims `{ sub, email, name, roles[], permissions[] }` → cookie `access_token` HttpOnly. `JwtStrategy.validate` rehace lookup de `User` por `sub` y verifica `isActive`.

**AuthZ — dos capas:**
1. **Global Auth guard:** `APP_GUARD → JwtAuthGuard` (en `app.module.ts`). Envuelve `AuthGuard('jwt')` y **salta** rutas marcadas `@Public()`. Todo lo demás exige JWT válido. `ThrottlerGuard` también global.
2. **AuthZ de roles:** `RolesGuard` (`@Roles(...)`) aplicado **por controlador** (p. ej. `AssignmentsController` usa `@UseGuards(JwtAuthGuard, RolesGuard)` y todos sus endpoints son `@Roles('Super Admin')`).

**AuthZ de permisos (ACL) — Assignments:**
- `Assignment` asocia `userId` ↔ `(resourceType, resourceId)` con un `level` (`view|edit|manage`) y `isActive`.
- Soporte de tipos de recurso: **`CATALOG`, `PRICE_LIST`, `CATEGORY`** (ver `ASSIGNMENT_RESOURCE_TYPES` en `create-assignment.dto.ts`). **No hay `LISTA`.** No hay tipo de recurso para productos ni precios.
- Lectura: `CatalogsService.buildAclWhere(userId, roles)` → `Super Admin` ve todo; usuario sin assignments de `CATALOG` ve **todo** (default abierto); usuario **con** assignments de `CATALOG` ve solo sus `resourceId`. Idéntico patrón esperado en `prices.service.ts` (no inspeccionado íntegramente).
- **Gestión de assignments:** CRUD de `AssignmentsController` está restringido a `@Roles('Super Admin')` únicamente.
- **Nivel `level` NO se usa para autorización granular:** ni la lectura ni la escritura discriminan `view|edit|manage`. Solo importa la existencia de una assignment activa (para scope de lectura) y el rol `Super Admin` (para escritura). → El nivel está definido y almacenado pero **no ejercido**.

## 6. Flujo comercial actual (y gaps vs el objetivo)

Flujo real hoy:
1. **Crear/seleccionar Catálogo** (`Catalog`). El seed **no crea ningún catálogo** → no hay `CAT-DEFAULT`; para crear un producto se necesita un catálogo previamente creado vía API/UI. (Los docs mencionan `CAT-DEFAULT` como si existiera.)
2. **Crear Producto dentro de un Catálogo** (`Product.catalogId` obligatorio). Estado vía dos bools: `isActive` (existe en BD) e `isVisible` (publicado/en catálogo público). No hay enum `status`.
3. **Registrar Precio** → `Price(productId, priceListId, value≥0, currency, validFrom≤validUntil)`. Un `PriceList` ya existe (`Lista Mayorista`/`Lista Detalle` en seed). Único precio activo por (producto, lista) por la restricción `@@unique`.
4. **Permisos** → `Assignment(CATALOG|PRICE_LIST|CATEGORY, level)`. Ver §5.
5. **Publicar** → `Product.isVisible = true` (producto activo + con catálogo).

**Gaps críticos respecto al objetivo ("Lista es la raíz; producto dentro de ella; precio asociado a producto y lista; permisos por lista"):**
- No hay entidad `Lista`. "Lista" aparece como `PriceList` (precios) y confusión con `Catalog` (productos).
- Un producto pertenece a **un solo** `Catalog`; los precios pertenecen a **una** `PriceList`. No hay una sola raíz que agrupe producto + precios + permisos.
- El ACL `level` (`view|edit|manage`) está almacenado pero **no se aplica** (ni en lectura ni escritura). Sólo valida existencia.
- La única escritura sobre prices/catalogs/assignments requiere rol `Super Admin`. Un `Admin Comercial` (que con el seed tiene permisos `products:*`, `prices:*`, `publish:manage`) **no puede crear precios ni asignaciones por la guardia `@Roles('Super Admin')`** — hay una **inconsistency role-vs-guard**: los permisos granulares (`products:write`, `prices:write`) definidos en el seed **no se consumen** en los controladores reales (que usan `@Roles('Super Admin')` y no `@Permissions(...)`). → `PermissionsGuard` está **definido pero no registrado/usado**.
- El pipeline de importación (`ImportModule`: `import.controller.ts`, `import.service.ts`, `pipeline/*`, `sources/excel-adapter`) **existe pero no está registrado en `app.module.ts`** (ver §3): no aparece en `imports`. Los endpoints `/api/products/import/*` no están activos. La auditoría se escribe allí (`batch-executor.service.ts`→`auditService.log`), lo que indica que la auditoría sí está parcialmente implementada para cargas masivas.

## 7. Estado de datos de arranque (seed.ts)

- 5 roles (nombres en español, **no constantes TS**): `Super Admin`, `Supervisor`, `Admin Comercial`, `Operador`, `Consulta`.
- Mapa de roles heredados (`Admin→Super Admin`, `Gerente→Admin Comercial`, `Operator→Operador`, `Viewer→Consulta`) con migración y borrado de legacy.
- 1 usuario admin: `admin@gruposecurity.co` / `admin123` → rol `Super Admin`.
- Permisos por rol (strings `resource:action`, p. ej. `products:read`, `publish:manage`): `Super Admin` todo + `audit:read`; `Supervisor` `products:read/publish:manage/audit:read`; `Admin Comercial` productos+preacios+publicar; `Operador`/`Consulta` solo lectura. **Pero ningún `@Permissions(...)` se menciona en los controladores inspeccionados.**
- Categorías: CCTV (hijos: Cámaras IP, NVR), Alarmas, Control de Acceso, Smart Home.
- Marcas: Hikvision, Dahua, Ajax, Honeywell.
- **Catálogos: NINGÚNO** (no hay seed de `Catalog`).
- Listas de precios: `Lista Mayorista` (MAYORISTA, COP) y `Lista Detalle` (DETALLE, COP). Sin productos con precios asociados en seed.

## 8. Riesgos y observaciones técnicas

1. **Drift docs vs código:** los docs describen `isDefault`, `CAT-DEFAULT`, `Product.status`, `Assignment.roleId/permissionLevel`; el `schema.prisma` real no los tiene. La especificación funcional no es fuente de verdad.
2. **ACL `level` definido pero inútil:** `view|edit|manage` se almacena pero no se aplica → autorización actual depende solo de rol + existencia de assignment. Riesgo de sobre-exposición si se asume que `level` restringe.
3. **Default abierto en lectura:** usuarios sin assignments de CATALOG ven **todos** los catálogos (regla `assignments.length === 0 → baseWhere`). Contrario a "no exponer a usuarios no autorizados" si la intención es deny-by-default.
4. **Escritura solo Super Admin:** `Admin Comercial` no puede escribir producto/precio/asignación a pesar de tener permisos granulares definidos. `PermissionsGuard` inactivo. → Autorización bajo-desarrollada.
5. **Import module inactivo:** código de carga masiva construido pero no montado (`ImportModule` no está en `app.module`). Riesgo de "funciona en tests, no en runtime".
6. **`sku` global vs catálogo:** `Product.sku` es único globalmente; si Lista reemplaza Catálogo y un producto pertenece a múltiples listas, `sku` global rompería.
7. **Sin control de solapamiento de vigencias:** `Price` no tiene unique de vigencia → precios superpuestos posibles; se debe validar app-level (`validFrom ≤ validUntil`).
8. **No hay auditoría en CRUD de precios/productos:** `AuditLog` sólo se escribe desde el pipeline de importación (y parcialmente). Cambios manuales de precios no son trazables → rompe el requisito de "trazabilidad de precios".
9. **Tipado backend no estricto:** `tsconfig` backend no usa `strict`; el frontend sí. Inequidad que dificulta calidad estática.
10. **Sin tests frontend:** no hay suite para la SPA → feedback de regression visual no automatizado.
11. **Seed no crea catálogo ni datos de productoPrecio:** el MVP funcional no arranca "listo para usar".

## 9. Diseño propuesto — "Lista" como raíz (sin tocar aún)

### 9.1 Principio rector
La Lista es la entidad raíz que agrupa: **productos → precios (con vigencia) → permisos**. Todo producto debe vivir dentro de una Lista. Toda regla de negocio (precio≥0, vigencia coherente, activación/publicación condicional) se valida en backend.

### 9.2 Estado actual y alineación
- Hoy `Catalog` cumple parcialmente el rol de "contenedor raíz de productos", pero no agrupa precios ni permisos de forma unificada.
- `PriceList` agrupa precios pero no productos ni permisos.
- `Assignment.resourceType` incluye `CATALOG` y `PRICE_LIST` como raíces separadas.

### 9.3 Opciones de modelado (propuesta, NO implementada)

**Opción A — Reinterpretar "Lista" como `Catalog` (extendido).**
- `Catalog` pasa a ser `Lista`: se añade `catalogId` a `Price` (o se enlaza `Price`→`Product`→`Catalog`), y `Assignment.resourceType` pasa a `LISTA`.
- + Mínima novedad: reusa `Catalog`/`PriceList` existentes.
- − Rompimiento conceptual: `Catalog` y `PriceList` siguen separados; no hay unificación real. `PriceList` (MAYORISTA/DETALLE) sigue sin ser "la Lista".
- Impacto datos: medio (renombrar tipo, backfill, migrar assignments CATALOG→LISTA).

**Opción B — Reinterpretar "Lista" como `PriceList` (extendido).**
- `Product` pasa a pertenecer a una `PriceList`; precios ya pertenecen a ella.
- + Cohesión fuerte para precios.
- − Rompe el modelo de "catálogo maestro de productos" actual; la UI/admin de productos cambiaría de base.
- Impacto datos: alto.

**Opción C — Nueva entidad `Lista` unificada (recomendada).**
- `Lista` (id, code@unique, name, description, currency, isActive, validFrom/Until?, createdAt/updatedAt) como raíz.
- `Product.listaId` →`Lista` (reemplaza `catalogId`; migración: `catalogId`→`listaId`, backfill existiendo).
- `Price` pasa a `Price(productId, listaId, value, currency, validFrom, validUntil)` con `@@unique(productId, listaId)`; se **elimina** `priceListId` o se depara (propuesta: `validFrom/validUntil` viven en `Price`; la vigencia de la `Lista` es opcional/global).
- `Assignment.resourceType` gana `LISTA`; se mantienen `CATALOG/PRICE_LIST/CATEGORY` o se deprecan (propuesta: migrar a `LISTA`).
- `Catalog`+`PriceList` se **deshabilitan con soft-delete** (isActive) o se reemplazan por `Lista`; los datos existentes se migran a `Lista` (una Lista por catálogo existente + una Lista por PriceList existente que se usaba).
- + Modelo alineado a la regla de negocio: "producto dentro de una Lista; precio asociado a producto y Lista; permisos por Lista."
- − Impacto datos: **alto** → requiere plan de migración documentado + aprobación humana (regla 01/02).

**Opción D — Sin cambios de modelo (solo alineación semántica).**
- Documentar que "Lista" ≡ `Catalog` (productos) + `PriceList` (precios) como dos raíces; alinear vocabulario UI/ACL.
- + Cero riesgo de datos.
- − No resuelve "un precio asociado a producto y Lista" unificado ni "permisos por Lista" simple.

### 9.4 Reglas de negocio a reforzar (backend, modelo propuesto)
- `Price.value ≥ 0` (ya implícito; formalizar constraint y validar en DTO `@Min(0)`).
- `validFrom ≤ validUntil` (validar en `prices.service`).
- `Price @@unique([productId, listaId])` → un solo precio base activo por (producto, lista); **solapamiento de vigencias controlado app-level** (decisión: ¿rechazar o superponer?).
- `Product` activo (`isActive=true`) y con `listaId` → candidato a `isVisible=true`.
- `Assignment.level` (`view|edit|manage`) **debe aplicarse** en lectura/escritura (reforzar `buildAclWhere` y agregar `@Permissions` o guard por nivel).
- Toda escritura crítica (precio, assignment, publish) → **auditar** (auditar en `prices.service`/`products.service`, no solo en import).

## 10. Decisiones abiertas y preguntas para aprobación

Extraidas de `decisiones.md` (pendientes) + nuevas detectadas:

| # | Pregunta | Opciones | Impacto | Bloquea Diseño |
|---|---|---|---|---|
| D1 | ¿"Lista" es nueva entidad (C) o Alias de Catalog (A) / PriceList (B)? | A/B/C/D | Alto | Sí (modelo) |
| D2 | ¿Un producto pertenece a **una** Lista o **varias**? | Una (actual: Catalog) / Varias | Alto | Sí (relación sku unique, prices) |
| D3 | ¿El precio vive en `(producto, lista, vigencia)` y se elimina `priceListId`? | Sí / Mantener PriceList paralelo | Alto | Sí |
| D4 | ¿ACL pasa a `LISTA` (único resourceType) o se conservan `CATALOG`/`PRICE_LIST`? | Unificar a LISTA / Mantener + agregar | Alto | Sí |
| D5 | ¿Se aplica `level` (view/edit/manage) en read/write? | Sí / No (actual) | Medio | Sí |
| D6 | ¿La gestión de assignments se abre a roles distintos de Super Admin? | Sí (Admin Comercial) / No | Medio | Sí |
| D7 | ¿Carga masiva rechaza fila o acepta válidas? | Acepta válidas (reporta fallas) / Rechaza todo | Medio | Sí (import) |
| D8 | ¿Datos existentes de `Catalog`/`PriceList` migran a `Lista` o conviven? | Migrar / Coexistir | Alto | Sí (migración) |
| D9 | ¿Seed crea una `Lista` por defecto (p.ej. CAT-DEFAULT → Lista Mayorista) para arrancar? | Sí / No | Bajo | No (puede posponerse) |

## 11. Recomendación (para discusión previa a implementar)

1. **Adoptar la Opción C (nueva entidad `Lista` unificada)** como meta del incremento, pero **en fases**: 
   - **Fase 0 (este incremento, análisis):** validar modelo + obtener aprobación.
   - **Fase 1 (migración de datos, con plan + aprobación):** crear `Lista`, migrar `Catalog`(es) y `PriceList`(es) existentes → `Lista` (soft + backfill), migrar `Assignment` CATALOG/PRICE_LIST → LISTA. **No destruir** tabla `Catalog`/`PriceList` sin aprobación.
   - **Fase 2 (API/Lógica):** endpoints `Lista` (CRUD + ACL real con `level`), `Product` dentro de `Lista`, `Price(producto, lista, vigencia)` con validación `value≥0` y `validFrom≤validUntil`, auditoría en writes críticos.
   - **Fase 3 (UI):** pantallas Lista / Productos-por-lista / Precios / Asignaciones reforzadas.
2. **Resolver D2 (una vs varias listas) antes de migrar**: impacta `sku` unique y la cardinalidad de `Price`. La regla "el producto se crea dentro de una Lista" apunta a **una**; se propone **una sola Lista por producto** (reemplaza `catalogId`).
3. **Activar `level`** (D5) e introducir `@Permissions`/guard de nivel, y abrir gestión de assignments a `Admin Comercial` (D6) — alineado al seed de permisos.
4. **Reactivar `ImportModule`** en `app.module` como parte de la carga masiva de precios por Lista (D7: aceptar filas válidas, reportar fallas).
5. **Reemplazar el seed de catálogos inexistente** con una `Lista` semilla por defecto (D9) para que `Product` tenga siempre una Lista raíz.

## 12. Anexos

### 12.1 Archivos inspectados (muestra)
- `src/backend/prisma/schema.prisma` — modelo canónico.
- `src/backend/prisma/migrations/*/migration.sql` (4 migraciones).
- `src/backend/prisma/seed.ts` — roles, permisos, datos semilla.
- `src/backend/src/app.module.ts`, `src/backend/src/main.ts`.
- `src/backend/src/modules/{auth,users,roles,permissions,assignments,catalogs,categories,brands,products,prices,import,audit,health}/*`.
- DTOs en `src/backend/src/modules/**/dto/*`.
- Guards/decorators en `src/backend/src/common/{guards,decorators}/*`.
- `src/frontend/src/App.tsx`, páginas `*Page.tsx`, hooks `useProducts`/`useProductMutations`/`usePriceLists`, services `api`/`catalogs`/`assignments`/`users`, stores `auth.store`, `lib/rbac`+`lib/roles`, `types`.
- `docs/{data-model,data-model-v1,mvp-scope-v1}.md`.

### 12.2 Comandos relevantes (no ejecutados en este incremento)
- Backend: `npm run dev`, `npm run build`, `npm run lint`, `npm test`, `npm run db:migrate`, `npm run db:seed`, `npm run db:studio`.
- Frontend: `npm run dev`, `npm run build`, `npm run lint`.

### 12.3 Pendientes de verificación (post-aprobación)
- Confirmar `schema.prisma` está alineado con la DB migrada (`prisma db pull` / `migrate status`) — posible drift con migrations históricas.
- Inspeccionar `prices.service.ts` completo (confirmar patrón ACL por PriceList).
- Confirmar si `PermissionsGuard` se menciona en otros módulos o es pura especulación.
- Definir regla exacta de solapamiento de vigencias (`view|edit|manage` sobre precios).
