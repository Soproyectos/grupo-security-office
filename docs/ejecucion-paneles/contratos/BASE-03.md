# BASE-03 — Integrar una Agenda y tareas compartida (paso: contrato)

**Fecha:** 2026-10-15 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/BASE-03.md`; no modifica código, base de datos ni servicios activos, no ejecuta commits y **no edita `estado.json` ni `tareas.json`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md`, este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.** Todo lo marcado **PROP** es propuesta de esta entrega.

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa en este checkout (comandos en §11). |
| **IP** | Informe o diseño previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `BASE-03 contrato`, textual):** «Concretar recuperar contrato de agenda S3 y separar funciones propias/de equipo. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `BASE-01`, `BASE-02`. Este documento **no verifica la aceptación** de ninguno de los dos: ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (literales):** (1) «Primero comparar el módulo S3 documentado; no inventar compatibilidad ni crear una agenda por panel.» (2) «Separar creador, asignado y actor del cambio. Propias y equipo son incrementos separados si el diff crece.» (3) «Tarea/enlace no concede acceso al recurso; historial no se borra al completar.»
- **Referencia de la ficha:** `docs/COMPARACION-10-PANELES-2026-10-13.md`, sección «recuperar contrato de agenda S3 y separar funciones propias/de equipo».
- **requiredDecisions del paso contrato (ficha):** `[]` (vacío). **OBS (tareas.json):** los seis pasos de implementación de este paquete sí declaran `requiredDecisions: ["agenda-base"]` y `estado.json.decisions` está vacío — la decisión queda **pendiente** (§8 D1).
- **Criterios de aceptación del paso:** §10 (textuales de la ficha).

## 2. Alcance de este contrato

| Dimensión | Se fija aquí (PROP) | Queda fuera de este paso |
|---|---|---|
| Campos | Campos de actividad/solicitud del contrato S3 y campos que el diseño exige añadir (prioridad, comentarios, enlaces, estados) (§3, §4) | Esquema SQL y migraciones (pasos `backend-*`) |
| Rutas | Rutas y endpoints actuales de `api/team-workflow` y su estado (§3) | Crear/mover/renombrar endpoints |
| Acciones | Acciones `activities:*` por persona/equipo, sin casilla genérica (§4) | Habilitar acciones en guards/catálogo (COM-01) |
| Alcance | Criterio de pertenencia propio/equipo hoy (jerarquía) y su destino por concesión (§5) | Resolver alcance efectivo por acción (BASE-04) |
| Errores | Semántica HTTP existente y propuesta (§6) | Implementar respuestas nuevas |
| Pruebas | Matriz prevista para los seis incrementos (§6, §9) | Ejecutar suites (solo comandos en §11) |

**Prohibiciones de la ficha (§1) que este paso cumple:** no se inventa compatibilidad con un módulo local inexistente, no se crea una agenda por panel, no se modifica el modelo ni el frontend.

## 3. Contrato de agenda en S3 hoy (OBS, inventario obligatorio)

**Módulo:** `src/backend/src/modules/team-workflow/` — **único** módulo de agenda/solicitudes en S3. La ficha de COM-08 afirma (IP): «Actualmente no existe este módulo en el worktree local.» **OBS propio:** confirmado en S3: `modules/promotions/` y `modules/team-workflow/` existen; no hay segunda agenda.

### 3.1 Rutas y control de acceso (OBS `workflow.controller.ts`, 20 líneas)

| Método y ruta | Rol exigido | Servicio |
|---|---|---|
| `GET /api/team-workflow/sellers` | Vendedor, Supervisor, Super Admin | `sellers` |
| `GET /api/team-workflow/activities` | Vendedor, Supervisor, Super Admin | `activities` |
| `POST /api/team-workflow/activities` | Vendedor, Supervisor, Super Admin | `createActivity` |
| `PATCH /api/team-workflow/activities/:id/complete` | Vendedor, Supervisor, Super Admin | `complete` |
| `GET /api/team-workflow/requests` | Supervisor, Super Admin | `requests` |
| `POST /api/team-workflow/requests` | Supervisor | `createRequest` |
| `PATCH /api/team-workflow/requests/:id/review` | Super Admin | `review` |

