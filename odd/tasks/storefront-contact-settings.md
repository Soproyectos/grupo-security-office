# Feature: storefront-contact-settings

## Objective
Que los datos de contacto del storefront (teléfonos, WhatsApp, correo, horarios y mensajes prellenados) se puedan editar desde el panel interno por un usuario con un rol autorizado, sin editar código. La barra superior, el footer, los canales de venta y la ficha de producto leen esos datos.

## Problem / Why
El coordinador pidió dejar de editar datos comerciales por código (`odd/tasks/storefront-homecenter-parity.md`, aviso de `contact.ts`: *"TODO: replace demo contact data before production"*). Hoy los datos viven en constantes TypeScript (`src/frontend/src/features/storefront/constants/contact.ts`) y se consumen en 4 componentes de producción. Son datos de negocio —no de UI— y además hoy son **demo** (`576011234567`, `serviciocliente@gruposecurity.example`, NIT demo): publicarlos sin poder corregirlos desde el panel es un riesgo antes de producción.

Estado real (verificado por exploración de código):
- No existe **ningún** modelo de configuración en `src/backend/prisma/schema.prisma` (ni settings ni key-value).
- RBAC ya soportado: `Role`/`RolePermission`/`UserPermission` con permisos `recurso:acción`, `PermissionsGuard` global, matriz en `prisma/seed.ts:90-151`.
- El panel ya tiene `CommercialSettingsPage` (4 pestañas CRUD: categorías, marcas, tarifas, historial) en `/commercial/settings`.
- API pública del storefront: `@Public()` + `@Throttle(60/min)` en `public-categories.controller.ts` y `public-products.controller.ts`.
- El storefront **no** usa TanStack Query: sus hooks son stores module-scoped con `useSyncExternalStore` (`useCategoryMenu.ts`), cacheados una vez por sesión.
- `whatsappUrl()` es una función de módulo y `SALES_CHANNELS`/`COLUMNS`/`SOCIAL_LINKS` son constantes de módulo: al volver asíncrono el dato, esos `href` dejan de poder calcularse en tiempo de import.

## Decisiones de diseño tomadas (con valor por defecto; el coordinador puede vetar cualquiera)
| Decisión | Elección | Por qué |
|---|---|---|
| Persistencia | Singleton `StorefrontContact` (una fila) | Tipado Prisma fuerte, un `PUT`, validación en un DTO. Key-value exigiría migraciones por cada campo nuevo y perdería validación de formato. |
| Campos derivados | Se guarda el teléfono en E.164 y **se derivan** `tel:` y `https://wa.me/…` | Hoy hay 3 campos por teléfono (número, href, display) duplicados; derivar elimina la inconsistencia. |
| Fallo de la API | Si el endpoint público falla, el storefront cae a las constantes actuales | Un dato de contacto nunca debe dejar la tienda en blanco. |
| Requests | 1 request extra al page load, cacheado por sesión (igual que `useCategoryMenu`) | Mezclar contacto en el payload de categorías lo ensucia; el costo es una request. |
| Auditoría | `entity: 'StorefrontContact'` + **añadirla a `COMERCIAL_ENTITIES`** (`audit.service.ts:11-18`) | Sin eso, Admin Comercial no ve sus propios cambios: el filtro es deny-default. |
| Ubicación UI | **Página propia `/storefront`**, hermana de `/users`, no una pestaña de Configuración | Requisito del coordinador (2026-10-05): "se debe crear la página correspondiente". Se registra como hija de `/` en `App.tsx` (hermana de `users`/`audit`) para que herede `ProtectedRoute` + `AdminLayout`, y su enlace de menú se filtra con un helper como `canViewUsers()`/`canViewAudit()` (`Header.tsx:210-219`). |
| Quién puede asignarlo | `storefront:read` + `storefront:write` con default **solo Super Admin** en la matriz del seed, y **asignable por rol** desde la pestaña "Roles y Permisos" de `/users` | Alineado con la propuesta de roles y pantallas del 2026-10-05 (pendiente de aprobación; vive en srv-soporte, no en este worktree: `docs/UI/matriz-roles-pantallas-propuesta-2026-10-05.html`): "Configuración comercial" es de Super Admin, y Admin Comercial queda en "categorías, marcas y tarifas". El contacto del storefront no es catálogo ni precios, así que no entra por defecto en Admin Comercial. |
| Concesión a un **usuario** | Reutilizar el mecanismo que ya existe: `UserPermission` + `GET/PUT /api/users/:id/dashboard-permissions` (solo `@Roles('Super Admin')`), **`replaceForUser` en bloque**, auditado en `grant-dashboard-permissions` | El coordinador pidió conceder el acceso "a un rol o a un usuario" (2026-10-05). El modelo `UserPermission` (`schema.prisma:399-413`) ya existe con `effect` y `@@unique([userId, permission])`, y los permisos efectivos son la unión rol + concesión (`auth.service.ts:74-93`), así que un permiso concedido llega al JWT y a `hasPermission()` sin más cambios. |
| Blindaje de concesiones | Ampliar `GRANTABLE_PREFIXES` (`user-permissions.service.ts:17`) con `'storefront:'` y **documentar la excepción** en el mismo bloque | Hoy `assertGrantable()` (`:34-48`) solo admite `dashboard:pack:` / `dashboard:block:` y su comentario (`:9-16`) dice que es deliberado: la pantalla reparte **visibilidad**, no capacidades, para no ser puerta trasera de escalada. `storefront:write` es una capacidad, así que la excepción debe decir por qué se abre: solo la concede Super Admin —que ya puede concederla por rol— y queda auditada, luego no amplía quién puede hacer qué. |
| UI de concesión por usuario | Añadir un grupo "Configuración de tienda" con 2 casillas dentro del modal existente (`DashboardGrants.tsx`), reutilizando su carga, borrador y botón de guardar | Ese componente ya carga **todas** las concesiones sin filtrar (`selected` = `data.map(g => g.permission)`, `:44`) y guarda el set completo (`:236`), así que editar paneles hoy **no borraría** una concesión de tienda. Añadir el grupo于此 es seguro frente a pérdida de datos; hacerlo en un modal aparte con otro endpoint obligaría a coordinar dos listas que el backend sustituye en bloque. Requiere renombrar la etiqueta "Paneles" a algo que cubra ambos usos. |

