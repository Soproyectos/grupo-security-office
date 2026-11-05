<!--
Plantilla compartida por `gs-disenador-web` y `gs-funcionalidad-web`.
Cada skill escribe solo sus secciones. Las secciones 1 y 3 las completa el diseño.
-->

# Traspaso: Agenda y tareas, equipos y permisos

- **Tema:** Agenda de equipos (jerarquía `supervisorId`, paquete «Jefe de equipo», lista de personas, tope de lectura)
- **Fecha:** 2026-10-28
- **Pantalla / ruta:** `/agenda` y gestión de usuarios (cambio de jefe)
- **Estado:** `integrado`
- **Sesión que lo pide:** coordinador, documento `odd/tasks/agenda-equipos-y-permisos.md` (T1-T3 backend)

## 1. Lo que pide el diseño

**Qué verá y hará la persona** (decisiones aprobadas por el usuario el 2026-10-28):

- Cada persona interna ve y completa su propia agenda sin que nadie le asigne nada.
- Un jefe de equipo (cualquier rol) ve a su equipo, asigna tareas y las completa si se le da el paquete «Jefe de equipo».
- Quien solo puede «ver equipo» (sin asignar) ve la agenda del equipo en modo lectura, sin error.
- El selector «Asignar a» lista a todas las personas activas del equipo, no solo vendedores.
- Una tarea completada queda bloqueada.
- Solo el Super Admin cambia el jefe de cualquiera; los demás solo dentro de su propio equipo.
- Si hay más de 1000 actividades, la pantalla avisa que no se muestran todas.

(Secciones de datos, estados y mensajes de pantalla: las completa el diseño al integrar.)

## 2. Respuesta de funcionalidad

### 2.1 Lista de personas: `GET /api/team-workflow/sellers`

- Request: sin cuerpo.
- Response: arreglo `{id, name}` (solo esos dos campos), ordenado por nombre. El nombre del endpoint se conserva por compatibilidad.

```json
{ "data": [ { "id": "6f1c...", "name": "Ana Pérez" }, { "id": "a02d...", "name": "Luis Gómez" } ] }
```

(`data` es el envoltorio global de la API.)

| Quien llama | Qué recibe |
|---|---|
| Super Admin | Todo el personal interno activo (roles internos), cualquier rol |
| Con `activities:assign` de equipo | Personas activas de su equipo (subordinados directos e indirectos) y él mismo, sin filtrar por rol |
| Solo `activities:read` de equipo (sin asignar) | La misma lista, solo para lectura (la vista de equipo no recibe 403). Crear o reasignar sigue exigiendo `activities:assign` |
| Solo agenda propia (nivel 0) | 403 `TEAM_DIRECTORY_FORBIDDEN`. Elegido sobre «lista vacía» porque no revela nada y el front ya sabe por sus permisos que no debe llamarlo |

Un jefe sin subordinados recibe una lista con solo él (no 403).

### 2.2 Crear y reasignar

- `POST /api/team-workflow/activities`: además del permiso y la pertenencia al equipo (403 si no), el asignado debe existir y estar activo (400 `ASSIGNEE_NOT_ACTIVE`; no revela si no existe o está inactivo).
- `PATCH /api/team-workflow/activities/:id/assign`: igual validación de destino; además rechaza si la actividad ya está completada (409 `ACTIVITY_ALREADY_COMPLETED`). La escritura es condicional a estado pendiente (cubre la carrera con «completar»).
- `PATCH .../:id/complete`: la segunda vez devuelve 409 `ACTIVITY_ALREADY_COMPLETED` (antes sin código; mismo mensaje).
- `POST .../:id/links` y `DELETE .../:id/links/:linkId`: sobre una actividad completada devuelven 409 `ACTIVITY_ALREADY_COMPLETED`.

### 2.3 Aviso de tope: `GET /api/team-workflow/activities`

El cuerpo NO cambia (sigue siendo el arreglo de actividades dentro de `data`). Se añaden encabezados de respuesta:

| Encabezado | Valor |
|---|---|
| `X-Total-Truncated` | `true` si había más actividades que el tope; `false` si no |
| `X-Activities-Limit` | `1000` |
| `Access-Control-Expose-Headers` | `X-Total-Truncated, X-Activities-Limit` (para que el navegador los pueda leer) |

Orden `startsAt` ascendente: al truncar faltan las más recientes. Ejemplo:

```
HTTP/1.1 200 OK
X-Total-Truncated: true
X-Activities-Limit: 1000

{ "data": [ { "id": "...", "title": "Llamar a cliente", "status": "PENDING", "assignee": { "id": "...", "name": "Ana" }, "events": [], "links": [] } ] }
```

En el front con axios: `response.headers['x-total-truncated'] === 'true'`.

### 2.4 Cambio de jefe

- `PATCH /api/users/:id/supervisor`, cuerpo `{ "supervisorId": "<uuid>" | null }`. Ya no exige rol fijo: cualquier persona autenticada puede llamarlo y las reglas deciden.
- `PUT /api/users/:id` (solo Super Admin, sin cambio): si trae `supervisorId`, aplica las mismas reglas (cierra el bypass; antes no comprobaba ciclos).

Reglas:

| Quien | Puede |
|---|---|
| Super Admin | Cualquiera hacia cualquiera, incluso quitar el jefe (`null`); sigue sin permitir ciclos |
| Cualquier otro | Solo cambiar el jefe de alguien de su rama (subordinados directos e indirectos), y solo hacia sí mismo o alguien de su rama. No puede cambiar su propio jefe ni el de sus superiores, ni dejar a alguien sin jefe (`null`), ni crear ciclos |

Respuesta de éxito: el usuario actualizado (como antes).

### Errores (código estable + mensaje)

| Código | HTTP | Mensaje |
|---|---|---|
| `SUPERVISOR_SELF_CHANGE` | 403 | No puedes cambiar tu propio jefe. |
| `SUPERVISOR_TARGET_OUT_OF_BRANCH` | 403 | Solo puedes cambiar el jefe de personas que ya están en tu equipo. |
| `SUPERVISOR_DESTINATION_OUT_OF_BRANCH` | 403 | El nuevo jefe debe ser tú o alguien de tu equipo. |
| `SUPERVISOR_REMOVAL_NOT_ALLOWED` | 403 | No puedes dejar a una persona sin jefe. Elige otra persona de tu equipo o a ti mismo. |
| `SUPERVISOR_CYCLE` | 409 | Ese cambio dejaría a alguien como jefe de su propio jefe. Elige otra persona. |
| `TEAM_DIRECTORY_FORBIDDEN` | 403 | No tienes permiso para ver a tu equipo. |
| `ASSIGNEE_NOT_ACTIVE` | 400 | La persona elegida no existe o ya no está activa. |
| `ACTIVITY_ALREADY_COMPLETED` | 409 | La actividad ya fue completada y no se puede modificar. (en `complete`: «La actividad ya fue completada») |

Los 403 por falta de permiso o de equipo existentes (sin código) se conservan: «Sin permiso activities:... sobre el alcance solicitado» y «Solo puedes trabajar con actividades propias o de tu equipo».

### Permisos que aplica el servidor

- Paquete asignable nuevo `jefe-de-equipo` («Jefe de equipo»): `activities:read` team + `activities:assign` team + `activities:complete` team. Solo agenda; no abre clientes, cotizaciones ni metas. Lo puede recibir cualquier persona con cualquier rol (no hay restricción por rol en `access-assignments`; el alcance `team` sale de `supervisorId`). El paquete `supervisor-comercial` no cambia (read + assign de equipo, sin completar, más clientes/cotizaciones/metas).
- Nivel 0 por rol (`base-access.ts`) sin cambios: read, create y complete propios. Lista de roles: Super Admin, Supervisor, Admin Comercial, Vendedor, Operador, Consulta (test de paridad con `agenda-access.ts` del front).
- Directorio: ver 2.1. Cambio de jefe: ver 2.4. Admin Comercial pierde la facultad global de cambiar jefes: ahora solo en su rama.
- Diferencias servidor/interfaz a vigilar: el front debe mostrar el control «Asignar» con `activities:assign` y la vista de equipo con `activities:read` de equipo; el servidor exige lo mismo.