Todas las rutas usan `JwtAuthGuard` + `RolesGuard`; **ninguna** lleva `@Permissions` (**OBS**: el único `@Permissions` de controllers no-AI es `products:publish`, `listas:*` y `assignments:manage` — verificado con `rg -n "@Permissions\(" src/backend/src`).

### 3.2 Contratos de datos (OBS `workflow.controller.ts` DTOs, `schema.prisma:896-930`)

**Actividad (`TeamActivity`):** `id` (uuid), `title` (≤500), `kind` (`CALL|VISIT|FOLLOW_UP`), `startsAt` (ISO estricto con zona), `status` (`PENDING` por defecto, `COMPLETED`), `assigneeId`, `creatorId`, `createdAt`, `completedAt`; índice `(assigneeId, startsAt)`. **No existen** `updatedAt`, `cancelledAt`, `priority`, comentarios ni enlaces a recursos.

**Solicitud (`TeamRequest`):** `id`, `kind` (`INCORPORATION|ACCOUNT|REASSIGNMENT`), `detail` (≤2000), `status` (`PENDING|APPROVED|REJECTED`), `creatorId`, `reviewerId`, `reviewedAt`, `response` (≤2000), `createdAt`.

### 3.3 Lógica de pertenencia (OBS `workflow.service.ts`)

- `sellers`: Super Admin → todos los vendedores activos; Supervisor → sus subordinados (`HierarchyService.getSubordinateIds`); otro rol → él mismo. **El alcance es jerárquico por rol, no por concesión.**
- `createActivity`: si `assigneeId` no pertenece al conjunto → `403 ForbiddenException('Solo puedes asignar actividades dentro de tu equipo')` (línea 20).
- `activities`: filtra por `assigneeId ∈ sellers`, `take: 1000`, incluye `assignee` y `creator`.
- `complete`: busca por `id`; si no existe → `404 NotFoundException('Actividad no encontrada')`; si el asignado no está en el conjunto → `403`; `updateMany` solo si `status: PENDING`; `count === 0` → `409 ConflictException('La actividad ya fue completada')` (línea 29). **Idempotencia ya cubierta por el `updateMany` condicional.**
- `requests`: Super Admin ve todas; Supervisor solo las propias. `review` solo Super Admin; `updateMany` condicionado a `PENDING` (línea 39).
- **Sin auditoría:** `rg -n "audit|Audit" src/backend/src/modules/team-workflow/` → sin coincidencias. Contraste (OBS): `promotions.service.ts` sí escribe `auditLog.create` en create/update/archive (líneas 71-129).
- **Sin cancelar/editar:** no hay endpoint de cancelación ni de reprogramación; el único cambio de estado es `complete`.

### 3.4 Frontend actual (OBS)

- `AgendaCalendarPage` vive en `src/frontend/src/features/supervisor/AgendaCalendarPage.tsx` (112 líneas) y **comparte ruta** `/sales/agenda` y `/supervisor/agenda` (`App.tsx:95,101`); decide por rol (`supervisor = roles Supervisor|Super Admin`, línea 20) entre «Mi agenda» y «Agenda del equipo» en la misma página.
- `POST /activities` envía `assigneeId: supervisor ? assignee : user.id` (línea 56); `PATCH /activities/:id/complete` (línea 66). Vista `calendar|tasks` (línea 23) con los **mismos datos** («Las tareas y el calendario comparten las mismas actividades», línea 91).
- `TeamWorkflowPage` (36 líneas) atiende `/team-requests` (admin) y `/supervisor/requests`.
- **Discrepancia de ruta (OBS):** la ficha de implementación escribe `features/agenda/**` (directorio **inexistente** hoy); la página actual está en `features/supervisor/`. El paso `frontend-*` decidirá mover o duplicar; este contrato lo registra como decisión de implementación, no como hecho.