## Alcance del footer (decidido 2026-10-05)
El coordinador confirmó la creación de la página. Queda **dentro** de `StorefrontContact` todo lo que la barra superior y el footer ya leen de `contact.ts`: línea nacional, WhatsApp, correo, horario largo y el mensaje "Vende con nosotros" — la barra de abajo queda cubierta por el mismo registro, sin trabajo extra.
Queda **fuera** de esta feature lo que hoy son constantes de navegación sin destino real: `COLUMNS` (Servicio al cliente / Compañía / Legal) y `SOCIAL_LINKS` (`StorefrontFooter.tsx:26-62`). Editar la estructura de enlaces del footer es otro tipo de dato (lista de enlaces, no un registro de contacto) y sería una feature aparte, `StorefrontFooterLinks`.

## Authorized scope
- [x] **SC-01** — Backend: modelo `StorefrontContact` + migración + fila semilla con los valores demo actuales + DTO con `class-validator` + `GET /api/public/storefront/contact` (`@Public()` + `@Throttle`) + `PUT /api/storefront/contact` (`@Permissions('storefront:write')`) + `AuditLog` + `storefront:write` en la matriz del seed + `'StorefrontContact'` en `COMERCIAL_ENTITIES`.
- [x] **SC-02** — Panel: **página propia `/storefront`** (no pestaña de Configuración) + `storefront-contact.service.ts` + formulario en 3 grupos (teléfonos y WhatsApp / correo y horarios / mensajes prellenados) + gate por `hasPermission('storefront:write')` con el patrón "No tienes permisos para ver esta sección" de `UsersPage.tsx:132-141` + enlace de menú en `Header.tsx` filtrado por un helper nuevo en `lib/rbac.ts` + spec.
- [x] **SC-03** — Storefront: `useStorefrontContact()` (store module-scoped, fallback a constantes) + adaptación de los 4 consumidores (`StorefrontChrome`, `StorefrontFooter`, `StorefrontSalesChannels`, `StorefrontProductPage`) para que ningún `href` se calcule a nivel de módulo + specs actualizados.
- [x] **SC-04** — Concesión a rol **y** a usuario: (a) backend, añadir `'storefront:'` a `GRANTABLE_PREFIXES` con la excepción documentada y ajustar el mensaje de `assertGrantable`; (b) `PERMISSION_GROUPS` gana el grupo `Tienda: [storefront:read, storefront:write]` (`UsersPage.tsx:32-40`) para la pestaña "Roles y Permisos"; (c) `DashboardGrants.tsx` gana el grupo "Configuración de tienda" con 2 casillas reutilizando su carga/borrador/guardado, y la etiqueta "Paneles" de la tarjeta de usuario pasa a cubrir ambos usos; (d) verificar que editar paneles no borra una concesión de tienda y que `PUT /roles/:id` y `PUT /users/:id/dashboard-permissions` aceptan los permisos nuevos.
- [x] **SC-05** — Cierre: lint + typecheck + tests (frontend y backend), entrada de bitácora en `docs/` con el endpoint y el permiso, running count de líneas y evidencia.

