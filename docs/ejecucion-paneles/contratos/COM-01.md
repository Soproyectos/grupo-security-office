# COM-01 — Habilitar Vendedor, Supervisor y Gestión comercial (paso: contrato)

**Fecha:** 2026-10-15 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/COM-01.md`; no modifica código, base de datos ni servicios activos (3000/5173/5432), no ejecuta commits y **no edita `estado.json` ni `tareas.json`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md:14` («esas propuestas quedan disponibles para la auditoría final, no se presentan como decisiones empresariales aprobadas»), este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.**

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa (comandos en §10). |
| **IP** | Informe o diseño previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `COM-01 contrato`, textual):** «Concretar paquetes/versiones y navegación según acciones individuales. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `BASE-04`. **OBS:** BASE-04 **no está aceptado en `estado.json`** (solo `BASE-01/inventario`; `decisions: {}`). Su implementación `backend` existe **en la copia aislada** `/home/soporte/office_ai/gs-tanda-01` (archivos `??` sin commit en su `git status`), por lo que la dependencia está **implementada_sin_auditar, no verificada**. Este contrato no verifica aceptaciones: ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (textuales):** (1) «Paquete no equivale a rol; selección muestra acciones/alcances concretos. No migrar cuentas existentes automáticamente.» (2) «Configurar web no pertenece a Comercial. Mi resumen/Agenda una sola vez fuera de paneles.» (3) «Preservar navegación de los otros paneles; no consolidar ramas por reemplazo masivo.»
- **Referencia de la ficha:** `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md`, sección «paquetes/versiones y navegación según acciones individuales» (árbol `:23-61`, combinación de paquetes/alcances `:136-142`, referencia técnica de acciones `:171-204`).
- **Aceptación del paso `contrato` (textuales):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.»

## 2. Estado actual (OBS)

### 2.1 `access-assignments.service.ts` — solo en la copia; BASE-04 hecho allí

**S3 carece del archivo** (`ls src/backend/src/common/security/` en S3: sin `access-assignments.service.ts`, sin `access-catalog.ts`, sin `data-scope.ts`). La copia `gs-tanda-01` lo contiene (548 líneas) con la superficie prevista por la ficha:

| Miembro | Ruta:línea (copia) | Comportamiento |
|---|---|---|
| `replaceSource` | `access-assignments.service.ts:129-183` | Alta/sustitución de **una fuente** y sus grants; transacción con `bumpVersion` |
| OCC `expectedVersion` | `:63-70` (`versionConflict`), `:374-397` (`bumpVersion`) | Versión desactualizada → **409** `access-version-conflict`, sin escribir nada |
| Idempotencia | `:140-144`, `:461-491` (`replayOperation`), `:175-181` | `idempotencyKey` + hash del payload; replay devuelve recibo; hash distinto → 409 `idempotency-conflict` |
| `removeSource` | `:189-241` | Retira **una** fuente; conserva grants de las demás (comentario `:186-188`) |
| `grantsForUser` / `sourcesFor` | `:91-102` / `:105-120` | Concesiones vigentes y procedencia por usuario (consumido hoy por `workflow.service.ts:189`) |
| `assertWritableIdentity` | `:243-262` | Solo Super Admin administra; identidad verificada de servidor |
| `validateGrants` | `:293-336` | Formato `apartado:acción`, acción existente, **`enabled:true` exigido**, alcance permitido, `resourceId` coherente, sin duplicados |
| `assertDependencies` | `:342-371` | Dependencias exigidas solo al **añadir**; retirar nunca falla |

`security.module.ts:32,42` provee/exporta el servicio. Esquema BASE-04 en la copia: `AccessState/AccessSource/AccessGrant/AccessOperation` (`schema.prisma:505,518,537,553`) + migración `20261015103000_add_action_access_concessions`.

