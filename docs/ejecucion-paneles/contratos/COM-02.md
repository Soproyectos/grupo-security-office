# COM-02 — Separar datos de cliente y gestión de cartera (paso: contrato)

**Fecha:** 2026-10-15 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/COM-02.md`; no modifica código, base de datos ni servicios activos (3000/5173/5432), no ejecuta commits y **no edita `estado.json` ni `tareas.json`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md:14` («esas propuestas quedan disponibles para la auditoría final, no se presentan como decisiones empresariales aprobadas»), este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.**

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa (comandos en §10). |
| **IP** | Informe o diseño previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `COM-02 contrato`, textual):** «Concretar contactos/notas, responsable, estado y alcances propios/equipo. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `COM-01`. **OBS:** COM-01 **no está aceptado en `estado.json`** (`reviews` contiene solo `BASE-01/inventario`; `decisions: {}`). Su implementación `backend`/`frontend` está **en la copia aislada** `/home/soporte/office_ai/gs-tanda-01` (archivos ` M`/`??` sin commit en su `git status`), por lo que la dependencia está **implementada_sin_auditar, no verificada**. Este contrato no verifica aceptaciones: ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (textuales):** (1) «DTO de edición general no debe conceder ownerId/estado por tener edición de datos.» (2) «Reasignación/cartera/conversión con acciones y alcances del contrato.» (3) «Evitar permiso global para que supervisor vea equipo y vendedor edite propios.»
- **Referencia de la ficha:** `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md`, sección «contactos/notas, responsable, estado y alcances propios/equipo» (§«Clientes y prospectos» `:67-73`, cartera `:129`, combinación de alcances `:136-142`, acciones `:171-204`).
- **Aceptación del paso `contrato` (textuales):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.»

## 2. Estado actual (OBS)

El directorio `src/backend/src/modules/commercial/customers/` es **idéntico en S3 y en la copia** (`diff -rq` vacío); `CustomersPage.tsx` también (333 líneas, `diff -q` vacío). Documentar S3 es documentar la copia.

### 2.1 Regla 1 verificada: el DTO de edición general **sí concede hoy `ownerId` y `status`** — el riesgo central es real

| Pieza | Ruta:línea | Hecho |
|---|---|---|
| Herencia | `dto/update-customer.dto.ts:11` | `UpdateCustomerDto extends PartialType(CreateCustomerDto)` → hereda **todos** los campos de creación |
| `status` heredado | `dto/create-customer.dto.ts:50-53` (`@IsIn(CUSTOMER_STATUSES)`) | editable en el PATCH general |
| `ownerId` heredado | `dto/create-customer.dto.ts:69-72` (`@IsUUID`) | editable en el PATCH general |
| Docstring que lo confirma | `dto/update-customer.dto.ts:6-9` | «Todos los campos de creación son editables (incluye `ownerId` para reasignación manual de cartera). `status` puede editarse por aquí» |
| Aplicación en servicio | `customers.service.ts:170` (status), `:174-178` (ownerId: `connect` o `disconnect`) | el PATCH general **cambia responsable y estado** |
| Única guarda | `customers.service.ts:278-282` (`assertOwnCustomerOwner`) | solo bloquea a `isPersonalSeller` asignar `ownerId ≠ self` (403); Supervisor/Admin Comercial/Super Admin con `WRITE_ROLES` reasignan **sin** `customers:reassign` |
| Endpoint | `customers.controller.ts:66-75` — `PATCH :id` con `@Roles(...WRITE_ROLES)` | **sin** `@Permissions` en todo el módulo (`rg -n '@Permissions\(' módulo customers` → vacío en S3 y copia) |
| Acción ya existe y no se consulta | copia `access-catalog.ts:92` — `customers:reassign` (scopes `team\|global`, depende de `customers:read`) | el endpoint no la evalúa; el catálogo la tiene preparada desde COM-01 |

**Conclusión (regla 1):** hoy cualquier usuario con `WRITE_ROLES` puede enviar `{ email, ownerId }` o `{ status: 'INACTIVO' }` en un solo `PATCH /api/commercial/customers/:id` y cambiar responsable/estado **sin permiso de reasignación y sin acción específica**. El DISENO lo anticipa textualmente (`:73`: «los DTO actuales admiten esos campos dentro de una edición general») y la ficha lo convierte en regla.