### 3.5 Lo que el diseño exige y S3 no tiene (IP + OBS)

| Requisito del diseño (IP) | Estado en S3 |
|---|---|
| «Agenda y tareas» como herramienta personal independiente, fuera de los paneles (PANELES:19,24; DISENO-CATÁLOGO §3) | Existe solo como pestaña dentro de Vendedor/Supervisor (**OBS** rutas anteriores) |
| Estados `Pendiente/En curso/Completada/Cancelada`; prioridad; comentarios; enlaces a lista/producto/importación/revisión (DISENO-CATÁLOGO §3) | Solo `PENDING/COMPLETED`; sin prioridad/comentarios/enlaces (**OBS** §3.2) |
| «Cambiar fecha o reabrir queda registrado» (DISENO-CATÁLOGO §3) | Sin endpoint de edición; sin historial de cambios (**OBS** §3.3) |
| Reasignar actividad con permiso propio (DISENO-COMERCIAL:107,119) | Asignar solo al crear; sin reasignación posterior (**OBS**) |
| Vincular tarea a recurso sin conceder acceso (**OBS** no existe; IP DISENO-CATÁLOGO §3) | Sin modelo de vínculo |
| Incidencias convertidas en tareas con deduplicación producto+regla+revisión (DISENO-COMERCIAL:129-130) | `TeamRequest` es solo revisión aprobada/rechazada; sin conversión a actividad |
| Reutilizar el módulo S3 y sustituir dependencias del rol por acciones/alcances; completar auditoría (DISENO-COMERCIAL:150) | Rol único `@Permissions` ausente; sin `AuditService` (**OBS** §3.3) |

## 4. Acciones y roles: separación creador / asignado / actor (PROP)

**Regla de la ficha (§1, regla 2):** «Separar creador, asignado y actor del cambio.» **OBS:** el modelo ya distingue `creatorId` y `assigneeId`, y la UI lo muestra («Creada por el vendedor» / «Asignada por …», `AgendaCalendarPage:102`); el **actor** de la última modificación **no** se registra (**OBS**: sin `updatedBy`/historial).

| Acción (ID propuesto) | Quién la necesita | Alcance | Nota |
|---|---|---|---|
| `activities:read` | Vendedor (propias), Supervisor (equipo), Gestión | `own` / `team` | Lee lo asignado propio o del equipo |
| `activities:create` | Vendedor, Supervisor | `own` / `team` | Crea y fija `creatorId`; asignar fuera del equipo se rechaza |
| `activities:assign` | Supervisor, Gestión | `team` | Reasignar `assigneeId` **sin** conceder edición del contenido ajeno |
| `activities:complete` | Vendedor (propias), Supervisor (equipo) | `own` / `team` | «Completar ajena solo con acción específica» (IP DISENO-COMERCIAL:186) |
| `activities:edit`, `activities:cancel` | Ampliaciones pendientes | `own`/`team` | **IP** DISENO-COMERCIAL:186: «cambiar fecha o cancelar quedan como mejoras pendientes»; no se habilitan en este paquete sin decisión |

**Fuera de este contrato:** permisos de catálogo/precios. «Su existencia no concede acceso a productos/listas enlazados ni a datos del equipo» (IP PANELES:24).

## 5. Separación propias / equipo (PROP)

| Dimensión | Propias (incrementos `*-propias`) | Equipo (incrementos `*-equipo`) |
|---|---|---|
| Quién | Cualquier usuario con `activities:*` en `own` | Solo quien tiene `activities:*` con alcance `team` |
| Datos | Solo donde `assigneeId = yo` | Subordinados jerárquicos **hoy**; por concesión `team` **mañana** (BASE-04) |
| Frontend | Una sola Agenda personal (`features/agenda/**` propuesto por ficha) | Sección «Agenda del equipo» dentro de la misma herramienta, sin pestaña duplicada por panel (ficha regla 1) |
| Regla dura | Leer equipo no amplía editar equipo (ficha BASE-04/§5; **IP** DISENO-COMERCIAL:138) | Asignar no concede completar ajenas (ficha caso 2) |

