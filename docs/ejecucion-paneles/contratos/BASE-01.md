# BASE-01 — Inventario y versión de trabajo (paso: inventario)

**Fecha:** 2026-10-14 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso no modifica la aplicación, la base de datos ni los servicios activos, y no ejecuta commits.

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa en este checkout (comandos en §11). |
| **IP** | Informe previo: lo afirma un documento anterior; no se re-ejecutó en esta entrega. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Versión de trabajo (estado inicial)

- **OBS** Rama `feat/storefront-public-pricing`; HEAD `f6311b5c4cca31274b622bfd76628e0f406bb9c5` («docs(handoff): record png removal and clean working tree»).
- **OBS** Árbol sucio: 28 entradas — 10 modificadas (`docker-compose.yml`, `docs/00-INDEX.md`, `docs/adr/ADR-002-biblioteca-vitrina.md`, `src/backend/package.json` y `package-lock.json`, `src/backend/prisma/schema.prisma`, `src/backend/src/app.module.ts`, `src/backend/src/modules/products/products.module.ts`, `src/backend/src/modules/products/public-products.controller.ts`, `src/frontend/src/features/storefront/components/HomeHero.tsx`) y 18 sin rastrear (`src/backend/src/modules/storefront/`, `Dockerfile.customer-access`, migración `20261007120000_customer_access/`, `institutional-pages.json`, docs de diseño/ADR de octubre, `docs/ejecucion-paneles/`, `docs/archive/paneles/`, `odd/tasks/institutional-content-pages.md`). **HEAD no describe por sí solo el árbol sucio**: el inventario refleja el checkout completo.
- **OBS** Esta entrega no ejecutó `git reset/clean/revert/checkout` ni tocó cambios ajenos; la firma de `git status --porcelain` antes/después queda registrada en el informe de entrega.
- **IP** `docs/COMPARACION-10-PANELES-2026-10-13.md:19-23` define tres versiones: **S3** = este checkout (servidor principal, API activo en el puerto 3000, frontend 5173), **S4** = worktree `worktree/dashboards` (frontend 5174 en la revisión; no idéntico a S3), **L** = worktree local Windows `C:/Users/sopor/.codex/worktrees/25d1/grupo-security-office`. Regla del paso: S3 es el checkout autorizado; **no fusionar ni reemplazar S3/S4**; L aporta piezas que S3 no tiene (§8).

## 2. Inventario de pantallas (OBS — `src/frontend/src/App.tsx`)

Imports estáticos en App.tsx (sin `lazy`; el único `lazy` del frontend está en `main.tsx` para el plugin de anotación). Protección de rutas: `ProtectedRoute` (App.tsx:38-50) con `useAuthStore` y `workspaceRedirect` (`src/frontend/src/lib/workspace.ts`); no hay routers anidados dentro de `src/frontend/src/features/`.

