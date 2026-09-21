# Plan: Dashboards compuestos por permisos + rol Vendedor

**Estado**: propuesto — pendiente de aprobación
**Fecha**: 2026-09-21
**Origen**: diseño Claude Design "Dashboard — Grupo Security" (6 artboards, 1440px)

---

## 1. Contexto

El diseño entrega seis tableros, uno por rol: Vendedor, Supervisor, Admin Comercial,
Super Admin, Operador y Consulta. En total **~49 bloques** (KPIs y paneles), con
solapamiento real entre roles.

El modelo actual (`Dashboard.tsx`, 718 líneas) resuelve la visibilidad con
`DASHBOARD_SECTION_ROLES`: 7 secciones mapeadas a listas de roles. Ese mapeo no
escala a 49 bloques ni admite excepciones por usuario.

## 2. Decisiones cerradas

| # | Decisión | Resolución |
|---|---|---|
| 1 | Composición multi-rol | **Aditiva**: unión de los bloques de todos los roles del usuario, deduplicada. No hay "un dashboard por rol". |
| 2 | Indirección | Los bloques cuelgan de **permisos**, no de roles. El rol es un paquete de permisos. |
| 3 | Granularidad | **Híbrida**: paquetes temáticos con desplegable de bloques; casilla de tres estados (vacía / parcial / completa). |
| 4 | Paquete vs bloques | Se soportan ambos. Marcar el paquete guarda el paquete (crece al agregar bloques nuevos); marcar piezas sueltas guarda las piezas (congelado). |
| 5 | Revocaciones | **No** en esta iteración. La columna `effect` queda preparada en el modelo. |
| 6 | Rol Vendedor | **Se crea**. Es el tablero más grande del diseño (1680px, 7 paneles, 6 KPIs). |
| 7 | Rol Operador | **En reserva**, sin uso activo. Cede la función comercial a Vendedor. Destino futuro: técnico de campo / soporte / inventario. |

### Regla de composición

```
permisos efectivos = permisos de TODOS sus roles
                   ∪ concesiones individuales (GRANT)
                   − revocaciones individuales (REVOKE)   ← fase futura
```

El dashboard recorre el catálogo de bloques, filtra por permiso y compone. Al ser
un `Set`, la deduplicación multi-rol es automática.

### Regla de alcance (scope)

Hay bloques idénticos con distinto alcance según el rol: "Mejores clientes de la
empresa" (Supervisor) vs "Mejores clientes del mes" (Vendedor); "Auditoría global"
(Super Admin) vs "Auditoría reciente" (Admin Comercial).

**Regla: un solo bloque, el alcance más amplio que el usuario tenga permitido.**
Renderizar ambos produciría la misma tabla dos veces con datos distintos.

---

## 3. Lo que ya existe (no hay que construirlo)

| Pieza | Ubicación |
|---|---|
| Roles, permisos por rol, usuario N:N roles | `schema.prisma`: `Role`, `RolePermission`, `UserRole` |
| Login que suma permisos de todos los roles | `auth.service.ts:39` |
| Guard de permisos en backend | `common/guards/permissions.guard.ts` |
| `hasPermission()` / `hasAnyPermission()` | `frontend/src/lib/rbac.ts` |
| Metas de venta | `modules/commercial/sales-targets` + `model SalesTarget` |
| Cotizaciones, clientes, pedidos | `modules/commercial/{quotes,customers,sales-orders}` |
| Jerarquía supervisor→subordinados | `User.supervisorId` / `User.subordinates` |

**Falta únicamente**: la tabla de concesiones por usuario y el catálogo de bloques.

---

## 4. Catálogo de permisos

Se extiende la convención existente (`recurso:accion`) con un tercer segmento:

- `dashboard:pack:<id>` — paquete temático
- `dashboard:block:<id>` — bloque individual

`PermissionsGuard` compara strings exactos, así que no requiere cambios para
soportarlos.

### Los 9 paquetes

