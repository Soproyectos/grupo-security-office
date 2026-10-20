# BASE-04 — Resolver acción y alcance por concesión individual (paso: contrato)

**Fecha:** 2026-10-15 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Este paso escribe únicamente `docs/ejecucion-paneles/contratos/BASE-04.md`; no modifica código, base de datos ni servicios activos, no ejecuta commits y **no edita `estado.json` ni `tareas.json`**.

**Modalidad — tanda continua (PROP):** conforme a `docs/ejecucion-paneles/TANDA-COMPLETA.md`, este contrato se propone para la auditoría final única del coordinador. **No es una decisión aprobada.** Todo lo marcado **PROP** es propuesta de esta entrega.

## Cómo leer este documento

| Marca | Significado |
|---|---|
| **OBS** | Hecho observado: verificado con `rg`/lectura directa en este checkout o en el worktree UA indicado (comandos en §12). |
| **IP** | Informe o diseño previo: lo afirma un documento anterior; no se re-ejecutó aquí. |
| **PROP** | Propuesta de esta entrega; no es una decisión aceptada. |
| **DESC** | Desconocido o no verificable desde este checkout. |

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha `BASE-04 contrato`, textual):** «Cerrar concesiones/esquema/contexto por acción, compatibilidad y migración local; registrar incrementos de implementación.»
- **dependsOn (ficha):** `BASE-02`. **OBS (tareas.json):** `BASE-04 backend` no declara dependencias adicionales, pero su cadena descendiente directa es `COM-01 → COM-02…COM-09` y `QA-01` (§9). Este documento **no verifica la aceptación** de BASE-02: ese estado vive en `estado.json`, que este paso no edita.
- **Reglas de la ficha (literales):** (1) «Resolver el alcance por acción; lectura de equipo no amplía edición propia.» (2) «Entregar contexto efectivo a módulos consumidores, que lo aplicarán en sus propias tareas.» (3) «No migrar cuentas reales ni autoconceder permisos; excepciones explícitas de Super Admin/cuenta propia.»
- **Referencia de la ficha:** `docs/PANELES-Y-PERMISOS.md`, sección «acciones y alcances por usuario; hijos Vendedor/Supervisor/Gestión y Catálogo».
- **requiredDecisions (ficha):** `[]` tanto en `contrato` como en `backend` (**OBS** tareas.json). **No obstante**, este contrato hereda decisiones abiertas de BASE-02 §11 (D1-D6, B1-B4) que condicionan su implementación (§10).
- **Criterios de aceptación del paso:** §11 (textuales de la ficha).

## 2. Alcance de este contrato

| Dimensión | Se fija aquí (PROP) | Queda fuera de este paso |
|---|---|---|
| Resolución | Qué decide el resolver: acción + alcance + procedencia → permitido/denegado, por petición, en servidor (§3) | Aplicar esas decisiones en cada módulo consumidor (COM-02…COM-09) |
| Contexto | Forma del «contexto efectivo» entregado a consumidores (§4) | Consultas SQL por módulo, políticas de campo |
| Esquema | Tablas mínimas para procedencia/versiones y su relación con `UserPermission` (§5) | Ejecutar migraciones sobre cuentas reales (§5) |
| Compatibilidad | JWT anterior, retiro por fuente, scope de navegador (§6) | Revocación automática al conceder/retirar (decisión §10 D3) |
| Errores/pruebas | Semántica HTTP y matriz de pruebas del resolver (§7) | Ejecutar suites (solo comandos en §12) |

**Prohibiciones de la ficha (§1, regla 3) que este paso cumple:** no se migran cuentas reales, no se autoconceden permisos; Super Admin y la cuenta propia quedan como excepciones **explícitas y documentadas**, no como atajos implícitos.

## 3. Qué resuelve el resolver (PROP)

El resolver es la función que, para un usuario autenticado, una **acción** (`apartado:acción`, formato fijado en BASE-02 §3) y un **recurso** opcional, devuelve permitido/denegado y el alcance efectivo:

