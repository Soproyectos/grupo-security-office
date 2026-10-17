# COM-04 — Metas y seguimiento del equipo con trazabilidad (paso: contrato)

**Fecha:** 2026-10-16 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/COM-04.md`; no modifica código, base de datos ni servicios activos (3000/5173/5432), no ejecuta commits y **no edita `estado.json`, `tareas.json`, `TANDA-01-avance.json` ni ningún otro archivo de `docs/ejecucion-paneles/`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md:14` («esas propuestas quedan disponibles para la auditoría final, no se presentan como decisiones empresariales aprobadas»), este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.**

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa (comandos en §10). |
| **IP** | Informe o diseño previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `COM-04 contrato`, textual):** «Concretar metas por integrante/periodo y responsables de sus cambios. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `COM-01`. **OBS:** COM-01 **no está aceptado en `estado.json`**; su implementación vive en la copia aislada `/home/soporte/office_ai/gs-tanda-01` (archivos ` M`/`??` sin commit), por lo que la dependencia está **implementada_sin_auditar, no verificada**. Este contrato no verifica aceptaciones: ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (textuales):** (1) «Reutilizar consulta/upsert actual; añadir auditoría coherente y antes/después.» (2) «Vendedor consulta propia meta; solo asignación explícita permite gestión de equipo.» (3) «Periodo Bogotá y moneda explícitos; meta y avance facturado son medidas diferentes.»
- **Referencia de la ficha:** `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md`, sección «metas por integrante/periodo y responsables de sus cambios» (`DISENO:111`, `:121`, `:130`, `:159`, `:181`, `:201`).
- **requiredDecisions (ficha):** `[]`. **No obstante**, este contrato hereda D5/E6 (COM-01), el hueco de moneda/timezone y el bloqueo B1 solo para la *fuente acordada* del avance (§8): no condicionan la ficha, pero condicionan §3/§4.
- **Aceptación del paso `contrato` (textuales):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.»

## 2. Estado actual (OBS)

El directorio `src/backend/src/modules/commercial/sales-targets/` es **idéntico en S3 y en la copia** (`diff -rq` vacío). `prisma/schema.prisma` difiere solo por COM-01 (copia `:816-832` vs S3 `:710-726`); el modelo `SalesTarget` es **el mismo** en ambos. **Hallazgo de ficha:** el readPath `src/frontend/src/pages/AssignedTargetsPage.tsx` **no existe** en S3 ni en la copia (`find`/`glob` vacío): es una página **por crear** en el paso `frontend` (writePath de su ficha).

### 2.1 Rutas, roles y quién escribe hoy

| Pieza | Ruta:línea | Hecho |
|---|---|---|
| Lectura | `sales-targets.controller.ts:30-38` | `GET /api/commercial/sales-targets` con `@Roles(COMMERCIAL_READ_ROLES)`; sin `@Permissions` en **todo el módulo** (`rg '@Permissions\('` → vacío) |
| Escritura | `sales-targets.controller.ts:40-48` | `POST` (upsert) con `@Roles(SUPER_ADMIN, SUPERVISOR)`; autorización **por rol**, no por concesión |
| Alcance de lectura | `sales-targets.service.ts:32-63` (`findAll`) | un no-admin sin `userId` recibe solo las propias (`:40-42`); `userId` ajeno → `assertCanViewUser` (ancestro jerárquico o Super Admin, `hierarchy.service.ts:130-150`) → **403**; vendedor puro con `userId` ajeno → **403** inmediato (`:34-36`) |
| Alcance de escritura | `sales-targets.service.ts:72-86` (`upsert`) | Super Admin escribe a cualquiera; Supervisor solo a subordinados de `getSubordinateIds` (`:78-85`); **nadie fija su propia meta salvo admin** (`:75`); Vendedor y **Admin Comercial** rechazados aunque tengan subordinados (spec `:158-163`) |
| Jerarquía | `hierarchy.service.ts:130-150` (`assertCanViewUser`) | Super Admin → sí; self → sí; subordinado directo/indirecto → sí; resto → 403. Es el mecanismo de «asignación explícita» que ya existe (regla 2) |

### 2.2 Upsert actual: ¿reemplaza o crea duplicados?