| Paquete | Bloques | Roles que lo traen por defecto |
|---|:-:|---|
| `ventas` — Ventas y metas | 7 | Supervisor, Vendedor, Super Admin |
| `cotizaciones` — Cotizaciones | 9 | Supervisor, Vendedor |
| `clientes` — Clientes | 1 | Supervisor, Vendedor |
| `catalogo` — Catálogo | 8 | Consulta, Vendedor, Admin Comercial, Super Admin |
| `listas` — Listas | 5 | Consulta, Admin Comercial, Super Admin |
| `publicacion` — Publicación | 2 | Super Admin, Admin Comercial |
| `usuarios` — Usuarios y accesos | 7 | Super Admin, Admin Comercial, Supervisor |
| `auditoria` — Auditoría y salud | 4 | Super Admin, Admin Comercial, Supervisor |
| `operacion` — Operación de productos | 6 | Operador |

Los bloques "Saludo + CTA" y "Accesos rápidos" del tablero de Vendedor son
estructura de página, no bloques con permiso.

---

## 5. Fases

### Fase 0 — Rol Vendedor (backend) — ✅ COMPLETADA 2026-09-21

**Decisión tomada**: *Operador* queda **en reserva**, sin uso activo. Su destino
futuro es técnico de campo / soporte / inventario, alcance aún sin definir. Cede
por completo la función comercial a *Vendedor* y conserva sólo lectura de catálogo.

Ejecutado:

- `prisma/seed.ts`: rol `'Vendedor'` en `ROLE_PERMISSIONS` y `ROLE_DESCRIPTIONS`;
  `Operador` marcado como RESERVADO. El seed pasa de 5 a 6 roles.
- Escritura comercial `Operador` → `Vendedor` en `customers`, `quotes`,
  `sales-orders` y `sales-targets` (`READ_ROLES`, `WRITE_ROLES`, `ALL_ROLES`).
- Transiciones de estado de cotizaciones (`quotes.service.ts`): 4 transiciones
  (`enviada`, `negociacion`, `perdida`, `cancelada`) pasan a `Vendedor`.
- `Vendedor` agregado a los 21 endpoints de lectura de catálogo (`products`,
  `categories`, `brands`, `prices`, `listas`, `dashboard`, `assignments`),
  necesarios para cotizar. `Operador` se conserva ahí: la lectura es inocua.

**Verificado**: `tsc --noEmit` limpio · 719/719 tests en verde.

---

### Fase S — Hardening del Super Admin — ✅ BACKEND COMPLETADO 2026-09-21

**Objetivo**: que comprometer una sola contraseña no entregue el control total.

#### Auditoría del estado actual (2026-09-21)

Ya correcto: `helmet`, cookie `httpOnly`, `@nestjs/throttler` (5 intentos/min en
login), `JWT_SECRET` obligatorio sin *fallback*, y `jwt.strategy` revalida
`isActive` contra la BD en **cada** petición — desactivar un usuario corta sus
sesiones de inmediato.

| # | Hallazgo | Sev. | Estado |
|---|---|---|---|
| 1 | El seed hacía `update: { password }` con `'admin123'`: **cada ejecución restablecía la contraseña del Super Admin** a un valor público, anulando cualquier cambio del titular | Crítico | ✅ Corregido (SEC-SEED-001) |
| 2 | Coste de bcrypt inconsistente: 12 en el seed, 10 en `users.service` | Alto | ✅ Corregido — constante compartida |
| 3 | Sin MFA: una sola contraseña separa a cualquiera del control total | Crítico | ✅ Corregido — TOTP obligatorio para Super Admin |
| 4 | Sin bloqueo de cuenta ni registro de intentos fallidos. El *throttle* es por IP: un ataque distribuido o lento no encuentra resistencia | Alto | ✅ Corregido — bloqueo progresivo por cuenta |
| 5 | Política de contraseña = `@MinLength(8)`. `admin123` la cumple | Alto | ✅ Corregido — zxcvbn con diccionario del negocio |
| 6 | JWT de 8 h sin lista de revocación: no se puede cortar una sesión concreta ni cerrar sesión en otros dispositivos | Medio | ✅ Corregido — sesiones con `jti` revocable |
| 7 | El JWT lleva `roles` y `permissions` embebidos → hasta 8 h de desfase tras cambiar permisos. **Afecta directo a la fase 5** | Medio | ✅ Mitigado — un cambio de roles revoca las sesiones del usuario |
| 8 | `sameSite: 'lax'` en la cookie de sesión de un panel administrativo | Medio | ✅ Corregido — `sameSite: 'strict'` |
| 9 | Sin re-autenticación (*step-up*) para operaciones críticas del Super Admin | Medio | Modelo `StepUpGrant` creado; guard pendiente |
| 10 | Nada impide que el único Super Admin se autodesactive o se quite el rol (*lockout* irreversible) | Medio | ✅ Corregido — break-glass + no autoservicio |
| 11 | El ejemplo de Swagger publica `admin123` como contraseña de referencia | Bajo | ✅ Corregido |