| Entrada | Salida | Reglas duras |
|---|---|---|
| `userId`, `jti`, `actionId`, recurso opcional (lista, producto, actividad, cliente…) | `allow` + `scope` efectivo (`own|team|list|product|global`) + `sources` que lo conceden | (a) se evalúa **por acción**, nunca sumando acciones y aplicando después un alcance global (**IP** DISENO-COMERCIAL:140; ficha regla 1); (b) «lectura de equipo no amplía edición propia»: `team` en `X:read` no otorga `X:edit` sobre recursos del equipo; (c) identidad tomada del servidor (Passport/sesión), **jamás** del cuerpo de la petición (ficha caso 3); (d) Super Admin y cuenta propia son excepciones **explícitas** en el código, con línea propia y comentario (**OBS** patrón existente: `permissions.guard.ts:60` exime Super Admin; `acl.service.ts` distingue Super Admin/Admin Comercial en niveles de Lista).

**Base existente en S3 que el resolver debe coexistir (OBS):**

| Pieza | Qué hace hoy | Límite |
|---|---|---|
| `acl/acl.service.ts` (407 líneas) | Niveles por Lista (`view → view_prices → edit_prices → edit_products → manage → manage_access`, `LEVEL_ORDER:19-27`), alias legacy `edit → edit_products`, Super Admin y Admin Comercial con capacidades fijas, `404` para ocultar existencia de lista sin assignment (`:204`), `403` con nivel insuficiente (`:208`), defensa para producto/precio (`:275-328`) | Solo Listas/Productos/Precios; sin noción de acción ni procedencia |
| `common/guards/permissions.guard.ts` (68) | Si un endpoint no lleva `@Permissions`, **permite** («Sin metadatos → permite», documentado en el propio archivo); exime Super Admin (`:60`); expande alias `publish:manage` → `products:publish` (`:21`) | Sin metadatos no evalúa nada — el hueco que este contrato cierra por diseño, no por código |
| `security/user-permissions.service.ts` (142) | Concesiones acotadas a `GRANTABLE_PREFIXES = ['dashboard:pack:', 'dashboard:block:']` (`:17`, «reparte visibilidad, no capacidades»); `replaceForUser` borra y recrea en bloque (`:89`); auditoría `grant-dashboard-permissions` | No admite acciones de §3 de BASE-02; sin procedencia por fila |
| `auth/jwt.strategy.ts:45-73` | `validate` comprueba usuario activo y `sessions.isActive(jti)` (`:64`); porta `roles`/`permissions` congelados del login | Un cambio de concesiones no invalida el JWT emitido (§6) |
| `security/session.service.ts:55,89` | `isActive(jti)` por petición; `revokeAllForUser` existe | Solo se invoca ante contraseña/roles/desactivación (**OBS** `users.service.ts:208-215`), no al conceder/retirar |

**Piezas del worktree UA disponibles como referencia de diseño (OBS-UA, no aplicadas en S3):**

| Pieza (`.claude/worktrees/user-action-access/`, commit `1aff701`) | Qué aporta | Límite |
|---|---|---|
| `access-policy.service.ts` («Pure resolver only. Not registered with Nest…», `:48-49`) | Resolución pura: `AccessGrant` + `AccessScope` + catálogo → decisión; rechaza acción no habilitada (`:74-76`) | Sin registro Nest, sin consultas, sin estados de negocio |
| `access-assignment.service.ts` (singular, 118 líneas) | `replaceSource` transaccional con `expectedVersion` (OCC → `access-version-conflict`, `:93`), idempotencia (`idempotency-conflict`, `:80`), metadatos de fuente para auditoría (`:12-18`) | Worktree UA; nombre en singular; no migrado a S3 |
| `access-authority.service.ts` | `AccessIdentity` validada desde Passport (`assertAccessIdentity:15`), autoridad por transacción; «ordinary roles and legacy ACL grants are not copied» (`:45`) | Worktree UA |
| `schema.prisma:450-520` | `AccessState`, `AccessSource`, `AccessGrant`, `AccessOperation` | **OBS:** `rg -c "^model Access" src/backend/prisma/schema.prisma` → **0** en S3 |
| `prisma/migrations/20261008000100_add_user_action_access` | Migración de los modelos anteriores | **OBS:** directorio inexistente en S3 |

**Síntesis (PROP):** el resolver de BASE-04 no parte de cero: coherciona el patrón de decisión de `acl.service` (404/403, Super Admin explícito) con el modelo de procedencia/versionado del worktree UA, y deja el catálogo en el formato `apartado:acción` de BASE-02 §3 (con la matriz de mapeo desde IDs UA pendiente, BASE-02 §11 D2).

## 4. Contexto efectivo a módulos consumidores (PROP)