### 2.2 Rutas y DTOs actuales del módulo

| Ruta | Roles | DTO | Nota |
|---|---|---|---|
| `GET /api/commercial/customers` | READ_ROLES | `CustomerQueryDto` | filtros `search/status/ownerId`, paginado (`:40-47`) |
| `GET /:id` | READ_ROLES | — | 404 fuera de scope (`:49-55`; servicio `:104-106`) |
| `POST` | WRITE_ROLES | `CreateCustomerDto` | `ownerId` default = creador (`:57-64`; servicio `:127-131`) |
| `PATCH /:id` | WRITE_ROLES | `UpdateCustomerDto` | **DTO general con `ownerId`+`status`** (§2.1) |
| `PATCH /:id/convert` | WRITE_ROLES | — | LEAD→CLIENTE + `convertedAt`; 409 si no es LEAD (`:77-83`; servicio `:203-226`) |
| `DELETE /:id` | WRITE_ROLES | — | soft delete `isActive=false` (`:85-92`; servicio `:229-249`) |

`COMMERCIAL_READ_ROLES` = Super Admin, Supervisor, Admin Comercial, Vendedor, Consulta; `WRITE_ROLES` = mismos menos Consulta (`roles.constants.ts:41-54`). El guard efectivo es `JwtAuthGuard + RolesGuard` (`:32`); **no hay `PermissionsGuard` en el módulo** (hueco D5 heredado de COM-01 §2.5).

### 2.3 Alcance de lectura hoy: jerarquía por rol, no por concesión

`customers.service.ts:41-52` (`scopeWhere`): `isListasAdmin` → sin filtro (ven **todos**); `isPersonalSeller` → solo `ownerId = self`; el resto → jerarquía `hierarchy.getSubordinateIds(userId, { includeSelf })` (`hierarchy.service.ts:15-27`, CTE recursiva con tope de profundidad). Es decir, **el supervisor ya ve el equipo hoy por rol** (`Supervisor` en READ_ROLES + scope jerárquico), no por concesión `customers:read (team)`. Es el estado a adaptar, no a reescribir (§4).

### 2.4 Auditoría y PII (OBS)

- El módulo ya audita con `AuditService.log` (`customers.service.ts:142-153` create, `:190-197` update, `:216-223` convert, `:237-248` delete), patrón equivalente a `listas.service.ts:454-461` y a `promotions.service.ts:71-129` (transacción con `auditLog.create`).
- **Hallazgo PII:** `update` audita `oldValues: existing, newValues: customer` **íntegros** (`:195-196`): copia a `AuditLog` notas, email, teléfono, dirección y documento completos, también cuando no cambiaron. `PANELES-Y-PERMISOS.md:48` (IP) exige «sin … copias innecesarias de datos personales» y `DISENO:159` «sin guardar secretos o copias innecesarias de datos personales». **Creeación y delete sí son selectivos** (`:147-152`, `:242-247`: code/name/status/ownerId).

### 2.5 Página actual y «acciones decoradas» vs `@Roles`

- `CustomersPage.tsx` (idéntica S3/copia): gating **por rol de navegador**, no por concesión — `OWNER_COLUMN_ROLES` (`:23-27`: Super Admin/Admin Comercial/Supervisor) decide la columna «Responsable» (`:44-47`), y la prop `personal` filtra `ownerId` en la query (`:50`), oculta «Eliminar» (`:181`) y la columna de responsable. Sin ningún `enabled:false` por concesión.
- `CustomerFormModal.tsx` expone el selector **«Estado»** (`:207-217`) y el campo **notas** (`:244-252`), pero **no** expone `ownerId` (sin control de reasignación en UI). El `CustomerPayload` del frontend sí declara `ownerId?` (`features/customers/types/customer.types.ts:54-55`): el hueco de §2.1 es de **API**, aunque la UI actual no lo muestra.
- Botones hoy sin acción propia: «Convertir» (`:167-180`, condicionado solo a `status === 'LEAD'`) y «Eliminar» (`:181-192`, condicionada a `!personal`).