#### Librerías instaladas

| Paquete | Uso |
|---|---|
| `otplib` | TOTP (segundo factor compatible con Google Authenticator / Authy) |
| `qrcode` + `@types/qrcode` | QR de enrolamiento del segundo factor |
| `@zxcvbn-ts/core` + `language-common` + `language-es-es` | Fuerza real de contraseña, con diccionario en español |

No se migra a `argon2`: `bcrypt` con coste 12 es aceptable según OWASP y migrar
hashes en caliente añade un riesgo que no compensa. Revisable más adelante.

#### S.1 — Política de contraseñas

Servicio `PasswordPolicyService` sobre `@zxcvbn-ts`: puntuación mínima 3 sobre 4,
con diccionario español y una lista de términos del negocio (`security`, `grupo`,
`admin`, dominio corporativo) para que no pasen variantes obvias. Se aplica en
creación y cambio de contraseña. Para Super Admin, mínimo 4 sobre 4.
El frontend muestra el medidor en vivo; **la validación que manda es la del backend**.

#### S.2 — Segundo factor (TOTP)

- Modelo `UserMfa`: `userId`, `secret` (cifrado en reposo), `enabled`,
  `backupCodes` (hasheados con bcrypt, de un solo uso), `confirmedAt`.
- Flujo de enrolamiento: generar secreto → QR → confirmar con un código válido
  antes de activar. Nunca se activa sin comprobar que el usuario puede generarlo.
- Login en dos pasos: credenciales → token temporal de 5 min con *scope* `mfa` →
  código TOTP → cookie de sesión definitiva.
- **Obligatorio para Super Admin**: sin MFA confirmado, su sesión sólo puede
  acceder al flujo de enrolamiento. Opcional para los demás roles.
- Códigos de respaldo: 10, de un solo uso, mostrados una única vez.

#### S.3 — Bloqueo de cuenta y registro de intentos

- Modelo `LoginAttempt`: `email`, `ip`, `userAgent`, `success`, `createdAt`.
- Bloqueo progresivo **por cuenta** (no sólo por IP): 5 fallos → 15 min;
  10 → 1 h; 15 → bloqueo hasta desbloqueo manual por otro Super Admin.
- Respuesta de tiempo constante y mensaje idéntico para usuario inexistente,
  contraseña incorrecta y cuenta bloqueada: no se filtra qué correos existen.
- Todo intento fallido contra una cuenta Super Admin genera evento de auditoría
  de severidad alta.

#### S.4 — Sesiones revocables

- Modelo `Session`: `jti`, `userId`, `ip`, `userAgent`, `expiresAt`, `revokedAt`.
- El JWT incorpora `jti`; `jwt.strategy` verifica que la sesión siga viva.
  Ya consulta la BD en cada petición, así que **no añade coste de red**.
- Pantalla "Sesiones activas" con cierre remoto, por dispositivo o todas.
- Al cambiar la contraseña se revocan todas las demás sesiones.