Regla 2 de la ficha: «Entregar contexto efectivo a módulos consumidores, que lo aplicarán en sus propias tareas.» Este contrato **no** modifica consumidores; define el contrato del contexto:

| Campo del contexto | Contenido | Consumidor de ejemplo |
|---|---|---|
| `identity` | `userId`, `jti`, roles actuales (servidor) | todos |
| `can(actionId, resource?)` | decisión por acción con alcance efectivo | `team-workflow` (BASE-03), `customers`, `quotes`, `listas`, `prices` |
| `scopeOf(actionId, resource?)` | `own|team|list|product|global` efectivo, o `deny` | filtros por equipo (COM-02) |
| `sources(actionId)` | procedencias vigentes (paquete+versión, manual, plantilla) | UI de concesiones (COM-01), auditoría |
| `catalogVersion` | versión del catálogo con que se resolvió | OCC de reasignaciones (UA `:56`) |

Los consumidores aplican el contexto en sus propias tareas (COM-02…); si un consumidor ignora el contexto y usa solo el rol, es deuda visible en su contrato, no licencia para omitir el resolver.

## 5. Esquema y migración local (PROP)

| Elemento | Propuesta | Base |
|---|---|---|
| Procedencia por concesión | Tablas equivalentes a `AccessSource`/`AccessGrant`/`AccessState`/`AccessOperation` (o equivalentes con los mismos conceptos: fuente, versión, grants por acción+alcance, operación idempotente) | **OBS-UA** `schema.prisma:450-520`; **OBS-S3:** 0 modelos Access |
| Convivencia con `UserPermission` | No borrar `UserPermission` en esta fase; el resolver lo trata como **fuente legacy** de visibilidad de dashboard y registra la deuda de procedencia (BASE-02 §11 D3 / BASE-01 §9 D4) | **OBS** `schema.prisma:451-465` (`@@unique([userId, permission])` sin procedencia) |
| Migración | Script/versionado en `prisma/migrations/**`; **solo** modelos y columnas; **sin** filas de usuarios reales, **sin** UPDATE de cuentas, **sin** autoconcesiones (ficha regla 3) | Referencia estructural: `20261008000100_add_user_action_access` (**OBS-UA**), no copiada ciegamente — reconciliar nombres y orden con el esquema actual de S3 antes de generar (**IP** BASE-01 §9.1) |
| Datos semilla | Solo catálogo y, si acaso, filas técnicas de versión; **nada** que conceda acciones a usuarios existentes | ficha regla 3 |

**DESC:** no se consultó la base de datos; el conteo de usuarios/permisos reales queda para el paso `backend` con base desechable (patrón IMP-01).

## 6. Compatibilidad que este contrato fija (PROP)

| Situación | Comportamiento exigido | Estado observado |
|---|---|---|
| JWT anterior tras retirar una concesión | La petición con el token viejo queda denegada (vía `sessions.isActive` y/o revalidación de permisos por petición) | **OBS:** `jwt.strategy.ts:64` ya valida `jti`; los `permissions` del payload **no** se revalidan; `revokeAllForUser` no se invoca al modificar concesiones (`users.service.ts:208-215`) — **gap** |
| Retirar una concesión con otra vigente del mismo permiso | El permiso persiste mientras otra fuente lo conceda; el retiro solo elimina la fila de esa fuente | **OBS:** `replaceForUser` global + unicidad `UserPermission` lo impiden (**OBS** BASE-02 §5.2) — **gap** |
| Scope enviado por el navegador (header/body/campo) | Se ignora para autorizar; el alcance efectivo sale del servidor | **PROP** dura; el resolver nunca acepta scope del cliente como autoridad (ficha caso 3). **OBS:** hoy no existe campo de scope entrante que validar en endpoints decorados |
| Sin concesiones y sin rol | 403 en endpoints protegidos; pantalla «Sin paneles asignados» (IP PANELES:6) | **OBS:** `PermissionsGuard` permite si no hay `@Permissions` (hueco §3) — el paso `backend` debe cerrarlo con pruebas, sin romper endpoints aún no decorados (BASE-01 §8 «permiso implícito por rol» como mecanismo transitorio) |
| Super Admin | Exención explícita y auditable, no heredada por rol genérico | **OBS:** patrones existentes `permissions.guard.ts:60`, `acl.service.ts` — se conservan y documentan |

## 7. Casos de paquete de la ficha (obligatorios)