| Ruta | Componente (App.tsx) | Panel / área |
|---|---|---|
| `/login` | `Login` (:55) | acceso |
| `/` (índice, workspace admin) | `Dashboard` (:64) | Mi resumen (herramienta personal fuera de paneles) |
| `/commercial/products`, `/commercial/products/:productId` | `ProductsPage`, `ProductDetailPage` (:67-68) | Catálogo y precios |
| `/commercial/lists`, `/commercial/lists/:id` | `ListasPage`, `ListaDetailPage` (:69-70) | Catálogo y precios |
| `/commercial/lists/:listaId/products/:productId` | `ProductDetailPage` (:74-77) | Catálogo y precios |
| `/commercial/customers`, `/commercial/quotes`, `/commercial/quotes/:id` | `CustomersPage`, `QuotesPage`, `QuoteDetailPage` (:71-73) | Comercial |
| `/commercial/assignments`, `/commercial/settings` | `AssignmentsPage`, `CommercialSettingsPage` (:78-79) | Usuarios y accesos / configuración comercial |
| `/users`, `/customer-accounts`, `/team-requests`, `/audit`, `/promotions` | `UsersPage`, `PortalAccountsAdminPage`, `TeamWorkflowPage`, `AuditPage`, `PromotionManagerPage` (:82-86) | administración transversal; `promotions` = avisos internos |
| `/sales` (+ `customers`, `agenda`, `promotions`, `quotes`) | `SalesHomePage`, `CustomersPage` personal, `AgendaCalendarPage`, fragmento vacío, `QuotesPage`/`QuoteDetailPage` personal (:93-98) | Comercial (vendedor); `agenda` es herramienta personal |
| `/supervisor` (+ `agenda`, `requests`) | `SupervisorWorkspacePage`, `AgendaCalendarPage`, `TeamWorkflowPage` (:101) | Comercial (supervisor) — **IP**: el panel principal es un prototipo con datos ficticios (COMPARACION:33) |
| `/clientes/login|registro`, `/clientes*` | portal de clientes (:102-105) | fuera de los dos paneles |
| `/tienda`, `/catalogo*`, `/productos/:slug` | tienda pública (:106-112); catch-all → `/tienda` (:115) | fuera de los dos paneles |

**OBS** **«Catálogo y precios» no tiene ruta propia en App.tsx**: sus herramientas viven hoy bajo `/commercial/products` y `/commercial/lists`. El panel propuesto está en `docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md` (**IP**; no existe como ruta ni módulo todavía).

## 3. Inventario de API (OBS — `app.module.ts:54-79` + `rg "@Controller\("`)

Módulos registrados: Prisma, Hierarchy, Security, Auth, Users, Roles, Products, Categories, Brands, Assignments, Prices, Listas, Audit, Health, Files, Dashboard, Customers, Quotes, SalesOrders, SalesTargets, Notifications, Promotions, Workflow (team-workflow), CustomerPortal, Storefront. Guards globales (app.module.ts:81-97): `JwtAuthGuard`, `ThrottlerGuard`, `PermissionsGuard`.

| Área | Controller (ruta:línea) | Prefijo |
|---|---|---|
| Catálogo | `products/products.controller.ts:26` | `api/products` |
| Listas (desde products) | `products/products.controller.ts:319` | `api/listas` — **OBS**: segundo decorador con el mismo prefijo que `listas/listas.controller.ts:30`; **DESC**: no se verificó el registro en runtime |
| Importador general de productos | `products/import/import.controller.ts:35` | `api/products/import` (`preview` :53, `execute` :109, `progress/:importId` :144, `current-price` :163, `current-prices` :186, `mappings` :200/:207) |
| Ficha técnica | `products/sheet/product-sheet.controller.ts:18` | `api/products/:id/sheet` |
| Catálogo público | `public-products.controller.ts:17`, `public-detail/public-product-detail.controller.ts:7`, `categories/public-categories.controller.ts:8` | `api/public/products`, `api/public/categories` |
| Precios y Listas | `prices/prices.controller.ts:16`, `listas/listas.controller.ts:30` | `api/prices`, `api/listas` |
| Comercial | `commercial/customers/customers.controller.ts:31`, `commercial/quotes/quotes.controller.ts:33`, `commercial/sales-orders/sales-orders.controller.ts:27`, `commercial/sales-targets/sales-targets.controller.ts:21` | `api/commercial/*` |
| Avisos internos | `promotions/promotions.controller.ts:11` | `api/promotions` |
| Agenda y solicitudes | `team-workflow/workflow.controller.ts:8` | `api/team-workflow` |
| Usuarios, roles, asignaciones, auditoría | `users/users.controller.ts:19`, `roles/roles.controller.ts:12`, `assignments/assignments.controller.ts:15`, `audit/audit.controller.ts:11` | `api/users`, `api/roles`, `api/assignments`, `api/audit` |
| Cuentas de cliente (dos familias) | `customer-portal/customer-portal.controller.ts:41`, `storefront/storefront.controller.ts:80` | `api/customer-portal`, `api/customer-access` |
| Tienda y su configuración comercial | `storefront/storefront.controller.ts:44` y `:166` | `api/storefront`, `api/commercial/storefront` |
| Transversal | `auth/auth.controller.ts:28`, `auth/notion-auth.controller.ts:6`, `dashboard/dashboard.controller.ts:16`, `files/files.controller.ts:8`, `notifications/notifications.controller.ts:18`, `health/health.controller.ts:6`, `brands/brands.controller.ts:14`, `categories/categories.controller.ts:13` | `api/auth`, `api/auth/notion`, `api/dashboard`, `api/files`, `api/notifications`, `api/health`, `api/brands`, `api/categories` |