## Constraints
- AGENTS.md: sin secretos ni PII real (los valores siguen siendo demo hasta que el coordinador los cambie), cambios mínimos, validación antes de "terminado", **sin commit sin autorización explícita**.
- No tocar el estilo de la barra más allá de lo pedido; no cambiar el orden ni el copy del chrome.
- Convención de permisos `recurso:acción`; añadir uno obliga a tocar **tres** sitios (matriz del seed, decorador del controller, `hasPermission` del frontend) — no hay catálogo central.
- Todo permiso nuevo concedido por rol solo llega al frontend **en el próximo login** (van embebidos en el JWT y el store está persistido).
- Los stores module-scoped cachean una vez por sesión: un visitante con la pestaña abierta verá el dato viejo hasta recargar. Aceptado explícitamente.

## Route declarations
- Ruta elegida: **delegated direct** — work units separados (backend, página del panel, storefront dinámico, permiso asignable), cada uno delegado a un writer acotado. Trigger evidence: writer trigger (cada unidad toca 2+ archivos no triviales) + mapping trigger ya consumido en la exploración (4+ archivos).
- TDD: **OFF** — fuente: patrón establecido en las features previas de esta rama (`storefront-homecenter-parity.md`, `mega-menu-categorias.md`: writer agents sin RED/GREEN). Runner: **Vitest** (frontend) y **Jest** (backend). Se corren checks funcionales y specs pertinentes por tarea, no RED obligatorio.
- Estrategia de entrega: `ask-on-risk` (default). Forecast original: **~1000–1400 líneas autoradas**. **Recount real (2026-10-06): 3130** (526 tracked + 2604 en 22 archivos nuevos; ~1515 son specs) → muy por encima del presupuesto de ~400, así que antes del primer commit hay que fijar la cadena con el coordinador. Propuesta: **`feature-branch-chain`**.
- **RDD**: `~/.gentle-ai/state.json` dice `rdd_mode: "on"`, pero el binario `gentle-ai` **no está en el PATH** en este servidor, así que `review assess` no se puede ejecutar. Entrega queda `disabled/unmanaged` salvo que el coordinador restaure el CLI. No se infiere riesgo bajo por assessments no ejecutados.

## Acceptance criteria
- SC-01: `GET /api/public/storefront/contact` responde sin auth con los datos actuales (mismo `576011234567`, mismo texto de barra y footer); `PUT` con un usuario sin `storefront:write` responde 403; con permiso guarda, escribe `AuditLog` y el cambio es legible por Admin Comercial en el historial.
- SC-02: `/storefront` carga los valores actuales, valida en cliente y servidor, y con un rol sin permiso muestra el aviso de sección restringida y no aparece en el menú; con permiso permite guardar.
- SC-03: barra superior **y** footer muestran los valores guardados; con la API caída siguen mostrando los de las constantes.
- SC-04: en `/users` → "Roles y Permisos" → Editar Rol aparece el grupo "Tienda" y al activarlo el permiso queda guardado en el rol; en "Usuarios" → botón de la tarjeta → el grupo "Configuración de tienda" guarda `storefront:read`/`storefront:write` en ese usuario; **editar los paneles de ese mismo usuario no borra la concesión de tienda** y viceversa; ambos caminos quedan con `AuditLog`.
- SC-05: `npx vitest run` (storefront + nuevo spec del panel) en verde, `jest` del módulo nuevo en verde, `tsc --noEmit` sin errores, `eslint` sin desviaciones del baseline.