**Discrepancia con la ficha (importante):** la ficha anticipaba `templates: ReadonlyMap<string, readonly AssignmentSelection[]>` en el constructor. **OBS: no está en el servicio actual** (constructor solo inyecta `PrismaService`, `:88`). Ese mapa existe en el cimiento UA `1aff701` (`access-assignment.service.ts:34,41`, singular; BASE-02 §3.5 **IP-UA**, catálogo de 94 acciones con IDs con punto y `enabled:false`), con test «keeps templates frozen». En el servicio BASE-04 la identidad de paquete se limita a `AccessSource.kind: 'manual'|'template'` + `templateId` + `catalogVersion` (`:20-25`, `:399-459`). **Los paquetes reutilizables aún no están modelados** (PROP §3 los define sobre esta base).

### 2.2 Sin endpoint HTTP de concesiones (OBS)

`rg -rn replaceSource src --glob '*.controller.ts'` en la copia → **vacío**. Tampoco hay controller para `removeSource`/`grantsForUser`/`sourcesFor` (solo consumo interno de `workflow.service.ts:189`). Existe el DTO `modules/users/dto/assign-access.dto.ts` (+spec) — writePath de BASE-04 implementado en la copia — pero **ninguna ruta lo expone**. Las rutas `assignments.controller.ts:59,72,80` (`@Permissions('assignments:manage')`) son el módulo legacy de niveles ACL por lista, no esta superficie.

### 2.3 Navegación de Comercial hoy (OBS — copia; estado real más reciente)

- `CommercialLayout.tsx:3-9` define 5 pestañas (`Productos`, `Listas`, `Clientes`, `Cotizaciones`, `Configuración`) y `:11` `VISIBLE_TABS = COMMERCIAL_TABS`: **sin ningún gating por rol o concesión**. El archivo es **idéntico en S3 y copia** (`diff -q` vacío).
- `App.tsx` (copia): `/commercial/*` cuelga de `ProtectedRoute` + `AdminLayout` (`:59-80`); la decisión de workspace es **por rol** (`lib/workspace.ts` `workspaceForRoles`: Vendedor solo → `/sales`, Supervisor sin gestión → `/supervisor`). Existe ruta `assignments` (`:78`) **sin pestaña** en el layout. El `App.tsx` de S3 **difiere** (p. ej. ruta de `AgendaCalendarPage`); la copia es el estado real a documentar.
- `features/users/components/` contiene solo `DashboardGrants.tsx` (S3 y copia).

### 2.4 `UserAccessAssignments.tsx` — FALTA (pieza de L)

**Confirmado ausente:** `find . -name 'UserAccessAssignments*' -not -path '*/node_modules/*'` → **vacío** en S3 y en la copia; el worktree L (controles granulares, `TANDA-COMPLETA.md`:38) es inaccesible desde este entorno. `tareas.json` lo declara **writePath de `COM-01 frontend`**: se **CREARÁ sobre la base de la copia** (integración, no reimplementación de L; documentar en la entrega qué fuente falta).

### 2.5 D3 hecho (OBS — copia); hueco D5 (OBS)

- **D3 (revalidación por petición):** `jwt.strategy.ts:69-107` exige que las concesiones dashboard (`dashboard:pack:`/`dashboard:block:` vía `isConcessionPermission`) reclamadas por el JWT sigan vigentes en servidor; token viejo → **401 sin cerrar la sesión del servidor** (comentario `:70-73` invoca COM-01: «revocar concesión ≠ matar sesión»). Cubre **solo** concesiones legacy de dashboard, no `AccessGrant` todavía.
- **D5 (guards/@Permissions) no está en writePaths de ninguna ficha** (recorrido completo de `tareas.json`). Estado en la copia: `@Permissions` solo en `products:publish` (`products.controller.ts:259-305`), `listas:publish` (`:329-349`), `listas:create|duplicate|archive|delete` (`listas.controller.ts:111,123,149,157,184,201`), `assignments:manage` (`assignments.controller.ts:59,72,80`) y `users:read` (`dashboard.controller.ts:66`). `PermissionsGuard` **permite endpoints sin metadatos** (`permissions.guard.ts:46-50`: sin `@Permissions` → `return true`); `workflow.controller.ts:21,33-34` y `listas.controller.ts:166` (unlink) lo confirman por comentario. **Consecuencia para el acceptance 2 («por URL/API»):** hoy está garantizado 403 solo en los endpoints decorados de la lista anterior; el resto queda **hasta D5**. No se afirma «todo protegido».