## 3. Campos y rutas PROP (separación DTO)

**Regla 1 aterrizada:** el DTO de edición general **no** contiene `ownerId` ni `status`.

| Bloque | Campos | Ruta/acción PROP |
|---|---|---|
| **Contactos y notas** (datos) | `name, documentType, documentId, email, phone, city, address, source, sourceDetail, notes, lastContactAt` | `PATCH /:id` con `customers:edit` (alcance own/team/global según concesión) |
| **Responsable** (`ownerId`) | `ownerId` + **motivo** (DISENO:129 «con motivo e historial») | **Endpoint dedicado** `PATCH /:id/reassign` con `customers:reassign` (catálogo `:92`, scopes `team\|global`, depende de `customers:read`) — «Cambiar de responsable no puede enviarse bajo una edición de contacto sin este permiso» (DISENO:188, textual) |
| **Estado** (`status`) | separado del DTO general | Hoy: `PATCH /:id/convert` (LEAD→CLIENTE) + `DELETE /:id` (soft delete). **PROP:** el PATCH general deja de aceptar `status`; la conversión queda con su endpoint; `INACTIVO` solo vía soft delete. Transiciones adicionales → decisión F1 (§8): no se inventa una acción ausente del catálogo |
| **Notas — retención PII mínima** | `notes` sigue siendo texto libre (modelo `schema.prisma:607`, ya existe) | Se auditan **solo los campos cambiados**, omitiendo `notes`/`email`/`phone`/`address` por valor (patrón selectivo ya usado en create/delete `:147-152`); la traza conserva actor, elemento, momento y resultado (DISENO:159) |
| **Sin cambios de esquema** | — | **OBS:** los writePaths `backend` de la ficha **no incluyen `schema.prisma` ni `migrations/**`**: `notes`, `ownerId`, `status`, `convertedAt`, `lastContactAt` ya existen (`schema.prisma:589-621`). Si una decisión exige migración (p. ej. tabla propia de historial de cartera con motivo), el coordinador amplía la ficha antes de delegar (F5 §8) |

- **Rechazo sin cambio parcial (caso 5.1):** la validación del DTO y la comprobación de `customers:reassign` ocurren **antes** de escribir; un payload mixto `{ email, ownerId }` sobre el endpoint general se rechaza entero (400), sin aplicar el email. No existe escritura parcial ni «cambio escondido» (DISENO:71).
- **`disconnect` de `ownerId`:** hoy el PATCH general permite dejar un cliente sin responsable (`customers.service.ts:177`). **PROP:** el endpoint de reasignación define explícitamente si admite «sin responsable» (F6 §8); la edición general ya no puede.
- **Frontend:** `CustomerFormModal` pierde el selector «Estado» de la edición general (§2.5); la reasignación se expone como acción propia (selector de responsable + motivo) solo con `customers:reassign`, y los botones reflejan el resultado del servidor (DISENO:211).

## 4. Alcance propios/equipo PROP («lectura equipo no concede editar equipo»)

Mecanismo: **`resolveAccess` por acción** (copia `data-scope.ts:104-141`), con identidad de servidor (`:99-101`) y `teamOwnerIds` alimentados por `HierarchyService.getSubordinateIds`. El resolver ya contiene la regla dura literalmente (`data-scope.ts:11`): «(b) `team` en `X:read` no otorga `X:edit` sobre recursos del equipo».

| Persona y concesiones | `customers:read` | `customers:edit` | `customers:reassign` |
|---|---|---|---|
| Vendedor (paquete `vendedor`, catálogo `:209-211`) | own | own | — |
| Supervisor (paquete `supervisor-comercial`, `:233`) | **team** | — (no está en su paquete) | — |
| Gestión comercial (`gestion-comercial`, `:243-244`) | team | — | **team** |
| Edición de equipo concedida aparte (DISENO:138, textual: «salvo que Super Admin le dé también edición del equipo») | team | **team** (concesión explícita, no heredada) | team |