### Cambios de datos

Ninguno. Sin migración ni cambio de esquema. `ACCESS_CATALOG_VERSION` NO se subió (`panels-20261028-1`), porque el front la tiene copiada y un cambio rompería el control de versiones al asignar; el paquete nuevo aparece en el catálogo sin cambiar la versión. Decisión pendiente si se prefiere subirla en ambos lados a la vez.

### Pruebas ejecutadas

Ver la sección «Verification evidence» de `odd/tasks/agenda-equipos-y-permisos.md` (comandos y resultados exactos, incluidos fallos de entorno ajenos a este cambio).

### Lo que NO se pudo hacer y por qué

- Las pruebas que necesitan base de datos real (`workflow-links.spec`, `workflow-convert.spec`, `access-assignments.service.spec`) no pudieron correr: no hay PostgreSQL en `localhost:54331`.
- `npx tsc --noEmit` ya tenía 17 errores en archivos de precios y productos ajenos a este cambio; ninguno en los archivos tocados.

### Aprobaciones pendientes del usuario

- Commit y push (AGENTS.md). No se hizo ninguno.
- Decidir si se sube `ACCESS_CATALOG_VERSION` en backend y frontend a la vez.

## 3. Integración
<!-- Lo completa gs-disenador-web. -->

**Qué se conectó:**

- `/agenda` usa `agendaAccess` (nuevo: completar propio/de equipo) y el contrato de `team-workflow`: lista de personas (`sellers`) sin filtrar por cargo, 403 `TEAM_DIRECTORY_FORBIDDEN` tratado como «sin equipo» (sin aviso de error; un fallo de red sí muestra «Reintentar»), encabezados `X-Total-Truncated` / `X-Activities-Limit` (aviso discreto), mensajes en español para `ASSIGNEE_NOT_ACTIVE` y `ACTIVITY_ALREADY_COMPLETED`.
- Quien solo ve equipo: lista las tareas del equipo en solo lectura (sin «Asignar a», sin «Reasignar», puede crear en su propia agenda y se lo dice).
- Tarea completada: el detalle no ofrece reasignar ni enlaces y explica por qué.
- Estados vacíos que guían (primer uso, equipo sin tareas, sin personas a cargo, filtros que ocultan todo).
- `BASE_ACCESS_ROLES` exportado en `agenda-access.ts` (el test de paridad del backend lo lee por texto; no se tocó).
- Se borró el reexport huérfano `features/supervisor/AgendaCalendarPage.tsx`.

**Validación hecha:** specs de vitest de agenda y servicio (151 pasan), eslint sin salida, tsc sin errores en archivos tocados, paridad de roles del backend (2 pasan). Detalle y fallos ajenos en `odd/tasks/agenda-equipos-y-permisos.md`. NO se verificó en navegador ni a 375px/1440px.

**Pendientes:**

- Verificación visual en navegador (los clics del diálogo no se pueden probar en render de servidor).
- Diferencia a vigilar: `canAssignOthers` = `activities:assign` de equipo y `canUseTeam` = `activities:read` de equipo, igual que el servidor; el servidor sigue siendo quien autoriza.
- El paquete `jefe-de-equipo` probablemente no aparece en Usuarios: `PACKAGE_PANELS` en `UserAccessAssignments.tsx` lista ids a mano y no lo incluye. Decisión del usuario (junto con `ACCESS_CATALOG_VERSION`).
- Commit y push: no hechos (AGENTS.md).