#### S.5 — Protecciones específicas del Super Admin

- **Step-up**: reintroducir contraseña + TOTP para conceder permisos, cambiar
  roles, eliminar usuarios o tocar la configuración. Vale 15 minutos.
- **Break-glass**: el sistema exige **al menos dos** Super Admin activos. Se
  rechaza desactivar, eliminar o degradar al último que quede.
- **Sin autoservicio**: un Super Admin no puede modificar su propio rol. Otro
  Super Admin debe hacerlo.
- **Auditoría total**: al saltarse `PermissionsGuard` por excepción
  (BE-RBAC-001), *toda* acción de un Super Admin se registra sin excepción.
- Cookie a `sameSite: 'strict'` y sesión más corta para roles privilegiados
  (2 h en vez de 8 h).

#### S.6 — Higiene

- Quitar `admin123` del ejemplo de Swagger.
- `.env.example` documentando `SEED_SUPER_ADMIN_PASSWORD` y `SEED_COMPRAS_PASSWORD`.
- Aviso en el primer ingreso si la contraseña se generó automáticamente.

#### Lo ejecutado

Migración `20260921152429_add_security_mfa_sessions_login_attempts`, aditiva
(sin `DROP`), aplicada con `migrate deploy`. Modelos nuevos: `UserMfa`,
`MfaBackupCode`, `LoginAttempt`, `Session`, `StepUpGrant`, más
`User.passwordChangedAt`.

Servicios en `src/common/security/` (módulo `@Global`):

| Servicio | Responsabilidad |
|---|---|
| `PasswordPolicyService` | zxcvbn con diccionario español + términos del negocio |
| `AccountLockoutService` | Registro de intentos y bloqueo progresivo por cuenta |
| `MfaCryptoService` | AES-256-GCM para los secretos TOTP + comparación en tiempo constante |
| `MfaService` | Enrolamiento, verificación y códigos de respaldo |
| `SessionService` | Sesiones revocables por `jti` |
| `PrivilegedAccountService` | Break-glass y prohibición de autoservicio |

Login reescrito en dos pasos (`POST /api/auth/login` →
`POST /api/auth/mfa/verify`), con enrolamiento obligatorio para Super Admin
(`/api/auth/mfa/enroll/{start,confirm}`) y gestión de sesiones
(`GET /api/auth/sessions`, `POST /api/auth/sessions/revoke-others`).

Endurecimientos adicionales no previstos en la especificación inicial:

- **Anti-enumeración de cuentas**: con un correo inexistente se ejecuta bcrypt
  igualmente contra un hash de descarte, y el mensaje de error es idéntico al de
  contraseña incorrecta y cuenta inactiva. Sin esto, el tiempo de respuesta
  revelaba qué correos están registrados.
- **Los tokens de desafío no son sesiones**: `jwt.strategy` rechaza cualquier
  token con `scope`. Sin esa comprobación, el token intermedio emitido tras
  validar la contraseña habría servido para usar la API saltándose el MFA.
- **El bloqueo corre desde el fallo que lo disparó**, no desde "ahora": de lo
  contrario un tercero podría mantener bloqueada la cuenta de otro reintentando
  periódicamente (denegación de servicio contra el titular).
- **Coste de bcrypt unificado** en `password.constants.ts`.

**Verificado**: `tsc --noEmit` limpio · **768/768 tests en verde** (45 suites,
+49 tests nuevos) · el backend arranca y mapea las 9 rutas de `/api/auth` · E2E
del bloqueo contra el servidor real.

Medición real de la política (no estimada):

| Contraseña | Score | Veredicto |
|---|:-:|---|
| `admin123` | 1 | Rechazada |
| `compras123` | 1 | Rechazada |
| `GrupoSecurity2026!` | 2 | Rechazada |
| `gruposecurity` | 0 | Rechazada (era 3 sin el diccionario del negocio) |
| `SeguridadGrupo1` | 3 | Aceptada para usuario normal, **rechazada** para Super Admin |
| `correcto-caballo-bateria-grapa` | 4 | Aceptada |