## 3. Paquetes y versiones (PROP)

**Modelo PROP:** un paquete es `{ id, nombre, catalogVersion, selections: AssignmentSelection[] }` donde cada selección es `{ actionId, scope, resourceId? }` concreta (formato del catálogo, §2.1). **Paquete ≠ rol** (regla 1): es una preselección que Super Admin revisa casilla a casilla antes de guardar (IP ADR-20261013:22; IP PANELES:32).

**Aplicar un paquete = `replaceSource`** con `source: { kind: 'template', templateId: <id-paquete>, reason }`, `grants` = la selección ajustada, `expectedVersion` del destinatario e `idempotencyKey` estable: el servicio ya aporta idempotencia, OCC y `catalogVersion` (§2.1). **Retirar = `removeSource` de esa fuente**; si otra fuente (manual u otro paquete) concede la misma acción, **se conserva** (§2.1 `:186-188`). **Sin migración automática de cuentas existentes** (regla 1): ningún usuario recibe paquetes por silencio; la comparación de acceso actual/propuesto y su migración con vuelta atrás queda pendiente (IP PANELES:68-70; decisión E5 §8). **Retiro total** de concesiones → la API revalida (patrón D3 §2.5, extensión a `AccessGrant` = E6) y la navegación hace refetch de concesiones **sin cerrar sesión**.

### 3.1 Los tres paquetes con sus acciones concretas

Solo acciones **habilitadas** en el catálogo de la copia (`access-catalog.ts`, `ACCESS_CATALOG_VERSION = 'base02-1'`, `:31`); `enabled:false` → `validateGrants` responde **400** (§2.1) y `resolveAccess` deniega (`data-scope.ts`, patrón `disabled-action`).

| Paquete | Apartado | Acciones concretas (alcance PROP) | Origen |
|---|---|---|---|
| **Vendedor** | Mis clientes y prospectos | `customers:read`, `customers:create`, `customers:edit` (own) | DISENO:28-31,178; BASE-02 §3.1; catálogo `:67-69` |
| | Mis cotizaciones | `quotes:read`, `quotes:create`, `quotes:edit`, `quotes:status` (own) | DISENO:32-35,179; catálogo `:70-73` |
| | Consulta del catálogo | `products:read` (list/product/global), `listas:read` (list/global) | DISENO:65,180; catálogo `:104,114` — **`prices:read` NO existe en el catálogo** (OBS, E3 §8) |
| | Mi agenda | `activities:read`, `activities:create`, `activities:complete` (own) | DISENO:42-45,186; catálogo `:82-84` |
| | Metas (lectura) | `targets:read` (own) | DISENO:38,111,181; catálogo `:75` |
| | Promociones internas | `commercialPromotions:read` (own) | DISENO:46-47,109,187; catálogo `:85` |
| | *Pendientes (no asignables hoy)* | `erpSales:read`; `stockRequests:read|create|edit|cancel` | DISENO:36-41; catálogo `:74,76-79` **`enabled:false`** (B1/B2) |
| **Supervisor comercial** | Resumen/consulta del equipo | `teamInsights:read` (team) | DISENO:49,117,177; BASE-02 §3.2; catálogo `:88` |
| | Clientes y cotizaciones del equipo | `customers:read`, `quotes:read` (team) — lectura **no** amplía edición (regla BASE-04) | DISENO:50-51,118; catálogo |
| | Agenda del equipo | `activities:read` (team), `activities:assign` (team; depende de `activities:read`) | DISENO:54,120,186; catálogo `:89` |
| | Metas del equipo | `targets:read` (team) | DISENO:55,121; catálogo |
| | *Pendientes* | `erpSales:read`, `stockRequests:read` (team) | DISENO:52-53 **`enabled:false`** |
| **Gestión comercial** | Cartera | `customers:reassign` (team/global; depende de `customers:read`) | DISENO:57,129,188; catálogo `:92` |
| | Metas | `targets:edit` (depende de `targets:read`) | DISENO:58,130,181; catálogo `:93` |
| | Avisos internos | `commercialPromotions:create|edit|publish|withdraw` (dependen de `:read`) | DISENO:59,131,187; catálogo `:94-97` |
| | *Pendientes* | `stockRequests:import|export`; `commercialSettings:read|edit` | DISENO:60,132,192-193 **`enabled:false`** (B2; módulo inexistente) |