**OBS** **No existe** `POST /api/prices/import/preview` ni ningún archivo bajo `src/backend/src/modules/prices/import/` en este checkout (`rg --files src` e `git ls-files` sin coincidencias; `modules/prices/` solo contiene `dto/`, `prices.controller.ts`, `prices.module.ts`, `prices.service.ts`, `prices.service.spec.ts`). El flujo de revisión de precios documentado está en el worktree L (§7).

## 4. Inventario de modelo (OBS — `src/backend/prisma/schema.prisma`, 45 modelos)

- **Catálogo y precios:** `Lista` (:107), `Product` (:145, con `listaId String?` :161 — producto con cero o una lista), `ProductCatalogSpecGroup/Item`, `ProductCatalogResource`, `Category`, `Brand`, `ProductImage`, `UploadedFile`, `PriceList` (:323), `Price` (:342, `listaId` :352), `ImportMapping` (:555), `ImportSession` (:574), `Stock` (:624).
- **Comercial:** `Customer` (:589), `Quote` (:642, `listaId` obligatoria :647), `QuoteItem`, `SalesOrder` (:682), `SalesTarget` (:710), `SalesPromotion` (:877), `TeamActivity`, `TeamRequest`.
- **Cuentas de cliente (dos familias):** `PortalAccount` (:758), `PortalSession`, `PortalPriceListMapping`, `PortalTier`, `CustomerAccount`, `CustomerSession`, `CustomerAccessToken`.
- **Transversal:** `User` (:11), `Assignment` (:53), `Role`, `UserRole`, `RolePermission`, `UserPermission` (:451), `StepUpGrant`, `AuditLog` (:481), `Notification`, `Session`, `UserMfa`, `MfaBackupCode`, `LoginAttempt`, `NotionToken`, `StorefrontInquiry`, `StorefrontSettings` (:1019).

## 5. Inventario de permisos

**OBS — enforcement en este checkout:**

- `PermissionsGuard` global (app.module.ts:94-96) con `JwtAuthGuard` y `ThrottlerGuard` también globales (:82-89). `src/backend/src/common/guards/permissions.guard.ts:42` implementa `CanActivate`, lee los metadatos de `@Permissions` (`permissions.decorator.ts`), **exime a Super Admin** (:59) y delega la ACL contextual por Lista en los servicios.
- `RolesGuard` aplicado en al menos 14 controllers (prices, products, listas, users, roles, assignments, audit, dashboard, promotions, storefront, customer-portal, categories).
- `@Permissions(...)` con catálogo concreto en `products.controller.ts` (7 usos), `listas.controller.ts` (6), `assignments.controller.ts` (3), `dashboard.controller.ts` (1). Ejemplo visible: `listas:create` en `assignments.controller.ts`/`listas.controller.ts`.
- `src/backend/src/common/security/user-permissions.service.ts` resuelve concesiones individuales (IP COMPARACION:125).

**IP — reglas de diseño vigentes (`docs/PANELES-Y-PERMISOS.md`, `docs/adr/ADR-20261013-paneles-y-paquetes-de-trabajo.md`):** acceso por asignación por persona (no por rol/cargo); jerarquía Panel → Paquete → Herramienta → Acción; «editar no concede publicar»; publicar/editar/eliminar se comprueban por separado; UI oculta por permisos y el servidor comprueba cada acción; revocar acceso afecta a la siguiente solicitud con el mismo token.