| # | Caso (ficha, textual) | Contrato previsto (PROP) | Acreditación |
|---|---|---|---|
| 7.1 | «El resolver devuelve lectura de equipo y edición propia para acciones distintas. La denegación HTTP al editar un compañero se acredita después en COM-02/COM-03.» | Mismo usuario con `customers:read(team)` y `customers:edit(own)`: leer ficha de un compañero → permitido; editarla → denegado, **sin** que la lectura amplíe la edición | En BASE-04: pruebas unitarias del resolver con grants sintéticos; la denegación HTTP end-to-end se acredita en COM-02 (clientes) y COM-03 (cotizaciones) |
| 7.2 | «Retirar una concesión conserva otra vigente; retiro total afecta JWT anterior.» | Dos fuentes conceden `X`; retirar una → `X` sigue permitido con el alcance de la fuente restante; retirar la última → denegado incluso con JWT anterior | Pruebas de servicio con fuentes sintéticas; compatibilidad JWT en §6 |
| 7.3 | «Scope recibido del navegador no sustituye concesiones del servidor.» | Petición con scope `global` declarado por el cliente y concesión `own` → se resuelve `own`; con concesión ausente → denegado | Prueba de integración del resolver con entrada hostil simulada |

## 8. Errores y pruebas previstas (PROP)

**Semántica de error (consistente con BASE-02 §7):** `401` identidad/sesión inválidas (**OBS** `access-authority.service.ts:18,38` patrón UA; `jwt.strategy.ts` S3); `403` acción no concedida o fuera de alcance (**OBS** `acl.service.ts:208`); `404` recurso ajeno/no autorizado cuando su existencia no debe revelarse (**OBS** `acl.service.ts:204`); `409` conflicto de versión/idempotencia al modificar concesiones (**OBS-UA** `access-assignment.service.ts:80,93`); `400` entrada inválida (acción desconocida, alcance no permitido por la definición — **OBS-UA** `access-policy.service.ts:60,74-76`).

**Pruebas previstas (no ejecutadas en este paso):** matriz acción × alcance × fuente con fixtures sintéticos; los tres casos de §7; Super Admin y cuenta propia como excepciones explícitas con prueba propia; catálogo con `enabled:false` → denegado; identidad inválida → `401`; migración aplicada y revertida en base desechable sin tocar datos de negocio; `npm test` del backend (jest), **no ejecutado aquí**.

## 9. Incrementos de implementación posteriores (registrados antes de delegar código)

Datos de las fichas (`node docs/ejecucion-paneles/preparar-tanda.mjs <ID> <paso>`). **Aceptación de los pasos `contrato` (textual):** «Contrato consistente con dependencias y decisiones pendientes explícitas.» + «Todos los incrementos están registrados con objetivo, archivos y aceptación propios antes de delegar código.» `QA-01` está reservado al coordinador y **sí** declara `dependsOn: BASE-04` (**OBS** tareas.json; el preparador lo reserva).

| Incremento | Depende de | Objetivo (ficha) | Archivos (ficha) | Aceptación (ficha) |
|---|---|---|---|---|
| **BASE-04 `backend`** (propio) | BASE-02 | «Implementar resolución/contexto y pruebas; los módulos consumidores se adaptan en sus tareas.» | `prisma/schema.prisma`, `prisma/migrations/**`, `common/security/data-scope.ts` (+spec), `access-assignments.service.ts` (+spec), `live-admin-identity.service.ts` (+spec), `user-permissions.service.ts` (+spec), `access-catalog.ts` (+spec), `common/acl/acl.service.ts` (+spec), `modules/auth/jwt.strategy.ts` (+spec), `modules/users/dto/assign-access.dto.ts` (+spec) — 18 rutas | Los tres casos de §7 (textuales de la ficha) |
| **COM-01** (`contrato` → `backend` → `frontend`) | **BASE-04** | «Concretar paquetes/versiones y navegación según acciones individuales.» | `contrato/COM-01.md`; backend: `access-assignments.service.ts` (+spec), `access-catalog.ts` (+spec), `schema.prisma`, `migrations/**`; frontend: `UserAccessAssignments.tsx` (+spec), `CommercialLayout.tsx`, `AdminLayout.tsx`, `App.tsx` (+specs) | Dos vendedores mismo rol con acciones distintas · sin paquetes no hay datos internos por URL/API; propia cuenta sigue disponible · revocar una acción actualiza navegación y API sin cerrar sesión |
| COM-02…COM-09 | COM-01 (y otras) | Cadena comercial (objetivos, archivos y aceptación completos en **BASE-02 §9**) | — | — |