- **Combinación de paquetes:** las concesiones son por acción+alcance (data-scope evalúa **por acción**, nunca suma global; ficha BASE-04 regla 1). Ejemplo del diseño (`DISENO:138`): Vendedor (own) + Supervisor (team) → lee equipo, solo edita lo propio. Los recursos con alcance `list|product` exigen `resourceId` explícito (`validateGrants` `:319-323`).
- **Dependencias visibles:** el catálogo las declara (`access-catalog.ts:26`) y `assertDependencies` las exige al añadir (`:342-371`); la pantalla las muestra (IP PANELES:30 «si editar requiere ver, la pantalla lo explica»).
- **Navegación del paquete:** cada paquete define además las pestañas de Comercial que sus acciones habilitan (§4); aplicar un paquete no toca el workspace por rol de los otros paneles.

## 4. Navegación por acciones individuales (PROP)

- **Gating por identidad + concesiones**, reutilizando el patrón `agenda-access.ts` (copia, BASE-03): hoy decide por **rol** con `PUNTO DE EXTENSIÓN (COM-01)` explícito (`:7-16`: sustituir test de rol por `activities:read`/`activities:assign` con alcance); las queries consumidoras usan `enabled:false` para **no llamar** la API sin permiso (`:37-42`). Para Comercial: `commercialAccess(user, grants)` deriva pestañas visibles a partir de `grantsForUser` (o del paquete aplicado); `CommercialLayout` filtra `COMMERCIAL_TABS` con ese criterio (hoy sin filtrar, §2.3) y `App.tsx` protege rutas con el mismo criterio.
- **«Sin paneles asignados»:** usuario nuevo sin concesiones → solo Inicio y Mi cuenta; la vista Comercial muestra el estado vacío **sin datos internos** (IP PANELES:24-25); las queries de pestañas quedan `enabled:false`.
- **Mi resumen / Agenda y tareas fuera de paneles, una sola vez** (regla 2; IP DISENO-COMERCIAL:21): no se crean pestañas duplicadas dentro de Comercial; sus acciones (`dashboard:read`, `commercialInsights:read`, agenda personal) viven en sus herramientas personales y **no se re-asignan aquí**.
- **Preservar los otros paneles** (regla 3): los cambios se concentran en los writePaths de `COM-01 frontend` (`CommercialLayout`, `AdminLayout`, `App.tsx` + specs); `/sales`, `/supervisor` y la tienda no se consolidan ni se reemplazan por ramas nuevas.
- **Alcance del acceptance 2 «por URL/API» hoy vs D5:** hoy la navegación sin asignaciones evita llamar APIs (cliente) y el servidor responde 403 **solo** en los endpoints con `@Permissions` (lista §2.5); el resto de la superficie se abre por el vacío del guard (`permissions.guard.ts:46-50`). **Hasta D5 no se puede afirmar que toda URL/API quede protegida**; el contrato lo declara explícitamente en lugar de prometer cobertura total.

## 5. Los 3 casos de paquete de la ficha y su acreditación

| # | Caso (ficha, textual) | Cómo se acreditará (PROP; no es evidencia todavía) |
|---|---|---|
| 5.1 | «Dos vendedores mismo rol con acciones distintas.» | PostgreSQL desechable con fixtures ficticios: A y B con el mismo rol; aplicar paquete Vendedor completo a A y una selección recortada (p. ej. sin `customers:edit`) a B vía `replaceSource`. Asertar `grantsForUser` distinto, `resolveAccess` → allow/deny por acción, `sourcesFor` con `kind:'template'`+`templateId`, y pestañas distintas en la interfaz |
| 5.2 | «Sin paquetes no hay datos internos por URL/API; propia cuenta sigue disponible.» | Usuario sin `AccessSource`: `resolveAccess` → `deny('no-covering-grant')`; endpoint decorado → **403**; pestañas vacías y queries `enabled:false` (sin red). Propia cuenta: excepción `self-account` del resolver (`data-scope.ts`) y cuenta propia en `/mi-cuenta`. **Hueco D5:** endpoints sin `@Permissions` no acreditan 403 hoy (§2.5) — se acredita lo garantizado y se deja constancia |
| 5.3 | «Revocar una acción actualiza navegación y API sin cerrar sesión.» | (a) Retiro parcial: `removeSource` de una fuente cuando otra concede la misma acción → permiso **conservado**; (b) retiro total → endpoint decorado rechaza con la sesión viva (patrón D3: 401/403 **sin** cerrar sesión del servidor, `jwt.strategy.ts:69-107` como precedente; extensión a `AccessGrant` = E6) y la navegación, tras refetch de concesiones, **oculta la pestaña sin re-login** |