**DESC:** las skills `gs-user-access-design`, `gs-access-inventory` y `gs-access-verification` citadas por el prompt del implementador **no se encontraron** en este repo ni en `~/.claude/skills` ni `~/.gentle-ai`. El catálogo `src/backend/src/common/security/access-catalog.ts` citado como de L (**IP** COMPARACION:23, IMPLEMENTACION:40) **no existe en S3**.

## 6. Inventario de pruebas

**OBS — conteo de archivos (no ejecución):** 99 archivos `*.spec.ts`/`*.test.ts` (backend 64, frontend 35). En el área de importación: 9 specs bajo `src/backend/src/modules/products/import/` (incluye `import-module.mount.spec.ts`, `import.service.spec.ts` y la pipeline) y 1 spec en `modules/prices/` (`prices.service.spec.ts`). **No existen** specs de `modules/prices/import/` ni tests en `src/frontend/src/features/` para importación de precios (el importador general en `features/products/import/` no tiene specs).

**IP — informes previos (no re-ejecutados en esta entrega):**

- `docs/IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md:43`: «332 pruebas de backend en diez suites» (21 HTTP) y «13 pruebas de frontend en dos archivos», con repositorios/sesiones simulados — corresponden al **worktree L**, no a este checkout.
- `docs/PROJECT_STATUS.md:174`: informe de 2026-10-07 (jest 1102/1102, vitest 377/377) del estado histórico del proyecto.

**OBS — comandos oficiales del paquete:** backend `npm test` (jest, `src/backend/package.json:12`), frontend `npm run test` (vitest run, `src/frontend/package.json:12`). No se ejecutaron suites en este paso (solo documentación).

## 7. Preview temporal ≠ aplicación de precios (caso obligatorio)

- **Definición (IP reglas comunes):** el *preview* analiza y compara un Excel de precios **sin persistir revisiones ni aplicar precios**; la *aplicación* es una escritura transaccional de precios con permiso propio, historial y control de concurrencia.
- **IP — preview implementado en el worktree L** (`docs/IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md:3,39-43`): endpoint `POST /api/prices/import/preview` con acción `prices:preview` (requiere `prices:read` y `listas:read` + alcance de la lista), validación XLSX/XML estricta, comparación con la lista elegida, auditoría de la revisión sin guardar el Excel ni los valores, límites 5 MB / 5000 filas, redondeo HALF_UP a COP entero. **No aplica actualizaciones**; el informe de 332+13 pruebas usa controladores/sesiones simulados y **no certifica PostgreSQL**.
- **OBS — ausencia en S3:** esos rutas/archivos no existen en este checkout (§3). Lo único relacionado aquí es el **importador general de productos** (`modules/products/import/`): `POST api/products/import/preview` es un dry-run «sin modificar la BD» (`import.service.ts:42-44,67`) y `POST api/products/import/execute` **sí persiste** la importación de productos con transacciones — es otro flujo, no la revisión de precios. **No existe endpoint ni acción «apply/aplicar» de revisión de precios en S3.**
- **OBS/IP — aplicación pendiente en todas las versiones revisadas:** `docs/IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md:64-70` la declara como «lo siguiente»: permiso separado, transacción de precios, historial por fila, control de cambios simultáneos, reintentos que no dupliquen, revalidación al aplicar y unificación del límite con la edición manual. Nada de eso está implementado ni propuesto como código en este checkout.

**Conclusión del inventario:** el preview (temporal, no persistente) y la aplicación de precios son dos piezas distintas; en S3 ninguna de las dos existe como módulo de revisión de precios, y la segunda no existe en ninguna versión conocida.

## 8. Funciones que deben conservarse y dónde se verificaron (no fusionar S3/S4/L)