- **Reemplaza, no duplica.** `prisma.salesTarget.upsert` con `where: { userId_period: { userId, period } }` (`sales-targets.service.ts:96-112`) sobre la restricción `@@unique([userId, period])` (`schema.prisma` S3 `:723`, copia `:829`). Un reintento del mismo `(userId, period)` **actualiza la fila existente** (`update` en `:106-111`): 1 fila tras N POST idénticos. La acreditación del caso 2 se apoya en esta restricción, no en lógica de aplicación.
- `create` y `update` escriben los mismos campos (`amount`, `currency`, `notes`, `setById`); `setById` registra **quién fijó por última vez** (responsable visible, `DISENO:130` «Mostrar quién las fijó») pero **no conserva el historial de responsables**.

### 2.3 Periodo, timezone y moneda

| Pregunta | Respuesta (OBS) | Ruta:línea |
|---|---|---|
| Formato de periodo | `YYYY-MM` validado por regex en DTO (`Matches`) y de nuevo en el helper | `upsert-sales-target.dto.ts:20-23`, `month-range-bogota.ts` (`periodStartFromString`) |
| Persistencia | `period` es `@db.Date` = **día 1 del mes** (medianoche UTC del día 1; columna DATE sin hora) | `schema.prisma:713`, `month-range-bogota.ts` (comentario del helper) |
| Timezone Bogotá | El helper del backend **está anclado a America/Bogota (UTC-5 fijo, sin DST)** y exige que «toda lógica de mes actual pase por aquí» (issue #26); se usa en el dashboard para el rango del mes, **no** en el upsert (el upsert recibe el periodo etiquetado) | `month-range-bogota.ts` (comentario cabecera, `BOGOTA_OFFSET_MS`), `dashboard.service.ts:139-143` |
| Moneda | **Opcional** en el DTO (`currency?`, `default: 'COP'`); el servicio la normaliza `(dto.currency ?? 'COP').toUpperCase()` **sin validar ISO 4217** (solo `MaxLength(3)`) | `upsert-sales-target.dto.ts:32-36`, `sales-targets.service.ts:94` |
| Moneda en lectura | `findAll` no filtra por moneda; la fila conserva su `currency` | `sales-targets.service.ts:55-62` |

### 2.4 Fuente del «avance facturado» (regla 3, y bloqueo B1)

- **Hoy el avance NO viene de Yéminus en vivo: se calcula en el backend propio** a partir de `SalesOrder` con `externalInvoiceNumber not null` y `externalInvoiceDate` dentro del rango del mes Bogotá: `getPersonalSalesGoal` (`dashboard.service.ts:139-175`, queries `:144-155`) y el bloque comercial del workspace (`:327-360`, misma fuente). Es decir: **la facturación «real» del panel es la referencia externa capturada manualmente en el pedido interno** (patrón ya documentado en COM-03 §2.5: la factura solo nace en Yéminus; el panel cuenta referencias).
- **Consecuencia para B1:** el cálculo actual **no depende de la API de Yéminus** → B1 **no bloquea** este contrato (COM-04 reutiliza la medida existente). Pero el diseño exige que «El avance por facturación se calcula sobre la fuente acordada de Yéminus» (`DISENO:111`, textual): la *fuente acordada* sigue **pendiente de B1/COM-07** (`erpSales:read` `enabled:false`). Meta (`SalesTarget.amount`) y avance (`SalesOrder` referenciado) son **medidas distintas con fuentes distintas** — exactamente la separación de la regla 3.
- **La meta no se calcula:** es dato fijado por upsert. El avance no se fija: se deriva al leer. Ninguno sustituye al otro (`remaining`/`progressPercent` solo existen con meta y sin moneda mixta, `dashboard.service.ts:166-174`).

### 2.5 Auditoría presente/ausente y UI actual

- **Auditoría: AUSENTE.** `rg 'AuditService|Audit\.'` en `sales-targets/` → vacío. El módulo no importa `AuditModule`; el único rastro de actor es `setById` (sobrescrito en cada upsert). `DISENO:159` exige registrar «metas» con «actor, elemento, momento, resultado y origen sin guardar secretos o copias innecesarias».
- **UI real de metas:** `SalesGoalCard` (vendedor) lee `GET /dashboard/sales-goal` (`sales-goal.service.ts:12-14`, `dashboard.controller.ts:28-32`) — solo meta propia del mes en curso, sin edición. La pantalla de supervisor (`SupervisorWorkspacePage.tsx`) es **ficticia en DEV** (edita metas en estado local sin llamar a la API, `:26-43`) — `DISENO:117`: «La pantalla de supervisor actual usa datos ficticios y debe conectarse a fuentes reales». **Ningún componente llama aún a `POST /api/commercial/sales-targets`** (`rg 'sales-targets'` en frontend → vacío).
- **Catálogo (copia, `access-catalog.ts`):** `targets:read` own/team (`:82`), `targets:edit` own/team con dependencia `['targets:read']` (`:100`); paquetes: Vendedor `targets:read(own)` (`:232`), Supervisor `targets:read(team)` (`:246`), Gestión `targets:read+edit(team)` (`:252-254`). S3 **no tiene** `access-catalog.ts` (nace con COM-01 en la copia).

## 3. Campos y rutas PROP (metas por integrante/periodo)

**Regla 1 aterrizada (reutilizar upsert + añadir auditoría antes/después):** no se crea endpoint nuevo ni se duplica modelo; se endurece el DTO y se instrumenta el upsert existente.

| Bloque | Campos | Ruta/acción PROP |
|---|---|---|
| **Identidad de la meta** (dato) | `userId` (integrante destinatario) + `period` (`YYYY-MM` → día 1) | mismos `GET`/`POST` de `sales-targets.controller.ts`; la clave `@@unique([userId, period])` **se conserva** (§2.2). «Metas: integrante destinatario y periodo» (`DISENO:201`, textual) |
| **Monto** (dato) | `amount` (decimal string ≥ 0) | sin cambio de nombre; validación actual se conserva (`sales-targets.service.ts:88-91` → 400) |
| **Moneda explícita** (regla 3) | `currency` pasa a **obligatoria** en el DTO (ISO 3, mayúsculas); se elimina el default silencioso `'COP'` | cambio de contrato: hoy opcional (§2.3); un payload sin `currency` → **400**, no un default sorpresivo. Decisión G3 §8 |
| **Notas** (dato) | `notes?` (≤500) | sin cambio; entra a la auditoría como presencia/ausencia, no como contenido (sin PII, patrón COM-02 §5.3) |
| **Responsable** | `setById` (ya existe) + fila `AuditLog` con actor | «Mostrar quién las fijó; auditar los cambios» (`DISENO:130`, textual) |
| **Auditoría antes/después** | acción `target_upsert`, entity `SalesTarget`, `oldValues/newValues: { amount, currency }` (+ `notesChanged: boolean`), **sin PII** | `audit.log` selectivo (patrón `quotes.service.ts:418-425`); se registran **solo campos que cambian**; si el reintento no cambia nada → **sin fila nueva** (idempotencia del caso 2, §5) |
| **Avance facturado** | **no es campo de esta meta** | se sigue derivando de `SalesOrder` al leer (§2.4); COM-04 no lo toca ni lo copia a `SalesTarget` |

- **Sin cambios de esquema (OBS):** `SalesTarget` ya tiene todo (`userId`, `period`, `amount`, `currency`, `setById`, `notes`, `@@unique`); los writePaths `backend`/`frontend` de la ficha **no** incluyen `schema.prisma` ni `migrations/**`. La auditoría reutiliza `AuditLog` existente.
- **Auditoría en la transacción:** el `audit.log` se emite **después** del upsert exitoso y **antes** de responder (patrón del módulo de cotizaciones); si el upsert falla, no hay auditoría (no se auditan rechazos).
- **Rechazo sin escritura parcial (patrón COM-02):** validación de DTO (periodo/moneda) y autorización (§4) ocurren **antes** de `prisma.salesTarget.upsert`; ningún payload inválido produce fila ni auditoría.

## 4. Acciones/alcance PROP (quién lee y quién escribe)

**Regla 2 aterrizada (patrón COM-02 §4: `resolveAccess` + grants por acción con identidad de servidor):**

| Acción | Alcance PROP | Quién la recibe (COM-01 §3.1) | Efecto |
|---|---|---|---|
| `targets:read` | `own` | Vendedor (paquete) | consulta siempre la propia (comportamiento actual conservado, `sales-targets.service.ts:40-42`) |
| `targets:read` | `team` | Supervisor comercial (paquete) | «Metas: consultar las del equipo» (`DISENO:121`, textual); hoy lo obtiene por jerarquía, PROP por concesión |
| `targets:edit` | `team` (depende de `targets:read`) | Gestión comercial (paquete) | «Fijar o editar metas se asigna mediante las acciones de Gestión comercial cuando esa persona tiene ese trabajo» (`DISENO:121`, textual) |
| Super Admin | exención explícita del resolver | — | `resolveAccess` excepción 1 (`data-scope.ts` copia, `:127-128`), auditable |

- **Aterrizaje en `resolveAccess` (patrón `customers.service.ts:395-424`):** identidad de servidor (`verified/active/sessionValid` + `teamOwnerIds` de `getSubordinateIds`), `grantsForUser`, y `resource: { kind: 'target', id: (userId, period), ownerId: userId }`. «Vendedor consulta propia meta» → grant `own` cubre la propia; «lector no escribe» → sin `targets:edit` el `POST` responde **403** con `deny('no-covering-grant')`; «editor no cambia integrantes ajenos» → grant `targets:edit(team)` sobre un `userId` fuera del equipo → `deny` (el `covers` own/team de `data-scope.ts:85-100` ya lo resuelve, incluida la regla dura «team en `X:read` no otorga `X:edit`»).
- **Coherencia con COM-01 §3.1:** Supervisor **lee** equipo (`targets:read team`) y **no** hereda edición; Gestión **edita** el equipo (`targets:edit team`); el Vendedor **no** fija su propia meta (regla del diseño `DISENO:111` «asignar Vendedor no permite cambiar la meta propia», que hoy ya se cumple en servidor `:75`).
- **Cambio de guarda respecto de hoy (PROP, decisión G2 §8):** el `POST` deja de autorizar por `@Roles(SUPERVISOR)` y pasa a `targets:edit` + alcance. Un Supervisor **sin** concesión `targets:edit` deja de poder fijar metas (hoy puede, §2.1); un Gestión comercial **puede** (hoy no, spec `:158`). Es un **endurecimiento alineado con el diseño** pero un cambio de contrato en uso: debe resolverlo el coordinador antes de delegar.
- **Capa de transición (mismo patrón COM-02 §4):** `@Roles` del controller **no se retira** en esta ficha (sigue como puerta grossiera); el control por acción se añade **encima**, en el servicio, vía `assertActionAllowed` (helpers ya existentes en copia: `customers.service.ts:395`, `quotes.service.ts:554`). D5 (extender `@Permissions` a toda la superficie) sigue pendiente y **no se promete aquí**.

## 5. Los 3 casos de la ficha y su acreditación

**Aceptación de `backend` y `frontend` (ficha, textuales, idéntica en ambos pasos).**

| # | Caso (ficha, textual) | Cómo se acreditará (PROP; no es evidencia todavía) |
|---|---|---|
| 5.1 | «Lector no escribe; editor no cambia integrantes ajenos.» | (a) Unidad: `resolveAccess('targets:edit', {kind:'target', ownerId: subordinado})` con grants `targets:read(team)` → `deny('no-covering-grant')`; con `targets:edit(team)` y dueño en el equipo → `allow('team')`. (b) API: `POST` sin `targets:edit` → **403** y **cero** filas/auditorías; `POST` con `targets:edit(team)` sobre un `userId` ajeno al equipo → **403**; `GET ?userId=` ajeno sin `targets:read(team)` → **403** (comportamiento actual, §2.1) |
| 5.2 | «Reintento/mes no duplica objetivo ni auditoría de operación confirmada.» | (a) Unidad: spec doble `upsert` idéntico → `prisma.salesTarget.upsert` invocado 2 veces con la misma clave, **1 fila** (mock del constraint o PostgreSQL desechable) y `audit.log` llamado **1 sola vez** (el segundo intento no cambia `amount/currency` → sin auditoría, §3). (b) API: dos `POST` consecutivos con el mismo payload → 200 y luego 200 con el **mismo** `id` de meta y **1** fila `AuditLog` para ese `entityId`. Referencia del patrón de idempotencia: `quotes.service.ts` doble `ganada` → 409 (aquí, en cambio, el upsert es idempotente por diseño y responde 200 en ambos) |
| 5.3 | «Recargar conserva cambios y fuente real.» | (a) API: `POST` → `GET` del mismo periodo devuelve `amount/currency/notes/setById` idénticos al del `POST` (persistencia real, no estado local). (b) Frontend e2e: la página de metas (paso `frontend`) recarga tras guardar y muestra el monto guardado **desde el backend**; la meta del vendedor en `SalesGoalCard` sigue leyendo `/dashboard/sales-goal` (fuente real, §2.4), **no** un fixture |

**No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP, PostgreSQL desechable. §5 lista pruebas **previstas**.

## 6. Errores (PROP sobre patrón OBS del módulo)

| Código | Cuándo | Evidencia/base |
|---|---|---|
| 400 | `period` fuera de `YYYY-MM`; `amount` no numérico o negativo; `currency` ausente (PROP G3) o con más de 3 caracteres/ no alfabética | `upsert-sales-target.dto.ts:20-23,26-30,32-36`; `sales-targets.service.ts:88-91`; patrón COM-02 §6 |
| 401 | JWT inválido/expirado (guard del módulo) | `sales-targets.controller.ts:22`; patrón BASE-02 §7 |
| 403 | Sin `targets:edit` sobre el dueño de la meta o fuera de alcance; vendedor puro pidiendo meta ajena; Supervisor sin subordinado ni concesión; identidad inválida en el resolver | `sales-targets.service.ts:34-36,74-86`; `resolveAccess` (`data-scope.ts:111+`); `assertCanViewUser` (`hierarchy.service.ts:146-149`) |
| 404 | **No aplica hoy y no se introduce:** el recurso es la *clave* `(userId, period)` de un upsert que puede crear; responder 404 por meta ajena revelaría existencia, pero responder 404 por «no creada» rompería el upsert. El módulo oculta lo ajeno con **403** (§2.1), coherente con la semántica de citas (`quotes.service.ts:167-174` usa 404 solo para recursos ya existentes e inaccesibles; aquí el GET lista filtra en silencio y el POST deniega antes de mirar si la fila existe) — decisión G6 §8 |
| 409 | **No aplica al upsert** (es idempotente por `@@unique`, §2.2). Se reserva solo para violación de carrera residual `P2002` traducida a conflicto (patrón `quotes.service.ts:558-566`), no como flujo normal | `schema.prisma:723` |

## 7. Incrementos posteriores registrados (fichas, textuales) y solape

**Aceptación idéntica en `backend` y `frontend` (ficha, textual):** «Lector no escribe; editor no cambia integrantes ajenos.» + «Reintento/mes no duplica objetivo ni auditoría de operación confirmada.» + «Recargar conserva cambios y fuente real.»

| Incremento | Depende de | Objetivo (ficha) | Archivos (ficha) |
|---|---|---|---|
| **COM-04 `backend`** | COM-01 | «Completar el alcance de servidor de este paso y sus pruebas. Si no cabe en una entrega revisable, el coordinador registra todos los subpasos antes de delegar código.» | `modules/commercial/sales-targets/**` — **sin** `schema.prisma` (§3) |
| **COM-04 `frontend`** | COM-01 | «Conectar la interfaz al contrato de servidor auditado y verificar su recorrido; sin cambiar reglas desde el navegador.» | `pages/AssignedTargetsPage.tsx` + `.spec.tsx`, `services/dashboard-insights.service.ts` + `.spec.tsx` |

**Solape con COM-05/07/09 y CAT (writePaths de sus fichas, revisados con `preparar-tanda.mjs` y `tareas.json`, sin escribirlos):**

| Archivo compartido con COM-04 | Fichas que lo tocan |
|---|---|
| `modules/commercial/sales-targets/**` | **COM-04 `backend`**, **COM-07 `backend-sincronizacion` e `backend-indicadores`** (vecino directo: COM-07 introduce la fuente ERP del avance sobre esta misma superficie) |
| `pages/AssignedTargetsPage.tsx` + spec | **COM-04 `frontend`**, **COM-07 `frontend-facturas` e `frontend-indicadores`** — página creada por COM-04, extendida por COM-07 |
| `services/dashboard-insights.service.ts` + spec | **COM-04 `frontend`**, **COM-05 `frontend`**, **COM-07 frontend** (COM-05 depende de COM-04: `tareas.json` `dependsOn: ['COM-01','COM-04']`) |
| `modules/dashboard/**` | COM-05 `backend`, COM-07 — **COM-04 no lo escribe** (su ficha no lo incluye; solo lo lee como fuente del avance, §2.4) |
| `common/security/access-catalog.ts` + spec | COM-01/02/03/06/07/08/09, CAT-01…08 — **COM-04 no lo escribe** (su ficha no lo incluye): usa `targets:read/edit` ya declarados (§2.5) |
| `prisma/schema.prisma` + `migrations/**` | COM-06/07/08, CAT-01…08 — **COM-04 no lo incluye** (§3) |

**Cadena:** COM-04 **hereda** de COM-01 el catálogo, `resolveAccess`/grants y D5; **entrega** a COM-05 el upsert auditado y el periodo Bogotá como base del bloque de metas del dashboard; **no** toca el bloqueo B1 de COM-07 (§2.4/§8) ni las acciones de cotizaciones de COM-03/09.

## 8. Fuentes leídas con estado y decisiones pendientes

| Fuente | Marca | Aporte |
|---|---|---|
| `.../sales-targets/sales-targets.controller.ts` (49, idéntico en copia) | **OBS** | §2.1: rutas, `@Roles` solos, sin `@Permissions` |
| `.../sales-targets/sales-targets.service.ts` (116, idéntico) | **OBS** | §2.1-2.4: alcance lectura/escritura, upsert `:96-112`, moneda `:94`, sin auditoría |
| `.../sales-targets/dto/upsert-sales-target.dto.ts` (43) / `sales-target-query.dto.ts` (24) | **OBS** | §2.3: periodo regex, `currency?` opcional, `amount` string |
| `.../sales-targets/sales-targets.service.spec.ts` (175, idéntico) | **OBS** | §2.1/§5: rechazo de Vendedor/Admin Comercial `:158`, upsert 1 fila `:97-119`, 403 sin escritura `:130-137` |
| `src/backend/prisma/schema.prisma` (S3 `SalesTarget` `:710-726`, copia `:816-832`) | **OBS** | §2.2/§3: `@@unique([userId, period])`, campos completos, sin migración prevista |
| `src/backend/src/common/date/month-range-bogota.ts` | **OBS** | §2.3: UTC-5 fijo Bogotá, `periodStartFromString`, «toda lógica de mes actual debe pasar por aquí» |
| `.../dashboard/dashboard.service.ts:139-175,327-360` | **OBS** | §2.4: avance = `SalesOrder.externalInvoice*` (fuente propia, no Yéminus vivo) |
| `.../dashboard/dashboard.controller.ts:28-32` + `features/sales/sales-goal.service.ts` | **OBS** | §2.5: UI vendedor lee `/dashboard/sales-goal`; nadie llama al upsert |
| `.../pages/SupervisorWorkspacePage.tsx` (DEV ficticio) | **OBS** | §2.5: pantalla de supervisor sin API real (`DISENO:117`) |
| copia `.../security/access-catalog.ts` (293) | **OBS — solo en copia** | §2.5/§4: `targets:read` `:82`, `targets:edit` `:100` (depende de `:read`), paquetes `:232/:246/:252-254` |
| copia `.../security/data-scope.ts` (`resolveAccess` `:111`) y `customers.service.ts:395-424` | **OBS** | §4/§5: patrón identidad de servidor + grants; regla dura team-read ↛ team-edit |
| copia `.../quotes/quotes.service.ts:418-425,554` | **OBS** | §3/§4: auditoría selectiva antes/después y helper `assertActionAllowed` a replicar |
| `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md` | **IP** | `:111` fuente Yéminus del avance y «asignar Vendedor no permite cambiar la meta propia»; `:121` Gestión fija metas, Supervisor consulta; `:130` fijar/editar por integrante y periodo, mostrar quién fijó y auditar; `:159` auditoría; `:181` `targets:read/edit`; `:201` integrante+periodo, leer propia ≠ modificar |
| `contratos/COM-01.md` §3.1 | **IP** de esta tanda | Supervisor `targets:read(team)`; Gestión `targets:edit` |
| `contratos/COM-02.md` §3-§6 | **IP** de esta tanda | patrón `resolveAccess` por acción, auditoría sin PII, 400 sin escritura parcial |
| `contratos/COM-03.md` §2.5/§8 | **IP** de esta tanda | factura solo en Yéminus, referencia externa manual, bloqueo B1 |
| `tareas.json` + `preparar-tanda.mjs COM-04 contrato/backend/frontend` | **OBS** | ficha canónica, writePaths (§7), COM-05 depende de COM-04 |
| `estado.json` | **OBS** | COM-01 no aceptado; `decisions: {}` (contexto heredado COM-03 §1) |

| # | Decisión o bloqueo | Afecta | Estado |
|---|---|---|---|
| D5 | Extender `@Permissions`/`PermissionsGuard` a toda la superficie; el módulo sales-targets hoy no lo usa (§2.1) | §4, acceptance «por URL/API» | **Pendiente — decisión del coordinador** (heredada de COM-01) |
| E6 | Revalidación de `AccessGrant` por petición y refetch de concesiones | §4 (resolver por petición) | **Pendiente (heredada de COM-01)** |
| G1 | **Timezone:** el backend ancla America/Bogota UTC-5 fijo (§2.3); el upsert solo recibe `YYYY-MM` etiquetado. ¿Se mantiene zona fija del backend (Colombia sin DST) o se prevé multi-timezone por usuario? | §2.3, §3 | **Pendiente — mínima si se confirma zona fija** |
| G2 | **Guarda del POST:** hoy `@Roles(SUPER_ADMIN, SUPERVISOR)` permite al Supervisor fijar metas (§2.1); el diseño delega la fijación en `targets:edit`/Gestión (`DISENO:121`). PROP migrar a acción+alcance: Supervisor deja de escribir sin concesión explícita; Gestión empieza a escribir | §4, §6 (403), frontend | **Pendiente — decisión del coordinador** (cambio de contrato en uso) |
| G3 | **Moneda explícita:** hoy `currency?` con default `'COP'` (§2.3); la regla 3 pide moneda explícita. PROP: obligatoria en DTO | §3, §6 (400) | **Pendiente — decisión del coordinador** |
| G4 | **Granularidad de auditoría:** ¿una fila por upsert con cambio, o también por reintentos sin cambio? PROP: solo con cambios (idempotencia caso 5.2) | §3, §5.2 | **Pendiente — PROP razonable, confirmar** |
| G5 | **Avance facturado (B1):** hoy fuente = `SalesOrder` con referencia externa manual (§2.4, no bloqueante aquí); la «fuente acordada de Yéminus» (`DISENO:111`) depende de `erpSales:read` (B1 → COM-07) | §2.4, §3 | **B1 heredado — no se resuelve aquí; COM-04 no cambia la fuente** |
| G6 | **404 ajeno:** el módulo deniega con 403 y el GET filtra; no se introduce 404 para `(userId, period)` (§6) | §6 | **Pendiente — confirmar semántica** |
| B1 | **Yéminus:** sin contrato/API ni datos de integración reales; `erpSales:read` `enabled:false` | §2.4 (solo la fuente acordada futura) | **Bloqueo externo heredado — no se resuelve aquí** |

## 9. Criterios de aceptación del paso (ficha, textuales)

1. ✅ «Contrato consistente con dependencias y decisiones pendientes explícitas.» — §1 declara `dependsOn: COM-01` **implementado en copia, no aceptado en `estado.json`**; §2/§4 declaran que el catálogo y el resolver viven **solo en la copia**; §8 enumera D5, E6, G1-G6 y B1, incluida la verificación de que el avance facturado **no** sale de Yéminus hoy (G5) y por qué B1 no bloquea este contrato.
2. ✅ «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.» — §7 registra `COM-04 backend` y `COM-04 frontend` con sus fichas textuales (los 3 casos) y el solape con COM-05/07/09 y CAT.

**Advertencia de modalidad (TANDA-COMPLETA:14):** todo lo marcado **PROP** es una propuesta para la **auditoría final única** del coordinador; no sustituye `estado.json`, no modifica aceptaciones y no autoriza implementación ni despliegues. En particular, §3 propone **hacer obligatoria `currency`** (G3) y §4 propone **migrar el `POST` de `@Roles` a `targets:edit`+alcance** (G2): ambas son rupturas de contratos en uso que deben resolverse antes de delegar código; §4 **no** promete sustituir la capa de roles ni resolver D5/E6.

## 10. Evidencia reproducible

Comandos desde la raíz del repo (solo lectura):

```bash
git status --porcelain; git rev-parse --short HEAD            # baseline S3: 32 líneas
node docs/ejecucion-paneles/preparar-tanda.mjs COM-04 contrato
node docs/ejecucion-paneles/preparar-tanda.mjs COM-04 backend
node docs/ejecucion-paneles/preparar-tanda.mjs COM-04 frontend
rg -n '@Permissions\(' src/backend/src/modules/commercial/sales-targets/   # vacío
rg -n 'AuditService|Audit\.' src/backend/src/modules/commercial/sales-targets/   # vacío (sin auditoría)
sed -n '30,48p' src/backend/src/modules/commercial/sales-targets/sales-targets.controller.ts
sed -n '32,63p;72,115p' src/backend/src/modules/commercial/sales-targets/sales-targets.service.ts
rg -n 'currency|period|amount' src/backend/src/modules/commercial/sales-targets/dto/upsert-sales-target.dto.ts
rg -n 'model SalesTarget|@@unique' src/backend/prisma/schema.prisma
sed -n '139,175p;327,360p' src/backend/src/modules/dashboard/dashboard.service.ts   # fuente del avance
rg -n 'targets:' /home/soporte/office_ai/gs-tanda-01/src/backend/src/common/security/access-catalog.ts
rg -n 'resolveAccess|assertActionAllowed' /home/soporte/office_ai/gs-tanda-01/src/backend/src/common/security/data-scope.ts /home/soporte/office_ai/gs-tanda-01/src/backend/src/modules/commercial/customers/customers.service.ts
rg -n 'sales-targets' src/frontend/src -g '!node_modules'   # vacío: nadie llama al upsert
find src/frontend/src -name 'AssignedTargetsPage*'          # vacío: página por crear
diff -rq src/backend/src/modules/commercial/sales-targets/ /home/soporte/office_ai/gs-tanda-01/src/backend/src/modules/commercial/sales-targets/   # vacío
rg -n 'metas|targets:edit|fuente acordada' docs/DISENO-PANEL-COMERCIAL-2026-10-13.md
```

- **No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP con permisos, pruebas con PostgreSQL desechable, consulta de datos reales. §5 lista las pruebas **previstas**, no realizadas.

## 11. Riesgos de este contrato

- Migrar el `POST` de `@Roles(SUPERVISOR)` a `targets:edit`+alcance (G2/§4) **cambia un contrato en uso**: Supervisor pierde escritura si no recibe la concesión, y hoy **ningún frontend** llama al upsert (§2.5), así que el cambio no rompe UI actual pero sí comportamiento operativo del backend.
- Hacer obligatoria `currency` (G3/§3) rompe payloads existentes que hoy omiten moneda (recibirán 400): es el sentido de la regla 3, pero debe coordinarse con el paso `frontend` que cree la página.
- Delegar §4 sin D5 deja que la concesión por acción conviva con `@Roles` grossero: «sin concesiones no hay escritura» será **solo parcialmente** cierto en servidor mientras el guard de roles siga siendo la primera puerta (ídem COM-01 §4/COM-02 §11).
- Si G5/COM-07 introduce después la fuente Yéminus del avance, la separación «meta ≠ avance» de §3/§2.4 debe mantenerse: cualquier tentación de copiar el avance a `SalesTarget` requeriría tocar `schema.prisma` **fuera** del writePath de COM-04.
- El solape de `sales-targets/**` y `AssignedTargetsPage.tsx` con COM-07 (§7) exige que COM-04 **solo** añada auditoría/alcance/DTO y no reescriba la consulta, para que COM-07 pueda extender la superficie sin rebase.