## Progress
- 2026-10-05: feature creada tras explorar el precedente (`CommercialSettingsPage`), RBAC, API pública y consumidores de `contact.ts`. Sin escrituras de código todavía.
- 2026-10-05: el coordinador señaló el panel de `/users` como patrón y pidió **página propia** en vez de pestaña, acceso **asignable por rol o usuario**, y **anexar la barra de abajo**. Documento actualizado: SC-02 es página propia, SC-04 cubre rol **y** usuario, y el alcance del footer quedó decidido (contacto dentro, enlaces y redes fuera).
- 2026-10-05: cambia el default de rol a **solo Super Admin** tras leer la propuesta de matriz de roles y pantallas del mismo día (pendiente de aprobación): allí "Configuración comercial" es de Super Admin y Admin Comercial solo cubre "categorías, marcas y tarifas". Esa matriz además ya tiene una fila "Tienda / catálogo público" (`/tienda` · `/catalogo/*` · `/productos/:slug`, acceso "Publicado" para los 6 roles y visitantes), pero **no** tiene pantalla de gestión de la tienda: `/storefront` será una fila nueva que hay que añadir cuando esa matriz se apruebe, como contraparte administrativa de la pública.
- 2026-10-05: mapeada la concesión por usuario. No hace falta backend nuevo: `UserPermission` + `replaceForUser` ya cubren el caso. Lo único que bloqueaba `storefront:*` era el blindaje `GRANTABLE_PREFIXES`. Descartada la alternativa de modelarlo como `dashboard:pack:storefront`: un pack es visibilidad de bloques del dashboard, no una capacidad de escritura sobre una página.
- 2026-10-05: **SC-01 cerrado** (backend, sin commit). Creado `src/backend/src/modules/storefront/` (service, controller de administración, controller público, DTO, módulo, valores demo) + specs, modelo `StorefrontContact`, migración, semilla y permisos solo para Super Admin, `'StorefrontContact'` en `COMERCIAL_ENTITIES`. Evidencia en "Verification evidence".
- 2026-10-06: **SC-03 y SC-05 cerrados** (sin commit). Storefront leído desde `useStorefrontContact()` en los 4 consumidores, y cierre completo: bitácora, lint, typecheck y suites de ambos lados. Se detectó y corrigió de paso el cruce del mensaje prellenado (ver evidencia).

## Verification evidence
### SC-01 — backend (2026-10-05)
- `npx jest src/modules/storefront` desde `src/backend` → **2 suites, 14/14 tests OK** (7 del service + 7 del controller con supertest, incluido el 403 sin `storefront:write`).
- `npx tsc --noEmit` (backend) → solo los **3 errores preexistentes** de `src/scripts/import-biblioteca.logic.spec.ts`, sin relación con esta feature (baseline idéntico).
- `npx eslint "src/modules/storefront/**/*.ts"` → exit 0, sin salida. `npx prisma validate` → schema válido. DI de `AppModule` con ts-node → `StorefrontService` resuelve.
- Migración: `src/backend/prisma/migrations/20261005221500_add_storefront_contact/migration.sql`, generada con `prisma migrate diff` (tabla + índice `updatedById` + FK a `users` con `ON DELETE SET NULL`).
- Semilla: los 7 valores verificados **carácter por carácter** contra `src/frontend/src/features/storefront/constants/contact.ts`; viven en `storefront-contact.demo.ts`, fuente única para el seed y para el fallback del endpoint público.
- **No ejecutable en este entorno**: aplicar la migración y correr `db:seed` (no hay PostgreSQL). Queda pendiente en el despliegue.
- Baseline conocido del repo: `account-lockout.service.spec.ts` ya fallaba antes de estos cambios.