- **Caso Ana (DISENO:138, textual):** «Puede leer el equipo, pero solo editar sus propios clientes». Con `customers:read(team)` + `customers:edit(own)`, `resolveAccess('customers:edit', { kind:'customer', ownerId: subordinado })` → `deny('no-covering-grant')` porque el grant `own` exige `resource.ownerId === identity.userId` (`covers`, `data-scope.ts:85-88`); sobre un cliente propio → `allow('own')`.
- **Regla 3 de la ficha:** no se concede un «permiso global» para lograr que el supervisor vea equipo: eso ya es `customers:read` con alcance `team` (acción y alcance separados por concesión, DISENO:140); y el vendedor edita propios con `customers:edit(own)` sin heredar nada del alcance team.
- **Capa de transición (PROP, cambio mínimo):** `scopeWhere` (§2.3) sigue como filtro de **visibilidad de filas** mientras D5 no extienda `@Permissions`; el nuevo control por acción se añade **encima** (por endpoint) usando `resolveAccess` + `grantsForUser` (COM-01 §2.1). El contrato no promete sustituir la jerarquía de roles en esta ficha: la promesa es que la edición deje de depender del rol y pase a depender de `customers:edit`/`customers:reassign` con su alcance.
- **Consulta del responsable:** DISENO:188 exige para `customers:reassign` «consulta autorizada del responsable»; hoy la UI llama `fetchUsers()` sin gating (`CustomersPage.tsx:63-68`). Qué acción cubre esa consulta es decisión F3 (§8); el contrato no la inventa.

## 5. Los 3 casos de la ficha y su acreditación

| # | Caso (ficha, textual) | Cómo se acreditará (PROP; no es evidencia todavía) |
|---|---|---|
| 5.1 | «Petición de contacto+ownerId sin reasignar rechazada sin cambio parcial.» | Specs de validación: `PATCH /:id` con `{ email, ownerId }` → **400** (`owner-not-allowed-in-general-edit`) y ninguna fila modificada; el email tampoco se aplica. Con PostgreSQL desechable y fixtures ficticios: leer el cliente después y asertar `email` y `ownerId` intactos; sin `customers:reassign`, `PATCH /:id/reassign` → **403** |
| 5.2 | «Lectura equipo no concede editar equipo.» | (a) Unidad: `resolveAccess` con grants `customers:read(team)` + `customers:edit(own)` → allow sobre cliente propio, `deny('no-covering-grant')` sobre cliente del equipo (§4). (b) API: mismo usuario recibe **403/404** al editar cliente del equipo y 200 sobre el propio. **Sin permiso global:** no se añade ninguna excepción de rol al resolver |
| 5.3 | «Responsable nuevo, actor y antes/después quedan trazados sin PII innecesaria.» | Reasignación exitosa en PostgreSQL desechable → fila `AuditLog` con `userId` = actor, `action: 'reassign'`, `entity: 'Customer'`, `oldValues.ownerId` y `newValues.ownerId` (patrón selectivo de create `:147-152` y de `listas.service.ts:482-489`); asertar que **no** aparecen `notes`, `email`, `phone` ni `address` en esa fila (regla PANELES:48) |

**No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP, PostgreSQL desechable. §5 lista pruebas **previstas**.

## 6. Errores (PROP sobre patrón OBS del módulo)

| Código | Cuándo | Evidencia/base |
|---|---|---|
| 400 | `ownerId`/`status`/`isActive` presentes en el DTO general; payload mixto rechazado entero; `status` fuera de `CUSTOMER_STATUSES`; motivo de reasignación ausente si F5 lo exige | §2.1 (`update-customer.dto.ts:11`); patrón `create-customer.dto.ts:51` |
| 401 | Identidad/sesión inválidas en el resolver (`data-scope.ts:99-101`) | patrón BASE-04 |
| 403 | Sin `customers:edit` sobre el recurso; sin `customers:reassign` en el endpoint dedicado; vendedor asignando `ownerId` ajeno (guarda preexistente conservada) | `data-scope.ts:113`; `customers.service.ts:278-282` |
| 404 | Cliente inexistente o **fuera del scope de lectura** — se oculta la existencia (no 403) | `customers.service.ts:104-106` (comentario explícito), patrón `acl.service.ts:203-205` |
| 409 | Documento duplicado (`documentType`+`documentId`); `convert` sobre registro que no está en LEAD | `customers.service.ts:289-294`, `:205-208` |