#### Pendiente de la Fase S

- **Frontend**: pantalla de segundo paso del login, enrolamiento con QR,
  medidor de fuerza de contraseña, pantalla de sesiones activas.
- **Guard de step-up**: el modelo `StepUpGrant` existe; falta el decorador
  `@RequiresStepUp()` y su guard para las operaciones críticas.
- **Desbloqueo administrativo** de cuentas desde `UsersPage`.
- **Tarea programada** que ejecute `SessionService.pruneExpired()`.

> **Riesgo operativo**: `MFA_ENCRYPTION_KEY` es obligatoria y la aplicación
> **no arranca sin ella**. Es deliberado: guardar los secretos TOTP en claro
> anularía el segundo factor frente a una filtración de BD. Si la clave se
> pierde o cambia, los secretos existentes dejan de descifrarse y los usuarios
> deben reenrolarse con sus códigos de respaldo. Documentada en `.env.example`.

**Aceptación**: un Super Admin no puede operar sin MFA confirmado; 15 intentos
fallidos bloquean la cuenta y dejan rastro en auditoría; revocar una sesión la
corta en la siguiente petición; no se puede dejar el sistema con un solo Super
Admin; `admin123` es rechazada por la política.

---

### Fase 1 — Catálogo de bloques y motor de composición — ✅ COMPLETADA 2026-09-21

**Objetivo**: el dashboard se arma desde datos, no desde `if` por rol.

- `frontend/src/features/dashboard/registry/blocks.ts`: catálogo de los ~49 bloques.
  Cada entrada declara `id`, `permission`, `pack`, `kind` (`kpi` | `panel`),
  `span` (`full` | `half`), `order`, `scope` y el componente.
- `frontend/src/features/dashboard/registry/packs.ts`: los 9 paquetes y su
  expansión a bloques.
- `frontend/src/lib/roles.ts`: `DASHBOARD_SECTION_ROLES` queda **deprecado**;
  se migran sus 7 secciones al catálogo nuevo.
- `Dashboard.tsx` pasa a compositor: filtra por permiso, resuelve alcance, ordena
  y renderiza. Debe quedar por debajo de ~150 líneas.
- Backend: `dashboard.controller.ts` usa hoy `@Roles(...)` con los 5 roles
  escritos a mano (`:22`, `:46`). Migrar a `@Permissions(...)`.

#### Lo ejecutado

`src/features/dashboard/registry/`:

| Archivo | Contenido |
|---|---|
| `types.ts` | Tipos, alcances (`own < team < commercial < global`) y formato de los permisos |
| `blocks.ts` | **48 bloques** en 9 paquetes — el catálogo completo del diseño |
| `compose.ts` | Motor puro: expansión de permisos, deduplicación, resolución de alcance y orden |
| `compose.spec.ts` | 22 tests |

`DashboardComposer.tsx` arma el panel desde el catálogo, sin una sola decisión
por rol. `Dashboard.tsx` queda en **6 líneas efectivas** y delega en él; el panel
anterior sobrevive como `LegacyDashboard` y se sirve como respaldo mientras las
fases 3, 4 y 6 rellenan los componentes, de modo que nadie ve una pantalla en
blanco durante la transición.

Backend: `dashboard-permissions.ts` define los 9 paquetes y qué rol trae cada
uno; el seed los deriva de ahí en vez de escribirlos a mano en cada rol.

Distribución real, ya en base de datos:

| Rol | Paquetes | Bloques visibles |
|---|:-:|:-:|
| Super Admin | 9 | 48 |
| Supervisor | 5 | 27 |
| Admin Comercial | 5 | 25 |
| Vendedor | 4 | 25 |
| Operador | 2 | 14 |
| Consulta | 2 | 13 |

**Deduplicación multi-rol verificada con datos reales** (Supervisor + Admin
Comercial): 27 + 25 = **52 bloques en bruto → 42 únicos**, con 10 compartidos
que se muestran una sola vez.