«Propias y equipo son incrementos separados si el diff crece» (ficha regla 2): los pasos están separados por diseño; si el diff de un paso crece, se parte antes de delegar (no se fusionan backend-propias con backend-equipo).

## 6. Casos de paquete de la ficha (obligatorios)

| # | Caso (ficha, textual) | Contrato previsto (PROP) | Estado observado |
|---|---|---|---|
| 6.1 | «Usuario A no lee/completa/reasigna actividad B por ID.» | Petición por `id` ajeno: `404` (ocultar existencia) o `403` según documentación del recurso; reasignación exige `activities:assign` | **OBS:** `complete` ya filtra por conjunto propio/equipo y devuelve `404` si no existe y `403` si no pertenece (`workflow.service.ts:25-27`); **no existe** reasignación |
| 6.2 | «Asignar fuera del equipo se rechaza; asignar no concede completar ajenas.» | `POST /activities` con `assigneeId` fuera del alcance → `403`; el permiso `activities:assign` no implica `activities:complete` sobre el asignado | **OBS parcial:** el rechazo existe (línea 20) pero está anclado al **rol**, no a una concesión; `complete` reutiliza el mismo conjunto de vendedores que `create` — **gap**: hoy «poder asignar» y «poder completar» no son acciones separadas |
| 6.3 | «Repetir completar no duplica evento; recurso revocado oculta sus detalles.» | Reintento → `409` sin segundo evento; recurso enlazado cuya concesión se retiró → la actividad conserva trazabilidad pero oculta el detalle del recurso | **OBS parcial:** el `409` ya existe (línea 29); el ocultamiento por revocación **no** existe (sin modelo de vínculo ni chequeo de concesión al leer) — **gap** |

## 7. Errores y pruebas previstas (PROP)

**Semántica de error (existente OBS + propuesta PROP):**

| Código | Cuándo | Base |
|---|---|---|
| 401 | Sin JWT o sesión revocada | **OBS** `jwt.strategy.ts:62,68` |
| 403 | Asignación/completado fuera del equipo o sin la acción | **OBS** `workflow.service.ts:20,27` |
| 404 | Actividad inexistente o ajena cuando su existencia no debe revelarse | **OBS** `workflow.service.ts:25` |
| 409 | Completar dos veces / revisar solicitud ya resuelta | **OBS** `workflow.service.ts:29,39` |
| 400 | Entrada inválida (título, `startsAt` sin zona) | **OBS** DTO (`IsISO8601({strict:true})`) |

**Pruebas previstas (no ejecutadas en este paso):** los seis paquetes de la ficha (§9) más: actividad de A invisible/inaccesible para B por URL directa; reasignar sin `activities:assign` → denegado; completar por doble clic → un solo evento y `409` en el segundo; actividad con enlace a recurso revocado → el enlace oculta detalles; recarga tras completar no duplica filas; sin `@Permissions` en endpoints nuevos → prueba de regresión que el rol no basta cuando haya concesiones. Comandos de paquete: `npm test` (backend) y `npm run test` (frontend), **no ejecutados aquí**.

## 8. Decisiones pendientes y bloqueos