## 7. Incrementos posteriores registrados (fichas, textuales) y solape

**Aceptación idéntica en `backend` y `frontend` (ficha, textual):** «Petición de contacto+ownerId sin reasignar rechazada sin cambio parcial.» + «Lectura equipo no concede editar equipo.» + «Responsable nuevo, actor y antes/después quedan trazados sin PII innecesaria.»

| Incremento | Depende de | Objetivo (ficha) | Archivos (ficha) |
|---|---|---|---|
| **COM-02 `backend`** | COM-01 | «Completar el alcance de servidor de este paso y sus pruebas. Si no cabe en una entrega revisable, el coordinador registra todos los subpasos antes de delegar código.» | `modules/commercial/customers/**`, `common/security/access-catalog.ts` + `.spec.ts` — **sin** `schema.prisma` (§3) |
| **COM-02 `frontend`** | COM-01 | «Conectar la interfaz al contrato de servidor auditado y verificar su recorrido; sin cambiar reglas desde el navegador.» | `pages/CustomersPage.tsx` + `.spec.tsx`, `services/customers.service.ts` + `.spec.ts`, `features/customers/**` |

**Solape con COM-03…COM-09 y CAT-01…CAT-09 (writePaths de sus fichas, revisados con `preparar-tanda.mjs --list` y `tareas.json`, sin escribirlos):**

| Archivo compartido con COM-02 | Fichas que lo tocan |
|---|---|
| `common/security/access-catalog.ts` + spec | COM-02 `backend`, COM-03 `backend`, COM-06 `backend-solicitudes/atencion/excel`, COM-07 `backend-sincronizacion/indicadores`, COM-08 `backend`, COM-09 `backend`, CAT-01 `backend`, CAT-05 `backend-reglas/api`, CAT-06 `backend`, CAT-07 `backend`, CAT-08 `backend` |
| `prisma/schema.prisma` + `migrations/**` | COM-06/07/08, CAT-01/02/04/05/06/07/08 — **COM-02 no lo incluye** (su ficha lo excluye; §3/F5) |
| `pages/CustomersPage.tsx`, `features/customers/**`, `services/customers.service.ts` | **sin solape**: solo COM-02 |
| `frontend/src/App.tsx` + spec | COM-06/07/08 `frontend-*` — **no** COM-02 |
| `modules/commercial/quotes/**` | COM-03 y COM-09 (vecino de apartado, **no** solape con customers) |

**Cadena:** COM-03 (cotizaciones) y COM-09 (descuentos) heredan el patrón DTO-separado y la lectura de cliente autorizado (`quotes:create` depende de `customers:read`, catálogo `:71`); COM-02 deja el catálogo con `customers:*` sin romper dependencias (`assertDependencies` exige `customers:read` al añadir `customers:edit|reassign`, COM-01 §2.1).

## 8. Fuentes leídas con estado y decisiones pendientes