**Solape de archivos a vigilar (OBS tareas.json):** `backend` de BASE-04 y `backend` de COM-01 escriben los mismos `access-assignments.service.ts` y `access-catalog.ts`. La cadena `dependsOn: ['BASE-04']` de COM-01 impide paralelismo; delegar ambos a la vez produciría conflicto de diff (**riesgo coordinado en §13**).

## 10. Fuentes leídas con estado y fuentes faltantes

### 10.1 readPaths de la ficha

| readPath (ficha) | Estado | Pieza disponible que lo respalda |
|---|---|---|
| `src/backend/src/common/security/data-scope.ts` | **DESC en S3 / DESC en UA** — ausente en ambos | **Sin sustituto equivalente.** Piezas que cubren partes: S3 `acl/acl.service.ts` (alcance por Lista) y UA `access-policy.service.ts` (cálculo puro de acción y alcance) |
| `src/backend/src/common/security/access-assignments.service.ts` | **DESC** — no existe ni en S3 ni en UA (nombre en plural) | Sustituto **parcial**: UA `access-assignment.service.ts` (singular, 118 líneas) — §3 |
| `src/backend/src/common/security/live-admin-identity.service.ts` | **DESC en S3 / DESC en UA** — ausente en ambos | Sustituto **parcial**: UA `access-authority.service.ts` (`AccessIdentity` desde Passport, autoridad por transacción) — §3 |
| `src/backend/src/common/acl/acl.service.ts` | **OBS** presente (407 líneas) | Lectura completa: niveles, Super Admin/Admin Comercial, 404/403, defensas de producto/precio |

### 10.2 Otras fuentes leídas

| Fuente | Marca | Aporte |
|---|---|---|
| `docs/PANELES-Y-PERMISOS.md` (70) | **IP** | Reglas acordadas, referencia declarada por la ficha |
| `docs/DISENO-PANEL-COMERCIAL-2026-10-13.md:138-140` | **IP** | «alcance por concesión/herramienta y acción, no sumar acciones» |
| `docs/ejecucion-paneles/contratos/BASE-02.md` (esta tanda) | **PROP** | Formato de acciones, catálogo, semántica de errores, decisiones D1-D6/B1-B4 |
| `common/guards/permissions.guard.ts` (68) | **OBS** | Hueco «sin metadatos → permite»; exención Super Admin; alias legacy |
| `common/security/user-permissions.service.ts` (142) | **OBS** | `GRANTABLE_PREFIXES`; `replaceForUser` |
| `prisma/schema.prisma:451-465` | **OBS** | `UserPermission` sin procedencia |
| `modules/auth/jwt.strategy.ts:45-73`, `auth.service.ts:67-91` | **OBS** | Permisos congelados en JWT; validación de sesión |
| `common/security/session.service.ts:55,89`, `users/users.service.ts:208-215` | **OBS** | `isActive` y `revokeAllForUser` sin invocación al conceder/retirar |
| UA `access-policy.service.ts`, `access-assignment.service.ts`, `access-authority.service.ts`, `schema.prisma:450-520`, `migrations/20261008000100_add_user_action_access`, `docs/access/implementation-progress.md` | **OBS-UA / IP-UA** | Diseño de resolución, versionado, OCC, identidad, modelos y migración de referencia |
| `docs/ejecucion-paneles/tareas.json` | **OBS** | Fichas, dependencias, writePaths, acceptance |

### 10.3 Fuentes faltantes documentadas (bloqueo, no licencia para reimplementar)

Tres de los cuatro readPaths de la ficha (§10.1) **no existen ni en S3 ni en el worktree UA** (`data-scope.ts`, `access-assignments.service.ts` plural, `live-admin-identity.service.ts`); el cuarto existe (`acl.service.ts`). Los writePaths del paso `backend` incluyen crear `data-scope.ts`, `access-assignments.service.ts`, `live-admin-identity.service.ts` y `assign-access.dto.ts` **desde cero** en S3, usando las piezas UA de §3 como referencia de diseño — **no** copiándolas sin reconciliar nombres, dependencias y catálogo (BASE-02 §11 D2). Este contrato no reimplementa su contenido: registra la ausencia y el sustituto.