| Función | Versión donde se verificó | Evidencia | Estado en S3 (este checkout) |
|---|---|---|---|
| Agenda y solicitudes de equipo | S3 | `workflow.controller.ts:8` (`api/team-workflow`), `AgendaCalendarPage`, `TeamWorkflowPage` (App.tsx:95,101) | **OBS**: código presente. **IP** COMPARACION:107: el servicio no muestra llamadas a `AuditService`; auditoría sin confirmar |
| Avisos/promociones internas | S3 | `promotions.controller.ts:11`, modelo `SalesPromotion`, `PromotionManagerPage` | **OBS**: código presente; depende del rol (**IP** COMPARACION:65) |
| Ficha técnica y recursos | S3 | `product-sheet.controller.ts:18`, `ProductCatalogSpecGroup/Item`, `ProductCatalogResource` | **OBS**: código presente |
| Vendedor en `/sales`, portal de clientes, tienda pública | S3 | App.tsx:89-105, `customer-portal.controller.ts:41`, `storefront.controller.ts:44/80` | **OBS**: código presente; **dos familias de cuentas** sin unificar (**IP** COMPARACION:49-51) |
| Acceso por acción individual (`access-catalog.ts`, `AdminAccessGuard`, `UserAccessAssignments`) | L | **IP** COMPARACION:23,119-125 | **OBS**: ausente en S3 (sin archivos equivalentes en `src/`) |
| Gestor de banners y configuración de página | L | **IP** COMPARACION:63,69 (`banners.service.ts`, `PageConfigurationPage.tsx`) | **OBS**: ausente en S3 |
| Revisión de precios (preview) | L | **IP** IMPLEMENTACION:3,39-41 | **OBS**: ausente en S3 (§3, §7) |
| Catálogo público y presentación propia | S4 (y S3 storefront) | **IP** COMPARACION:41 | S4 **no idéntico** a S3; no se fusiona |

**Caso obligatorio — piezas de agenda/promociones/ficha técnica:** en este checkout solo se declara **presente el código observado** de la tabla. `docs/ejecucion-paneles/CONTEXTO.md:13` advierte que «agenda/promociones internas/ficha técnica tienen piezas documentadas en S3 que **no están todas en este checkout**» y `docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md:92` confirma que el módulo de agenda existe en S3 pero no en el worktree local. **No se declara que esas funciones estén completas ni presentes «por documentación»**: datos de agenda, flyers de promociones, piezas de la ficha técnica y su auditoría quedan como inventario abierto (paso BASE de recuperación de la agenda compartida, según `docs/ejecucion-paneles/README.md:40`). **DESC**: no se consultó la base de datos ni archivos externos para confirmar esas piezas.

## 9. Propuesta de base (PROP — requiere decisión del coordinador)

Principios de consolidación, sin implementar:

1. **S3 es la base oficial** del API y del modelo de datos (PostgreSQL/Prisma, única fuente de verdad). No se reemplaza S3 por S4 ni por L; se incorporan piezas mediante contratos.
2. **Se preservan identidad y medios:** IDs existentes de `Product`/`Lista`/`Price`/clientes/cotizaciones, bytes de `UploadedFile`/`ProductImage`/`ProductCatalogResource`, y las funciones públicas (tienda, catálogo público, portal de clientes) sin cambios de presentación.
3. **Incorporación posterior por contratos, no por fusión:** acceso por acción de L (BASE-02+), preview de precios de L (paquetes IMP), banners de L (panel de configuración de página). Cada incorporación exige inventario y contrato de integración previo (CONTEXTO.md:13).
4. **Permisos:** antes de aplicar el catálogo de acciones a todo S3, clasificar las rutas actuales (promociones, agenda/solicitudes, notificaciones, portal, ficha técnica, Notion); el patrón de guard de L rechaza rutas sin clasificar (**IP** COMPARACION:141). Editar no concede publicar; el alcance propio/equipo/lista se comprueba en API y frontend.
5. **Precios:** cualquier aplicación futura de precios usa transacción, permiso separado, historial e idempotencia de reintentos; el límite del preview ($9.999.999.999) debe unificarse con la edición manual antes de aplicar (**IP** IMPLEMENTACION:21).