| Fuente | Marca | Aporte |
|---|---|---|
| `src/backend/.../customers/customers.controller.ts` (93) | **OBS** (idéntico en copia) | §2.1-2.2: rutas, `@Roles` solos, sin `@Permissions` |
| `src/backend/.../customers/dto/update-customer.dto.ts` (16) | **OBS** | §2.1: `PartialType(CreateCustomerDto)` — la prueba de la regla 1 |
| `src/backend/.../customers/dto/create-customer.dto.ts` (78) | **OBS** | §2.1: `status` `:50-53`, `ownerId` `:69-72`, `notes` `:74-77` |
| `src/backend/.../customers/customers.service.ts` (299) | **OBS** | §2.1/2.3/2.4: `scopeWhere` `:41-52`, update `:158-200`, guarda `:278-282`, auditoría `:190-197` |
| `src/backend/.../customers/customers.service.spec.ts` | **OBS** | tests preexistentes de scope/cartera/unicidad (§10) |
| `src/backend/prisma/schema.prisma:589-621` (`Customer`) | **OBS** | §3: campos ya existentes; sin migración prevista |
| `src/frontend/src/pages/CustomersPage.tsx` (333, idéntico en copia) | **OBS** | §2.5: gating por rol y `personal`; acciones sin concesión |
| `src/frontend/.../CustomerFormModal.tsx` | **OBS** | §2.5: expone `status` y `notes`, **no** `ownerId` |
| copia `.../security/access-catalog.ts` (149) | **OBS — solo en copia** | `customers:read/create/edit` `:67-69`, `customers:reassign` `:92`, paquetes `:209-244`; **sin `customers:convert|delete`** |
| copia `.../security/data-scope.ts` (164) | **OBS — solo en copia** | §4: `resolveAccess` por acción; regla (b) literal `:11`; `covers` `:85-88` |
| copia `.../hierarchy/hierarchy.service.ts` | **OBS** | §2.3/§4: `getSubordinateIds` con CTE y tope |
| `promotions.service.ts:71-129` / `listas.service.ts:454-489` | **OBS** | §2.4/§5.3: patrón de auditoría en transacción y selectiva |
| `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md` | **IP** | `:69-73` campos y separación; `:129` cartera con motivo; `:136-142` Ana; `:176,188` acciones; `:159` auditoría sin PII |
| `docs/PANELES-Y-PERMISOS.md:48` | **IP** | «sin … copias innecesarias de datos personales» |
| `contratos/COM-01.md` (209) | **IP** de esta tanda | §3.1 acciones; §2.1-2.5 catálogo/resolver/D5 |
| `contratos/BASE-02.md` §3, §5, §7 | **IP/OBS** | acciones por hijo; concesiones independientes; semántica de error |
| `estado.json` | **OBS** | solo `BASE-01/inventario`; `decisions: {}` |
| `tareas.json` + `preparar-tanda.mjs COM-02 contrato` | **OBS** | ficha canónica y writePaths (§7) |

| # | Decisión o bloqueo | Afecta | Estado |
|---|---|---|---|
| D2 | Catálogo propio `apartado:acción` (adoptado en la copia) vs catálogo UA con puntos | IDs `customers:*` | **Herida de BASE-02 §11 — confirmación del coordinador pendiente** |
| D5 | Extender `@Permissions`/`PermissionsGuard` a toda la superficie; el módulo customers hoy no lo usa (§2.2) | acceptance «por URL/API», §4 transición | **Pendiente — decisión del coordinador** |
| E6 | Revalidación de `AccessGrant` por petición (extender D3) y refetch de concesiones | §4 y botones del frontend | **Pendiente (heredada de COM-01)** |
| F1 | **Estado fuera del DTO general:** ¿endpoint/status propio con acción nueva o solo `convert` + soft delete? El catálogo **no tiene** `customers:status` | §3, §6 | **Pendiente — decisión del coordinador** |
| F2 | `customers:convert` y `customers:delete` citados en DISENO:176 como existentes, **ausentes** del catálogo adoptado (OBS, como E3 de COM-01) | §2.2, §3, §6 | **Pendiente** |
| F3 | «Consulta autorizada del responsable» (DISENO:188) sin acción equivalente; `fetchUsers()` sin gating (§2.5) | §3 reasignación, frontend | **Pendiente** |
| F4 | **PII de notas:** ¿retención mínima en auditoría (omitir valores de contacto) o traza completa justificada? DISENO:159/PANELES:48 fijan el principio, no el detalle de campo | §2.4, §5.3 | **Pendiente — decisión del coordinador si el diseño no basta** |
| F5 | writePaths `backend` **sin** `schema.prisma`: ¿el «motivo e historial» de cartera (DISENO:129) cabe en `AuditLog` o exige tabla propia (migración)? | §3, §5.3 | **Pendiente — ampliación de ficha si aplica** |
| F6 | ¿La reasignación admite «sin responsable» (`disconnect`, hoy posible `customers.service.ts:177`)? | §3, §6 | **Pendiente** |
| B1-B4 | Heredadas de BASE-02 §11 (Yéminus, Excel «Pedidos», descuentos, preview) | no cambian aquí | **Pendientes** |