## 6. Errores (OBS — patrón existente en el servicio y guards de la copia)

| Código | Cuándo | Evidencia |
|---|---|---|
| 400 | `expectedVersion` no entero; `actionId` con formato inválido/inexistente/**deshabilitada**; alcance no permitido; `resourceId` requerido o prohibido; concesión duplicada; dependencia faltante al añadir | `access-assignments.service.ts:274-280,293-336,363-369` |
| 401 | Identidad/sesión inválidas (escritura o resolución); JWT con concesiones retiradas (D3) | `:243-253`; `data-scope.ts` (identidad); `jwt.strategy.ts:103-106` |
| 403 | Actor no Super Admin al administrar concesiones; endpoint decorado sin el permiso requerido (no-Super-Admin) | `access-assignments.service.ts:257-261`; `permissions.guard.ts:52-67` |
| 404 | Usuario destinatario inexistente; fuente que no pertenece al usuario | `:282-289`, `:200-205`, `:412-415` |
| 409 | OCC `access-version-conflict`; `catalog-version-conflict` (catálogo desactualizado); `idempotency-conflict` (replay con hash distinto o en curso) | `:63-70`, `:264-271`, `:175-181`, `:476-488` |

## 7. Incrementos posteriores registrados (fichas, textuales) y solape

**Aceptación idéntica en ambos pasos (ficha, textual):** «Dos vendedores mismo rol con acciones distintas.» + «Sin paquetes no hay datos internos por URL/API; propia cuenta sigue disponible.» + «Revocar una acción actualiza navegación y API sin cerrar sesión.»

| Incremento | Depende de | Objetivo (ficha) | Archivos (ficha) |
|---|---|---|---|
| **COM-01 `backend`** | BASE-04 | «Completar el alcance de servidor de este paso y sus pruebas. Si no cabe en una entrega revisable, el coordinador registra todos los subpasos antes de delegar código.» | `common/security/access-assignments.service.ts` + `.spec.ts`, `access-catalog.ts` + `.spec.ts`, `prisma/schema.prisma`, `prisma/migrations/**` |
| **COM-01 `frontend`** | BASE-04 | «Conectar la interfaz al contrato de servidor auditado y verificar su recorrido; sin cambiar reglas desde el navegador.» | `features/users/components/UserAccessAssignments.tsx` + `.spec.tsx`, `components/layout/CommercialLayout.tsx` + `.spec.tsx`, `AdminLayout.tsx` + `.spec.tsx`, `App.tsx` + `.spec.tsx` |

**Solape con COM-02…COM-09 (writePaths de sus fichas, revisados con `preparar-tanda.mjs --list`, sin escribirlos):**

| Archivo compartido con COM-01 | Fichas que lo tocan |
|---|---|
| `common/security/access-catalog.ts` + spec | COM-02 `backend`, COM-03 `backend`, COM-06 `backend-solicitudes/atencion/excel`, COM-07 `backend-sincronizacion/indicadores`, COM-08 `backend`, COM-09 `backend` |
| `prisma/schema.prisma` + `migrations/**` | COM-06, COM-07, COM-08 (sus pasos backend-*) |
| `frontend/src/App.tsx` + spec | COM-06 `frontend-*`, COM-07 `frontend-*`, COM-08 `frontend` |
| `modules/commercial/quotes/**` | COM-03 `backend`, COM-09 `backend` (**no** COM-01) |
| `access-assignments.service.ts`, `CommercialLayout`, `AdminLayout`, `UserAccessAssignments` | **sin solape**: solo COM-01 (el servicio lo creó BASE-04) |

**Cadena:** COM-02…COM-09 consumen acciones del catálogo que este contrato fija; habilitar las acciones `enabled:false` (§3.1) exige resolver B1 (Yéminus) y B2 (Excel «Pedidos»). **PROP:** el catálogo y el esquema de COM-01 dejan las acciones preparadas **sin habilitar** lo que siga bloqueado.

## 8. Fuentes leídas con estado y decisiones pendientes

| Fuente | Marca | Aporte |
|---|---|---|
| `gs-tanda-01/.../security/access-assignments.service.ts` (548) | **OBS — solo en copia** | §2.1: `replaceSource`/`removeSource`/OCC/idempotencia/validaciones |
| `gs-tanda-01/.../security/access-catalog.ts` (149) | **OBS — solo en copia** | §3.1: acciones, scopes, dependencias, `enabled:false`, `base02-1` |
| `gs-tanda-01/.../security/data-scope.ts` (164) | **OBS — solo en copia** | Resolver por acción; excepciones Super Admin/`self-account`; `disabled-action` |
| `gs-tanda-01/.../auth/jwt.strategy.ts:69-107` | **OBS — solo en copia** | D3: revalidación por petición, 401 sin cerrar sesión |
| `gs-tanda-01/.../guards/permissions.guard.ts:46-50` | **OBS — solo en copia** | Endpoints sin metadatos pasan (hueco D5) |
| `gs-tanda-01/.../CommercialLayout.tsx` (44, idéntico a S3) | **OBS** | §2.3: 5 pestañas sin gating |
| `gs-tanda-01/.../App.tsx` (120; S3 difiere) | **OBS** | §2.3: workspace por rol; rutas `/commercial/*` |
| `gs-tanda-01/.../agenda/agenda-access.ts` (62) | **OBS** | Patrón de gating + punto de extensión COM-01 |
| `src/frontend/src/features/users/components/UserAccessAssignments.tsx` | **FALTA** (worktree L inaccesible; find vacío S3+copia) | §2.4: se creará; pieza de L no integrada |
| `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md` (231) | **IP** | §3.1: acciones por hijo; `:136-142` combinación; `:171-204` IDs |
| `docs/PANELES-Y-PERMISOS.md` | **IP** (acuerdo 2026-10-08) | §4: sin paneles, refetch sin sesión, dos fuentes, paquetes muestran acciones |
| `contratos/BASE-02.md` §3.1-§3.3, §3.5, §11 | **IP/OBS** | Acciones por hijo; catálogo UA; D2, B1-B4 |
| `contratos/CAT-01.md` (228) | **IP** de esta tanda | Patrón de estructura §1-§12 y marcas |
| cimiento UA commit `1aff701` (`access-assignment.service.ts:34,41`) | **IP-UA** | `templates`/`AssignmentSelection` (§2.1 discrepancia) |
| `estado.json` | **OBS** | Solo `BASE-01/inventario`; `decisions: {}` |
| `tareas.json` + `preparar-tanda.mjs COM-01 contrato` | **OBS** | Ficha canónica y writePaths de COM-02…09 |

| # | Decisión o bloqueo | Afecta | Estado |
|---|---|---|---|
| D2 | Catálogo propio `apartado:acción` (ya adoptado en la copia) vs catálogo UA con puntos | §3.1, catálogo | **Herida de BASE-02 §11 — confirmación del coordinador pendiente** |
| D5 | Extender `@Permissions`/`PermissionsGuard` a toda la superficie; no está en writePaths de ninguna ficha | acceptance 2 «por URL/API», §2.5, §4 | **Pendiente — decisión del coordinador** |
| E1 | **Superficie HTTP de concesiones**: dónde vive el controller de `replaceSource`/`removeSource`/`grantsForUser` (el writePath `backend` de COM-01 **no incluye** controller) | §2.2, casos 5.1-5.3 | **Pendiente — decisión de implementación** |
| E2 | **Modelo de paquete en servidor**: reintroducir el mapa `templates` del UA vs catálogo const vs tabla `AccessPackage` | §2.1, §3 | **Pendiente** |
| E3 | `prices:read` citado en DISENO:180 pero **ausente del catálogo** (OBS) | paquete Vendedor | **Pendiente** |
| E4 | Habilitar `enabled:false`: `erpSales:read` (B1), `stockRequests:*` (B2), `commercialSettings:*` (módulo inexistente), `listas:link/unlink` (CAT-01 C4) | §3.1 | **Bloqueo heredado B1/B2** |
| E5 | Migración de cuentas existentes: comparación actual/propuesto + vuelta atrás (regla 1 prohíbe automática) | §3 | **Pendiente** |
| E6 | Revalidación de `AccessGrant` por petición (extender D3 más allá de dashboard packs) y refetch de concesiones en frontend | acceptance 3, §4 | **Pendiente** |
| B1-B4 | Heredadas de BASE-02 §11 (Yéminus, Excel «Pedidos», descuentos, preview) | no cambian aquí | **Pendientes** |

## 9. Criterios de aceptación del paso (ficha, textuales)

1. ✅ «Contrato consistente con dependencias y decisiones pendientes explícitas.» — §1 declara `dependsOn: BASE-04` **implementado en copia, no aceptado en `estado.json`**; §8 enumera D2, D5, E1-E6 y B1-B4.
2. ✅ «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.» — §7 registra `COM-01 backend` y `COM-01 frontend` con sus fichas y el solape con COM-02…COM-09.

**Advertencia de modalidad (TANDA-COMPLETA:14):** todo lo marcado **PROP** es una propuesta para la **auditoría final única** del coordinador; no sustituye `estado.json`, no modifica aceptaciones y no autoriza implementación, migraciones ni despliegues.

## 10. Evidencia reproducible

Comandos desde la raíz del repo (solo lectura):

```bash
git status --porcelain; git rev-parse --short HEAD            # baseline S3: 32 líneas
node docs/ejecucion-paneles/preparar-tanda.mjs COM-01 contrato
node docs/ejecucion-paneles/preparar-tanda.mjs --list         # writePaths COM-02…09 (§7)
test -f src/backend/src/common/security/access-assignments.service.ts || echo SOLO-EN-COPIA
ls /home/soporte/office_ai/gs-tanda-01/src/backend/src/common/security/
rg -n 'replaceSource|removeSource|grantsForUser' /home/soporte/office_ai/gs-tanda-01/src --glob '*.controller.ts'  # vacío
rg -n '@Permissions' /home/soporte/office_ai/gs-tanda-01/src/backend/src -g '*.controller.ts'
rg -n 'AssignmentSelection|templates' /home/soporte/office_ai/gs-tanda-01/src/backend/src/common/security/access-assignments.service.ts  # vacío
git -C /home/soporte/office_ai/gs-tanda-01 grep -n 'AssignmentSelection' 1aff701 -- '*.ts'   # UA: access-assignment.*
find . -name 'UserAccessAssignments*' -not -path '*/node_modules/*'                          # vacío
diff -q src/frontend/src/components/layout/CommercialLayout.tsx /home/soporte/office_ai/gs-tanda-01/src/frontend/src/components/layout/CommercialLayout.tsx
```

- **No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP con permisos, pruebas con PostgreSQL desechable, consulta de datos reales. §5 lista las pruebas **previstas**, no realizadas.

## 11. Riesgos de este contrato

- Aplicar paquetes sin endpoint (E1) y sin revalidación de `AccessGrant` (E6) deja el acceptance 3 solo acreditado por el precedente D3 de dashboard, no por la superficie nueva.
- Declarar paquetes que incluyan acciones `enabled:false` produciría asignaciones que `validateGrants` rechaza con 400 al aplicarlas (§3.1).
- Aprobar la navegación sin fijar D5 mantiene que «sin paquetes no hay datos por URL» sea **solo parcialmente** cierto en servidor (§2.5, §4).
- El solape de `access-catalog.ts` y `App.tsx` con COM-02…COM-08 (§7) exige que COM-01 deje el catálogo y las rutas en un estado que esas fichas puedan ampliar sin reescribir.