### SC-01 — desviaciones y ajuste posterior
1. El writer añadió **`GET /api/storefront/contact` con `@Permissions('storefront:read')`**, que no estaba en el listado original (solo se pedía `PUT`). Se **mantiene**: sin él el permiso `storefront:read` de la semilla no tiene consumidor y el panel no tiene cómo leer.
2. `storefront-contact.demo.ts` es un archivo extra: evita duplicar los 7 valores entre el seed y el fallback público, y permite que el endpoint público no devuelva 500 sin fila.
3. **Ajuste del orquestador**: `updateContact()` ya no lanza 404 si la tabla está vacía; **crea la fila** con el guardado y audita contra los valores demo como `oldValues`. Razón: con la migración aplicada y el seed sin correr, el panel —única vía para corregir estos datos sin tocar código— quedaba bloqueado. Cubierto por un test nuevo en `storefront.service.spec.ts`.
### SC-02 — página `/storefront` (2026-10-05)
- `npx vitest run` (frontend completo) → **26 archivos, 295/295 tests OK**; el spec de la página aporta **13**.
- `npx tsc --noEmit` → exit 0. `npx eslint` de los 6 archivos tocados → exit 0.
- Creados `src/frontend/src/pages/StorefrontSettingsPage.tsx` (+spec) y `src/frontend/src/services/storefront-contact.service.ts`; ruta `/storefront` en `App.tsx`; entrada "Tienda" en `Header.tsx` con `canViewStorefront()`/`canEditStorefront()` en `lib/rbac.ts`.
- Puertas implementadas: sin permiso → "No tienes permisos para ver esta sección"; `storefront:read` sin `write` → campos en solo lectura y sin botón guardar; con `write` → formulario operativo.
- Desviaciones: import estático en `App.tsx` (ninguna página del panel usa `lazy`); specs con `renderToStaticMarkup` porque el repo no tiene jsdom ni `@testing-library` (patrón del repo); validación en el servicio de datos, no en la página, para no romper `react-refresh`; menú etiquetado "Tienda", título de página "Configuración de la tienda"; `salesPhone`/`whatsappPhone` vacíos se envían `undefined` para no grabar línea vacía.

### SC-04 — concesión a rol y usuario (2026-10-05)
- Backend `npx jest src/common/security/user-permissions.service.spec.ts src/modules/auth/auth.service.spec.ts` → **2 suites, 31/31 OK**. Sin el prefijo nuevo el suite queda en 5 rojos (comprobado revirtiendo y restaurando).
- Frontend `npx vitest run` → **295/295 OK**; specs nuevos: `DashboardGrants.spec.tsx` (8) y `UsersPage.spec.ts` (3).
- `GRANTABLE_PREFIXES` gana `'storefront:'` con la excepción documentada; mensaje de `assertGrantable` actualizado; grupo `Tienda` en `PERMISSION_GROUPS`; sección "Configuración de tienda" en `DashboardGrants` sobre el mismo borrador y el mismo botón de guardar; botón de tarjeta "Paneles" → **"Accesos"**.
- Regresión cubierta en ambos sentidos: guardar los paneles conserva `storefront:write` y conceder tienda conserva los packs.
- Deuda de lint **cerrada por el orquestador**: el writer extrajo las funciones puras a `features/users/lib/grant-selection.ts` y movió `PERMISSION_GROUPS` a `features/users/constants/permission-groups.ts`, dejando el ESLint del frontend en **0 errores / 9 warnings** contra un baseline de **2 errores / 9 warnings**.

- **Sin commit**: pendiente de autorización explícita del coordinador.

- 2026-10-05: **SC-02 y SC-04 cerrados** (sin commit). Página `/storefront` con rutas, menú, gate por permiso y spec; y concesión del acceso por rol (grupo `Tienda` en `RoleModal`) y por usuario (sección nueva en el modal "Accesos", vía `PUT /users/:id/dashboard-permissions`). Ajustadas las exportaciones de componentes a módulos propios para no añadir warnings de lint.

### SC-03 — consumidores del storefront (2026-10-06)
- Creados `services/public-storefront-contact.service.ts`, `features/storefront/hooks/useStorefrontContact.ts` (+spec 12 tests) y `features/storefront/storefront-contact-consumers.spec.tsx` (6 tests). Modificados `StorefrontChrome.tsx`, `StorefrontFooter.tsx` (solo bloque "Contacto"), `StorefrontSalesChannels.tsx` (canales en el render) y `StorefrontProductPage.tsx` (`Summary`/`MobileBar`).
- El store es module-scoped con `useSyncExternalStore` e idéntico al patrón de `useCategoryMenu`: una request por sesión, y mientras `status !== 'ready'` se usan las constantes demo (`status: 'loading'`, no `success` con ceros), de modo que un visitante nunca ve una barra vacía ni un `wa.me/undefined`.
- `COLUMNS`/`SOCIAL_LINKS` y las columnas del footer quedaron **intactas** (fuera de alcance, `StorefrontFooterLinks`).