## 9. Criterios de aceptación del paso (ficha, textuales)

1. ✅ «Contrato consistente con dependencias y decisiones pendientes explícitas.» — §1 declara `dependsOn: COM-01` **implementado en copia, no aceptado en `estado.json`**; §8 enumera D2, D5, E6, F1-F6 y B1-B4.
2. ✅ «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.» — §7 registra `COM-02 backend` y `COM-02 frontend` con sus fichas textuales y el solape con COM-03…COM-09 y CAT-01…CAT-09.

**Advertencia de modalidad (TANDA-COMPLETA:14):** todo lo marcado **PROP** es una propuesta para la **auditoría final única** del coordinador; no sustituye `estado.json`, no modifica aceptaciones y no autoriza implementación, migraciones ni despliegues. En particular, §3 propone cambiar el comportamiento de un `PATCH` ya en uso: su coordinación con COM-01 (que fija catálogo y concesiones) y con COM-03/COM-09 (que consumen la lectura de clientes) debe resolverse antes de delegar código.

## 10. Evidencia reproducible

Comandos desde la raíz del repo (solo lectura):

```bash
git status --porcelain; git rev-parse --short HEAD            # baseline S3: 32 líneas
node docs/ejecucion-paneles/preparar-tanda.mjs COM-02 contrato
node docs/ejecucion-paneles/preparar-tanda.mjs --list         # pasos COM-03…09, CAT-*
rg -n '@Permissions\(' src/backend/src/modules/commercial/customers/   # vacío (S3 y copia)
rg -n '@Roles\(' src/backend/src/modules/commercial/customers/customers.controller.ts
rg -n 'PartialType|ownerId|status' src/backend/src/modules/commercial/customers/dto/*.ts
sed -n '158,200p;278,282p' src/backend/src/modules/commercial/customers/customers.service.ts
rg -n 'customers:|selection\(' /home/soporte/office_ai/gs-tanda-01/src/backend/src/common/security/access-catalog.ts
rg -n 'team|covers|deny' /home/soporte/office_ai/gs-tanda-01/src/backend/src/common/security/data-scope.ts
diff -q src/frontend/src/pages/CustomersPage.tsx /home/soporte/office_ai/gs-tanda-01/src/frontend/src/pages/CustomersPage.tsx   # vacío
diff -rq src/backend/src/modules/commercial/customers/ /home/soporte/office_ai/gs-tanda-01/src/backend/src/modules/commercial/customers/
rg -n 'ownerId|status|notes' src/frontend/src/features/customers/components/CustomerFormModal.tsx
```

- **No ejecutado (y no acreditado):** suites jest/vitest, levantamiento de la aplicación, llamadas HTTP con permisos, pruebas con PostgreSQL desechable, consulta de datos reales. §5 lista las pruebas **previstas**, no realizadas.

## 11. Riesgos de este contrato

- Retirar `ownerId`/`status` del DTO general **cambia un contrato de API en uso**: cualquier cliente interno que hoy los envíe recibirá 400 (deseado, pero debe coordinarse con el frontend de la misma ficha, §7).
- Dejar la reasignación en un endpoint nuevo sin que `customers:reassign` esté **habilitada y concedible** (depende de COM-01 y de su E1/E2) produciría un endpoint denegado para todos salvo Super Admin hasta que la concesión exista.
- Aprobar §4 sin D5 mantiene que «sin concesiones no hay escritura» sea **solo parcialmente** cierto en servidor (§2.2), igual que en COM-01 §4.
- Si F5 resuelve el historial de cartera con una tabla nueva, los writePaths actuales de la ficha son insuficientes (§3/§7): delegar sin ampliar la ficha obligaría a tocar `schema.prisma` fuera de writePath.
- El solape de `access-catalog.ts` con 11 fichas (§7) exige que COM-02 no reordene ni reescriba entradas existentes del catálogo, solo añada las que F1/F2 autoricen.