| # | Decisión o bloqueo | Afecta a | Estado |
|---|---|---|---|
| D1 | **`agenda-base`** (`requiredDecisions` de los seis pasos de implementación): definir la base sobre la que se reconstruye la agenda (modelo, alcance por concesión, relación con `TeamActivity`) | los 6 incrementos | **Pendiente — coordinador.** `estado.json.decisions` vacío (**OBS**); este contrato no la toma |
| D2 | Mover `AgendaCalendarPage` a `features/agenda/**` (ficha) o conservar `features/supervisor/` | `frontend-*` | **Pendiente — implementación** (§3.4) |
| D3 | Ampliar estados (`En curso`, `Cancelada`), prioridad, comentarios y enlaces: modelo nuevo vs extender `TeamActivity` | `backend-*` | **Pendiente — decisión D1** (§3.5) |
| D4 | Auditoría de agenda (hoy ausente): eventos por crear/completar/reasignar, con actor | `backend-*` | **Pendiente** (§3.3; patrón existente en `promotions.service.ts`) |
| D5 | Rol vs concesión: sustituir `@Roles` por `@Permissions('activities:*')` sin romper usuarios sin concesiones (mecanismo transitorio documentado en BASE-01 §8: «permiso implícito por rol para evitar regresión») | `backend-*` | **Pendiente** (§3.1; **IP** PANELES:25) |
| B1 | Sin `AccessGrant`/catálogo habilitado en S3, el alcance `own/team` por concesión depende de BASE-04/COM-01 | `backend-equipo`, `frontend-equipo` | **Bloqueo de dependencia** (BASE-02 §8) |
| D6 | Conversión de incidencias en tareas (deduplicación producto+regla+revisión) y su relación con `TeamRequest` | `backend-vinculos` | **Pendiente** (IP DISENO-COMERCIAL:129-130) |

## 9. Incrementos de implementación posteriores (registrados antes de delegar código)

Datos de las fichas (`node docs/ejecucion-paneles/preparar-tanda.mjs BASE-03 <paso>`). **Aceptación de todos los pasos `contrato` (textual):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.» `QA-01` no aparece: reservado al coordinador (**OBS**: `preparar-tanda.mjs QA-01` → «La auditoría final está reservada al coordinador.»). **OBS:** ningún paquete de la tanda declara `dependsOn: BASE-03` (recorrido de las 30 fichas); el único consumidor posterior es `QA-01`, que sí lo incluye.

| Paso | Objetivo (ficha) | Archivos (ficha) | Aceptación (ficha) |
|---|---|---|---|
| `backend-propias` | Integrar actividades propias e historial del contrato S3 reconciliado | `modules/team-workflow/**`, `schema.prisma`, `migrations/**`, `app.module.ts`, `app.module.spec.ts`, `security/access-catalog.ts`, `access-catalog.spec.ts` | Leer/crear/completar propias; ID ajeno denegado; reintento no duplica |
| `frontend-propias` | Conectar una Agenda personal única e historial | `features/agenda/**`, `services/agenda.service.ts`, `agenda.service.spec.ts`, `App.tsx`, `App.spec.tsx`, `AdminLayout.tsx`, `AdminLayout.spec.tsx` | Crear/completar/recargar conserva actividades sin entradas duplicadas por panel |
| `backend-equipo` | Añadir consulta/asignación de equipo con concesiones distintas | (mismos que `backend-propias`) | Fuera del equipo se rechaza; asignar no concede completar ajenas |
| `frontend-equipo` | Conectar consulta/asignación de equipo según permiso | (mismos que `frontend-propias`) | Solo Agenda propia no muestra equipo; botones y API concuerdan |
| `backend-vinculos` | Proteger recursos enlazados y conversión explícita de incidencias en tareas | (mismos que `backend-propias`) | Revocación oculta detalles; conversión explícita deduplica producto+regla+revisión |
| `frontend-vinculos` | Mostrar enlaces/tareas relacionadas con acceso vigente | (mismos que `frontend-propias`) | Un enlace no revela recurso ajeno ni concede permisos |

**Orden propuesto (PROP):** `backend-propias → frontend-propias → backend-equipo → frontend-equipo → backend-vinculos → frontend-vinculos`, con B1 (§8) como condición de los pasos de equipo y D1 (§8) previa a todos.

## 10. Fuentes leídas con estado y criterios de aceptación

### 10.1 readPaths de la ficha

| readPath (ficha) | Estado | Aporte |
|---|---|---|
| `src/backend/src/app.module.ts` | **OBS** presente | Registro de módulos (`TeamWorkflowModule`) |
| `src/frontend/src/App.tsx` | **OBS** presente | Rutas `/sales/agenda`, `/supervisor/agenda`, `/team-requests`, `/supervisor/requests` (:84,95,101) |
| `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md` | **IP** | Árbol de agenda, acciones `activities:*`, separación creador/asignado (:198), «mejoras pendientes» (:107) |