**Diferencias sin resolver explícitas (no se deciden en este paso):**

| # | Diferencia | Responsable sugerido |
|---|---|---|
| D1 | El preview de precios está en L, no en S3: decidir si se traslada el código de L o se reimplementa en S3 | coordinador + paquete IMP-01 |
| D2 | `access-catalog.ts`/`AdminAccessGuard`/`UserAccessAssignments` solo en L; BASE-02 (contrato de acceso) depende de esa decisión | BASE-02 |
| D3 | Dos familias de cuentas de cliente (`api/customer-portal` vs `api/customer-access`) con modelos distintos: definir la experiencia oficial y cómo se conservan cuentas y tarifas | coordinador (COMPARACION:49-51) |
| D4 | `UserPermission` no conserva la procedencia de varios paquetes; diseñar retiro de paquetes sin quitar accesos que concede otro | BASE (usuarios/accesos) |
| D5 | Límite de precio del preview vs límite de la edición manual sin unificar | IMP |
| D6 | `/supervisor` sigue siendo prototipo con datos ficticios | COM |
| D7 | Piezas de agenda/promociones/ficha técnica no todas inventariadas (§8) | BASE (recuperación de agenda) |
| D8 | Skills `gs-*` de accesos no halladas en el entorno | coordinador |
| D9 | Segundo `@Controller('api/listas')` en `products.controller.ts:319` sin verificar en runtime | CAT/verificación técnica |

## 10. Límites de este paso y pruebas previstas

- **Ejecutado aquí:** solo escritura documental. Validación de referencias (rutas citadas existentes) y comprobaciones del paquete (`preparar-tarea.mjs --check` y sus 13 pruebas Node) — resultados en `docs/ejecucion-paneles/resultados/BASE-01-inventario-entrega.md`.
- **No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP con permisos, pruebas con PostgreSQL desechable, recorrido de navegador, consulta de clientes/usuarios/credenciales.
- **Pruebas previstas para pasos posteriores (no son evidencia todavía):** llamadas API permitidas/denegadas por acción y alcance; transacciones, integridad y concurrencia con PostgreSQL desechable; revalidación de permisos al ejecutar trabajos persistidos; reintentos sin duplicar cambios ni estadísticas.

## 11. Evidencia reproducible

Comandos desde la raíz del repo (solo lectura):

```bash
git rev-parse HEAD; git status --porcelain
rg -n "lazy\(" src/frontend/src/App.tsx
rg -n "@Controller\(" src/backend/src/modules
rg -c "^model " src/backend/prisma/schema.prisma
rg -n "^model (Product|PriceList|Price|Quote|SalesPromotion|AuditLog|UserPermission) \{" src/backend/prisma/schema.prisma
rg --files src | rg "price-import|prices/import"      # sin coincidencias en S3
rg --files src | rg "\.(spec|test)\.(ts|tsx)$" | wc -l # 99 (64 backend / 35 frontend)
rg -n "Super Admin|class PermissionsGuard" src/backend/src/common/guards/permissions.guard.ts
node docs/ejecucion-paneles/preparar-tarea.mjs --check
node --test docs/ejecucion-paneles/preparar-tarea.test.mjs
```

## 12. Riesgos de esta base

- Consolidar desde L sin contrato puede perder IDs, medios o funciones públicas de S3 (D1-D2).
- Aplicar el control de acceso de L a S3 sin clasificar todas las rutas deja endpoints sin inventario o bloquea rutas válidas.
- Tratar los informes de pruebas de L (332/13) como estado de S3 daría una falsa sensación de cobertura.
- Declarar agenda/promociones/ficha técnica «presentes» por documentación ocultaría piezas faltantes y decisiones de integración pendientes (D7).