### Corrección del mensaje prellenado (2026-10-06, dentro de SC-03)
1. **Defecto**: el panel ofrece "Mensaje de «Vende con nosotros»" (`sellWithUsMessage`), pero el hook lo mapeaba a `contactMessage` y eso prefillaba la píldora **"Contáctenos"** de la barra; el enlace del pie seguía con la constante, es decir **el campo editable no cambiaba nada**. Estaba codificado en `storefront-contact-consumers.spec.tsx:126`, así que los tests salían verdes.
2. **Corrección**: `contactMessage` → `sellWithUsMessage` en la vista del hook; píldora "Contáctenos" → número del API + `WHATSAPP_MESSAGES.contact` (ese mensaje **no** es editable, no está en el modelo); enlace "Vende con nosotros" del pie → `contact.whatsappUrl(contact.sellWithUsMessage)`, resuelto en el componente antes del `.filter(hasHref)` para que el enlace no desaparezca.
3. **Cobertura añadida**: el spec de consumidores ahora verifica que el pie lleva `wa.me/<número>?text=<sellWithUsMessage>` guardado (ese es el punto de la feature).

### SC-05 — cierre (2026-10-06)
- Frontend: `npx vitest run` → **28 archivos / 313 tests OK** · `npx tsc --noEmit` → exit 0 · `npx eslint` → **0 errores / 9 warnings** (baseline: 2 errores / 9 warnings).
- Backend: `npx jest` → **56/57 suites, 941/942 tests** · `tsc` solo los 3 errores heredados · `eslint` 0. Único rojo: `account-lockout.service.spec.ts` (baseline preexistente).
- Bitácora: `docs/bitacora/2026-10-06-storefront-contact-settings.md`, indexada en `docs/00-INDEX.md` con endpoint, permiso, decisiones y límites del entorno.
- **Running count** (incluye los archivos nuevos): **3130 líneas autoradas** = 526 en tracked (373+ / 153−) + 2604 en 22 archivos nuevos (de los cuales ~1515 son specs y 101 el feature doc) → **~1600 líneas de código de producto**.
- **Migración y `db:seed` sin ejecutar** (no hay PostgreSQL en el entorno).
- **RDD**: `gentle-ai` no está en el PATH → `review assess` no disponible; no se infiere riesgo bajo.

## Work-unit commits (rama `worktree/dashboards`, base `a7c9797`, autorizado 2026-10-06)
Estrategia de cadena elegida: **`feature-branch-chain`**. Cada commit es un slice de PR; la creación de PRs queda pendiente de autorización de push.

| Commit | Unidad | Líneas autoradas | Evidencia acotada |
|---|---|---|---|
| `ad22cc3` | SC-01 backend | +728/−4 | `jest src/modules/storefront src/modules/audit` → 3 suites, 32/32 |
| `a01233f` | SC-02 página `/storefront` | +690 | `vitest run StorefrontSettingsPage.spec.tsx` → 13/13 |
| `5323eea` | SC-04 concesión rol/usuario | +530/−72 | `jest user-permissions.service.spec.ts` 9/9 · `vitest users` 11/11 |
| `5e4952b` | SC-03 consumidores + barra roja | +942/−76 | `vitest run src/features/storefront` → 23 archivos, 239/239 |
| (este commit) | SC-05 docs | — | `N/A` (docs; sin runtime) |

**RDD**: `gentle-ai` sigue ausente del PATH en este servidor → `review assess` **no disponible** en los 5 commits; no se infiere riesgo (tier no baja). Revisión pendiente de que el coordinador instale/exponga el CLI.

## Next step
- **Esperando al coordinador**: autorización de push + PRs encadenados (un PR por slice) o decisión de llevar la cadena a `main`. Aplicar migración y `db:seed` en el despliegue; añadir `/storefront` a la matriz de roles al aprobarse; reemplazar valores demo antes de producción.