## 11. Decisiones pendientes y bloqueos externos

| # | Decisión o bloqueo | Afecta a | Estado |
|---|---|---|---|
| D1 | Formato final de IDs de acción: conservar `apartado:acción` (S3) y mapear IDs UA con punto, o al revés (BASE-02 §11 D2) | `backend` (catálogo), COM-01 | **Pendiente — coordinador** |
| D2 | Procedencia de concesiones: adoptar modelo Access* del UA vs. extender `UserPermission` (BASE-02 §11 D3 / BASE-01 §9 D4) | `backend` (esquema, migración) | **Pendiente — coordinador** |
| D3 | Estrategia de compatibilidad JWT: revocar todas las sesiones al modificar concesiones (`revokeAllForUser`) vs. revalidar permisos por petición en el resolver | `backend` (`jwt.strategy.ts`) | **Pendiente** (§6; **OBS** hoy ninguna de las dos rutas se activa) |
| D4 | Mecanismo transitorio por rol («permiso implícito por rol para evitar regresión», BASE-01 §8) mientras no existan concesiones para endpoints ya decorados | `backend` (`acl`, guards) | **Pendiente** |
| B1 | Preview de precios (D1 BASE-02) y módulo L no trasladado | consumidores precios (IMP-*) | **Bloqueo externo** heredado |
| B2 | Yéminus, Excel «Pedidos», reglas de descuento (B1-B3 BASE-02) | COM-05, COM-06, COM-07, COM-03, COM-09 | **Bloqueos externos** heredados |
| D5 | Skills `gs-access-*` citadas por encargos: ausentes en este repo (BASE-01 §9 D8) | implementadores | **Pendiente** (no bloquea el resolver; afecta documentación de encargos) |

## 12. Límites, evidencia reproducible y pruebas previstas

- **Ejecutado aquí:** solo escritura documental y lecturas. La firma de `git status --porcelain` debe contener únicamente los nuevos contratos bajo `docs/ejecucion-paneles/contratos/` (más el estado preexistente de la rama); se reporta junto con la entrega.
- **No ejecutado (y no acreditado):** suites jest/vitest, migraciones, llamadas HTTP con credenciales, pruebas con PostgreSQL desechable, consulta de usuarios reales.

Comandos usados (solo lectura):

```bash
node docs/ejecucion-paneles/preparar-tanda.mjs BASE-04 contrato
node docs/ejecucion-paneles/preparar-tanda.mjs BASE-04 backend
python3 -c "... tareas.json: requiredDecisions/dependsOn/writePaths ..."
for f in data-scope.ts access-assignments.service.ts live-admin-identity.service.ts; do
  test -f src/backend/src/common/security/$f || echo "S3 MISSING $f"; done
ls .claude/worktrees/user-action-access/src/backend/src/common/security/
rg -n "model AccessState|model AccessSource|model AccessGrant|model AccessOperation" .claude/worktrees/user-action-access/src/backend/prisma/schema.prisma
ls .claude/worktrees/user-action-access/src/backend/prisma/migrations/ | rg access
rg -c "^model Access" src/backend/prisma/schema.prisma            # 0 en S3
rg -n "LEVEL_ORDER|NotFoundException|ForbiddenException" src/backend/src/common/acl/acl.service.ts | head
rg -n "GRANTABLE_PREFIXES|replaceForUser" src/backend/src/common/security/user-permissions.service.ts
rg -n "validate|isActive|permissions" src/backend/src/modules/auth/jwt.strategy.ts
rg -n "revokeAllForUser" src/backend/src/common/security/session.service.ts src/backend/src/modules/users/users.service.ts
```

## 13. Riesgos de esta base

- Copiar los modelos/migración del worktree UA sin reconciliarlos con el esquema actual de S3 produciría una migración imposible de aplicar o un rollback destructivo (§5).
- Cerrar el hueco «sin metadatos → permite» de `PermissionsGuard` de un salto rompería todos los endpoints aún no decorados; el cierre debe ser incremental y acompañado del mecanismo transitorio D4.
- Delegar en paralelo `BASE-04 backend` y `COM-01 backend` (mismos writePaths, §9) generaría conflictos de diff.
- Un resolver que respete el rol antes que la concesión reproduciría el problema actual de JWT congelado: las pruebas de §7 deben fallar si el scope del cliente o el rol heredado pisan la concesión.