#### Desviación respecto a lo planificado

El plan decía migrar `dashboard.controller` a `@Permissions`. **No se hizo, y
es correcto no hacerlo**: esos endpoints devuelven el espacio de trabajo propio
del usuario (ya acotado en el servidor) y enumeraban los 6 roles, es decir,
equivalen a "cualquier usuario autenticado". Además `PermissionsGuard` evalúa
con semántica AND, así que no puede expresar "alguno de estos paquetes".

En su lugar se atacó el problema real, detectado al crear el rol Vendedor:
**21 endpoints enumeraban los roles como literales sueltos**, repartidos en 7
archivos. Olvidar uno no rompe nada visible — ese rol recibe un 403 en un sitio
concreto, que es la clase de fallo que aparece tarde y en producción.
`common/rbac/roles.constants.ts` centraliza `ALL_ROLES`,
`COMMERCIAL_READ_ROLES` y `COMMERCIAL_WRITE_ROLES`, y los 21 endpoints más los
4 controladores comerciales ya los usan. Un rol nuevo entra en un solo sitio.

De paso se detectó que los 2 endpoints de consulta de precio por SKU
(`import.controller`) se habían quedado sin Vendedor: exactamente el fallo que
la constante previene.

**Verificado**: `tsc` limpio en backend y frontend · 768/768 tests backend
(estable en 3 corridas consecutivas) · 22/22 tests del motor · build del
frontend OK · permisos confirmados en base de datos.

#### Pendiente

Se instaló **vitest** en el frontend (no existía, pese a estar en el stack
aprobado) con los scripts `test` y `test:watch`.

**Aceptación**: ✅ tests unitarios del motor cubriendo — usuario mono-rol; usuario
Supervisor + Admin Comercial (deduplicación verificada: 52 en bruto → 42 únicos);
resolución de alcance; usuario sin permisos (estado vacío, no pantalla rota).

---

### Fase 2 — Base visual

**Objetivo**: las primitivas que se repiten en los 6 artboards.

- `tailwind.config.js`: agregar la escala slate del diseño como tokens nuevos
  (`surface`, `ink`) **sin tocar** `neutral` (anclado en `#484748`), los `fontSize`
  intermedios (10.5 / 11.5 / 12.5 / 13 / 15 / 26 / 27px) y radios 10/14/16px.
- `components/ui/StatCard.tsx` — tarjeta KPI, variantes `default` y `warning`
  (fondo ámbar `#FFFBEB` / borde `#FDE68A`).
- `components/ui/DataGrid.tsx` — tabla de `grid-template-columns` fraccionales con
  cabecera en Roboto Condensed.
- `components/ui/StatusPill.tsx` — insignias pastel (Actualizado, Pendiente, Alta,
  Media, Baja, Sí/No).

La marca ya coincide: el diseño usa `#CE0203` / `#AD0102` (= `security-500/600`),
Roboto y Roboto Condensed, todo presente en la config actual.

**Aceptación**: ningún TSX de dashboard contiene hex literales ni `text-[12.5px]`.

---

### Fase 3 — Paneles Operador y Consulta

**Objetivo**: primer recorrido completo del motor con bloques reales.

10 bloques sin gráficos (4 + 4 KPIs, 2 + 4 paneles). Datos desde `fetchMyWorkspace`,
que ya devuelve `kpis`, `listas` y `recentActivity`.

**Aceptación**: un usuario Operador y uno Consulta ven sus tableros con datos
reales y skeletons de carga. Lo que no tenga endpoint se marca como placeholder
explícito — **no se inventan cifras**.

---

### Fase 4 — Panel Vendedor

**Objetivo**: el tablero más importante del diseño.

7 paneles y 6 KPIs. Fuentes: `sales-targets` (meta mensual y avance),
`quotes` (embudo, recientes, necesitan atención), `customers` (mejores clientes),
`sales-orders` (cierre del mes).