### 10.2 Fuentes adicionales leídas

| Fuente | Marca | Aporte |
|---|---|---|
| `docs/COMPARACION-10-PANELES-2026-10-13.md` | **IP** | Referencia declarada por la ficha |
| `docs/PANELES-Y-PERMISOS.md:19,24` | **IP** | Agenda y tareas como herramienta personal; no concede acceso enlazado |
| `docs/DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md` §3 | **IP** | Estados, prioridad, comentarios, enlaces, deduplicación, revocación |
| `workflow.controller.ts` (20), `workflow.service.ts` (41), `workflow.dto.ts` | **OBS** | §3 completo |
| `schema.prisma:896-930` | **OBS** | `TeamActivity`, `TeamRequest` |
| `AgendaCalendarPage.tsx` (112), `TeamWorkflowPage.tsx` (36) | **OBS** | UI compartida, rol-detección, `assigneeId` |
| `promotions.service.ts:71-129` | **OBS** | Patrón de auditoría que agenda **no** sigue |
| `docs/ejecucion-paneles/tareas.json` | **OBS** | Fichas, `requiredDecisions`, `dependsOn` |

### 10.3 Fuentes faltantes documentadas

Ningún readPath de la ficha falta en S3 (§10.1 completo). **Ausencias relacionadas documentadas en BASE-01 §8:** el inventario de BASE-01 advierte que las piezas de agenda no están todas inventariadas en profundidad (auditoría, migraciones, datos reales); **DESC**: no se consultó la base de datos ni se ejecutó el runtime de agenda. `features/agenda/**` (writePath de la ficha) **no existe aún**: es destino propuesto, no fuente (**OBS** §3.4).

## 11. Límites, evidencia reproducible y pruebas previstas

- **Ejecutado aquí:** solo escritura documental y lecturas. `git status --porcelain` debe mostrar solo los nuevos contratos bajo `docs/ejecucion-paneles/contratos/`; se reporta junto con la entrega.
- **No ejecutado (y no acreditado):** suites jest/vitest, llamadas HTTP con credenciales, pruebas de agenda en navegador, consulta de datos reales.

Comandos usados (solo lectura):

```bash
node docs/ejecucion-paneles/preparar-tanda.mjs BASE-03 contrato
node docs/ejecucion-paneles/preparar-tanda.mjs BASE-03 backend-propias   # (y los 5 restantes)
python3 -c "... tareas.json: requiredDecisions/dependsOn por paso ..."
rg -n "@Roles|@Permissions|@Controller" src/backend/src/modules/team-workflow/workflow.controller.ts
rg -n "ForbiddenException|ConflictException|NotFoundException|audit" src/backend/src/modules/team-workflow/
rg -n "model TeamActivity|model TeamRequest" src/backend/prisma/schema.prisma
rg -n "agenda|Agenda" src/frontend/src/App.tsx
rg -n "supervisor|assignee|/team-workflow/activities" src/frontend/src/features/supervisor/AgendaCalendarPage.tsx
rg -n "AuditService|auditLog" src/backend/src/modules/promotions/promotions.service.ts
```

## 12. Riesgos de esta base

- Reconstruir la agenda sobre un modelo nuevo sin reconciliar `TeamActivity` duplicaría actividades ya creadas en S3 (regla de la ficha: «no inventar compatibilidad»).
- Habilitar `activities:*` sin mecanismo transitorio por rol dejaría a los vendedores sin agenda hasta que se concedan acciones (BASE-01 §8 «permiso implícito por rol»).
- Completar `*-equipo` antes de BASE-04 congelaría la jerarquía de rol como único criterio de pertenencia.
- Olvidar la auditoría (D4) repetiría la deuda ya visible al comparar agenda con promociones (§3.3).