Incluye el *bullet chart* de avance de meta. Se implementa con CSS puro (barras
superpuestas), sin librería.

**Aceptación**: un Vendedor ve meta, avance y embudo con datos reales de sus
propias cotizaciones (scope propio, verificado contra otro vendedor).

---

### Fase 5 — Concesiones por usuario

**Objetivo**: el Super Admin asigna bloques extra a usuarios concretos.

- `schema.prisma`: modelo nuevo.

  ```prisma
  model UserPermission {
    id         String   @id @default(uuid())
    userId     String
    permission String              // dashboard:pack:* o dashboard:block:*
    effect     String   @default("GRANT")   // GRANT | REVOKE (REVOKE: fase futura)
    grantedBy  String?
    reason     String?
    createdAt  DateTime @default(now())

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([userId, permission])
    @@index([userId])
    @@map("user_permissions")
  }
  ```

- `auth.service.ts`: tras armar los permisos de rol, sumar los `GRANT` del usuario
  y expandir los `dashboard:pack:*` a sus bloques. Es aditivo sobre lo existente.
- `UsersPage`: sección de concesiones con paquetes plegables y casilla de tres
  estados. Requiere `users:manage`.
- Toda concesión se registra en `AuditLog`.

**Aceptación**: un usuario Consulta al que se le concede `dashboard:pack:ventas`
ve los 7 bloques de ventas tras reautenticarse, sin cambio de rol; queda el evento
en auditoría.

> **Seguridad**: ocultar un bloque en el frontend no protege el dato. Cada endpoint
> que alimenta un bloque debe exigir el mismo permiso con `@Permissions(...)`.
> El frontend decide qué se dibuja; el backend, qué se entrega.

---

### Fase 6 — Paneles Super Admin, Supervisor y Admin Comercial

**Objetivo**: cerrar el diseño.

17 paneles, los más costosos: ranking con barras de avance, embudos, ventas por
categoría, distribución de usuarios por rol.

> **Decisión pendiente**: no hay librería de gráficos en `package.json`. Opciones —
> (a) CSS puro, coherente con la fase 4 y sin dependencias; (b) Recharts, ~500 KB,
> más rápido para gráficos compuestos. Recomendación: (a), dado que el diseño usa
> barras y embudos, no gráficos estadísticos.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| El rol Operador hoy cumple función de vendedor | Decisión explícita en fase 0 antes de tocar los controladores |
| Super Admin omite la validación de permisos por excepción (BE-RBAC-001, `permissions.guard.ts:59`) | Es deliberado y está documentado. El motor del dashboard debe replicar la excepción: Super Admin ve todos los bloques |
| Bloques duplicados con distinto alcance | Regla de alcance de la sección 2, cubierta por test en fase 1 |
| Permisos nuevos no llegan a usuarios ya logueados | El JWT se arma en login; documentar que las concesiones aplican tras reautenticar |
| 49 bloques sin mantenimiento | El catálogo es la única fuente de verdad; agregar un bloque es una entrada, no un `if` |

## 7. Fuera de alcance

- Revocaciones (`REVOKE`) — modelo preparado, lógica no implementada.
- Reordenar bloques por usuario o guardar layout personalizado.
- Dashboards para el portal de clientes (consulta externa).
- Etapa 8 de FSM legacy: **congelada**, sin relación con este trabajo.

## 8. Orden sugerido de ejecución

```
Fase 0 ──► Fase S ──► Fase 1 ──► Fase 2 ──► Fase 3 ──► Fase 4 ──► Fase 5 ──► Fase 6
 ✅        (seguridad) (motor)    (visual)   (simples)  (vendedor) (concesiones) (gráficos)
```

La fase S va primero porque el sistema de concesiones (fase 5) entrega poder
administrativo sobre la visibilidad de datos: carece de sentido construirlo
sobre una cuenta de Super Admin protegida sólo por contraseña.

Las fases 1 a 4 entregan un dashboard funcional y verificable. La 5 agrega la
administración de excepciones. La 6 es la más cara y puede diferirse.
