# Decisiones técnicas — Plataforma Comercial

| Fecha | Decisión | Motivo | Impacto | Estado | Aprobado por |
|---|---|---|---|---|---|
| Pendiente | Definir si un producto puede pertenecer a una o varias listas | Impacta relaciones, precios y permisos | Alto | Pendiente | Pendiente |
| Pendiente | Definir si el catálogo actual se reemplaza o convive con listas | Impacta migración y navegación | Alto | Pendiente | Pendiente |
| Pendiente | Definir comportamiento de productos con stock cero | Impacta visibilidad comercial | Medio | Pendiente | Pendiente |
| Pendiente | Definir permisos por usuario, rol o ambos | Impacta seguridad y administración | Alto | Pendiente | Pendiente |
| Pendiente | Definir si una carga masiva se rechaza completamente o acepta filas válidas | Impacta integridad y operación | Medio | Pendiente | Pendiente |

## Decisiones técnicas materializadas — Fase A (esquema no destructivo, 2026-08-14)

| Fecha | Decisión técnica | Motivo | Impacto | Estado | Aprobado por |
|---|---|---|---|---|---|
| 2026-08-14 | `Lista` es una entidad nueva (tabla `listas`) que coexite con `Catalog`; no reemplaza físicamente a `Catalog` en esta fase | Reemplazar el rol de raíz de producto de `Catalog` por `Lista` sin destruir datos; migración reversible | Alto | Implementado (Fase A) | comercial-dev (resp. decisiones 1, 7) |
| 2026-08-14 | `Product.listaId` y `Price.listaId` agregados como columnas nullable (FK a `Lista`); se preservan `catalogId` y `priceListId` y la restricción `@@unique([productId, priceListId])` | Transición gradual: `listaId` es fuente de verdad; columnas legadas conservadas para rollback | Alto | Implementado (Fase A) | comercial-dev (decisiones 4, 6, 7) |
| 2026-08-14 | `Assignment.roleId` agregado como columna nullable (FK a `Role`); `userId` se mantiene `NOT NULL` en esta fase | Permitir comenzar a soportar assignments por Rol sin bloquear/usar los datos actuales por-usuario | Alto | Implementado (Fase A) | comercial-dev (decisión 8) |
| 2026-08-14 | `assignment.resourceType` se mantiene como `String` (no enum Prisma); el recurso `LISTA` se añadirá al validar la app (`ASSIGNMENT_RESOURCE_TYPES`) en Fase B | Prisma no impone enum sobre la columna actual; evita migración de tipo de columna en fase de esquema | Medio | Implementado (Fase A) | comercial-dev (decisión 8) |
| 2026-08-14 | `CAT-DEFAULT` proviene de la migración `20260805120000_catalogs_y_catalog_id` (no del seed); no se crea `LISTA-GENERAL` en migración (Fase B) | Mantener separación: Fase A solo esquema; seed/backfill en Fase B | Alto | Implementado (Fase A) | comercial-dev (decisiones 7, 8, 14) |
| 2026-08-14 | XOR `userId`/`roleId`, `@@unique` parciales y `CHECK` de `resourceType` NO se aplican en DB en Fase A; se documentan como comentarios SQL para Fase A2 | Evitar riesgo de invalidar datos existentes; Prisma no expresa `CHECK` XOR directamente | Alto | Diferido (Fase A2) | comercial-dev |

## Decisiones técnicas materializadas — Fase B (backfill, 2026-08-14)

| Fecha | Decisión técnica | Motivo | Impacto | Estado | Aprobado por |
|---|---|---|---|---|---|
| 2026-08-14 | `CAT-DEFAULT` se mapea a la Lista semilla `LISTA-GENERAL` (reutilizada, no duplicada); `LISTA-GENERAL` se crea con `code` único y `currency=COP` | Decisiones 8/14: lista raíz de arranque y re-mapeo 1:1 de catálogos existentes | Alto | Implementado (Fase B) | comercial-dev |
| 2026-08-14 | Backfill transaccional e idempotente en script separado (`prisma/scripts/backfill-catalog-to-lista.ts`); NO se modifica `seed.ts` | Ambiente con datos reales: backfill fuera del seed, reversible, con resumen y auditoría | Alto | Implementado (Fase B) | comercial-dev |
| 2026-08-14 | `Assignment` tipo `CATALOG` se migra a `LISTA` preservando `level`/`isActive`/`userId`; `@@unique(userId,resourceType,resourceId)` se respeta y la migración es in-place (no duplica filas) | Transición de ACL a recursos `LISTA` sin romper unicidad ni perder permisos | Alto | Implementado (Fase B) | comercial-dev |
| 2026-08-14 | `priceListId` se conserva intacto (1379 filas) como legado de tier; no se reconcilia con `Lista` en esta fase | Decisiones 3/7: PriceList como tier de precio, migración reversible | Alto | Implementado (Fase B) | comercial-dev |
| 2026-08-14 | El backfill verifica e impone los invariantes `Price.listaId == Product.listaId` y `Product.listaId != NULL` (CAT-DEFAULT→LISTA-GENERAL) antes/ después; aborta en violación | Garantizar integridad de datos antes de exponer listaId en escrituras | Alto | Implementado (Fase B) | comercial-dev |

## Decisiones técnicas materializadas — Fase C (compatibilidad, 2026-08-14)

| Fecha | Decisión técnica | Motivo | Impacto | Estado | Aprobado por |
|---|---|---|---|---|---|
| 2026-08-14 | `ProductsService.create/update` aceptan `listaId` opcional; fallback explícito a `LISTA-GENERAL` cuando falta; `catalogId` se conserva | Fase C.1: compartibilidad, producto nunca sin Lista, sin inconsistencias nuevas | Alto | Implementado (Fase C) | comercial-dev (decisiones 4, 14) |
| 2026-08-14 | `upsertPrices` propaga `listaId` del producto al precio (create/update) | Invariante `Price.listaId == Product.listaId` en precios inline | Alto | Implementado (Fase C) | comercial-dev (decisión 6) |
| 2026-08-14 | `PricesService.create/update` validan `dto.listaId == product.listaId` (ConflictException) y valor ≥ 0 / `validFrom ≤ validUntil` (BadRequestException) | Reglas 7.6/7.8/7.9: precios no negativos, vigencias coherentes, sin listaId huhalado | Alto | Implementado (Fase C) | comercial-dev (decisiones 6, 7.6, 7.9) |
| 2026-08-14 | `importFromExcel` setea `listaId = LISTA-GENERAL` (fallback) en productos creados | Garantizar la invariante "todo producto tiene Lista" también en la carga existente; sin re-implementar importación por Lista | Alto | Implementado (Fase C) | comercial-dev |
| 2026-08-14 | `createPrismaMock` amplía bloques `lista`, `product.updateMany`, `user.deleteMany`, `userRole.deleteMany`; se elimina la asignación runtime redundante en `users.service.spec.ts` | Testability de la nueva entidad y cierre de gaps de mock preexistentes | Medio | Implementado (Fase C) | comercial-dev |
| 2026-08-14 | Se añaden tests unitarios: producto con Lista / fallback legado / precio con Lista correcta / rechazo de Lista inconsistente / valor negativo / backfill idempotente (empírico) | Cobertura estrictamente necesaria de las invariantes nuevas | Alto | Implementado (Fase C) | comercial-dev |

## Pendientes de validación técnica (post-Incremento 0)
- `deny-by-default` real en `buildAclWhere` (Fase 2 / Incremento 1) — NO aplicado en Fase C por falta de matrix de pruebas de acceso.

## Decisiones técnicas materializadas — Incremento 1 (Fase 1B, 2026-08-14)

| Fecha | Decisión técnica | Motivo | Impacto | Estado | Aprobado por |
|---|---|---|---|---|---|
| 2026-08-14 | `AclService` centralizado en `common/acl/` (`acl.service.ts` + `acl.module.ts`) con `getAllowedListaIds`, `getUserLevel`, `assertListaAccess`, `assertProductAccess`, `assertPriceAccess`, `can` y `levelsAtLeast` | Único punto de autorización por Lista (view/edit/manage) reutilizable por Listas/Products/Prices/Assignments | Alto | Implementado | comercial-dev |
| 2026-08-14 | `LISTA` agregado a `ASSIGNMENT_RESOURCE_TYPES` (backend DTO + frontend service/types) | Permite assignments sobre la raíz comercial | Medio | Implementado | comercial-dev |
| 2026-08-14 | Módulo backend `listas` (controller/service/DTO) con CRUD + toggle-active + archive/restore lógico + resumen productos/precios/accesos/auditoría; archivo lógico (no borrado físico) | Incremento 1 funcional de Listas | Alto | Implementado | comercial-dev |
| 2026-08-14 | deny-by-default aplicado a Listas, Productos y Precios (lecturas y writes nivelineados); Super Admin bypass; usuario sin assignment → 404/[] (oculta existencia) | Regla de negocio 10 / prioridad seguridad | Alto | Implementado | comercial-dev |
| 2026-08-14 | `ProductsService.findAll/findOne/create/update/toggleVisibility/toggleActive` reciben ctx opcional; el controlador siempre pasa `@CurrentUser`. `create/update` exigen `edit` sobre la Lista; `toggleVisibility` exige `manage`; `toggleActive` exige `edit` | Niveles view/edit/manage sobre productos (matriz 3.1) | Alto | Implementado | comercial-dev |
| 2026-08-14 | `PricesService.findOnePriceList/findPricesByProduct/findPricesByPriceList/createPrice/updatePrice` reciben ctx opcional; reads denegados a no-autorizados (404/lista vacía); writes exigen `edit` sobre la Lista del producto | Niveles view/edit sobre precios; PriceList se mantiene como metadato de tarifa (no se filtra su listado) | Alto | Implementado | comercial-dev |
| 2026-08-14 | `AssignmentsController` `@Roles('Super Admin','Admin Comercial')`; `AssignmentsService.create/update/remove/findAll` autorizan inline: LISTA → Super Admin o Admin Comercial con `manage` sobre la Lista; tipos legacy (CATALOG/PRICE_LIST/CATEGORY) → Super Admin exclusivamente | Admin Comercial administra accesos dentro de su scope; sin autoescalamiento (no puede grant manage sobre Lista que no administra) | Alto | Implementado | comercial-dev |
| 2026-08-14 | ctx opcional en servicios: ausente → comportamiento legacy abierto (compatibilidad con callers/tests existentes); el controlador es el punto de autorización (siempre pasa ctx) | Minimiza ruptura de tests existentes manteniendo deny-by-default en la frontera pública | Medio | Implementado | comercial-dev |
| 2026-08-14 | **NO** se migró `buildAclWhere`/`assertCatalogAccess` de `CatalogsService` a LISTA en este incremento | Mantener compat con la vista Catálogos legacy (regla "mantener compatibilidad temporal para Catalog"); el bridge producto↔Lista ya protege lecturas de productos/precios. El scope deny-by-default aplica a Listas/Productos/Precios (no al metadato legacy de Catalog) | Alto | Diferido | comercial-dev |
| 2026-08-14 | Frontend: rutas `/commercial/lists` (ListasPage) y `/commercial/lists/:id` (ListaDetailPage con pestañas Productos/Precios/Accesos/Auditoría) + tab en CommercialLayout; RBAC frontend basada en rol (ver/edición/administración) con reacción a 403/404 en runtime; el nivel granular real se enerva server-side | Experiencia de compras sin inventar UI de creación de assignments LISTA por ahora | Alto | Implementado | comercial-dev |
| 2026-08-14 | La creación de assignments `LISTA` se admite vía API (service); la UI global de Asignaciones mantiene el selector CATALOG-only por ahora (legacy) → creación de accesos LISTA soportada por backend, extendible en frontend futuro | Evita inventar reglas de negocio no definidas; Admin Comercial validado con fixtures en tests | Medio | Implementado (backend) / Diferido (UI create-form) | comercial-dev |

## Pendientes de validación técnica (post-Incremento 1)
- Reconciliación `PriceList` (tier) vs `Lista` — legado preservado; pendiente de decisión en la tarea de precios.
- `Assignment` XOR `userId`/`roleId` a nivel DB (CHECK/índice coalescente) — diferido a Fase A2.
- `Category` scoping por Lista (global en esta fase) — decisión pendiente (Q-cat-scoping).
- `PermissionsGuard` sigue NO registrado; la autorización por nivel se implementa vía `AclService` y `@Roles` (no se activó guard de permisos para no alterar política global sin tests).
- Retiro/ACL del módulo legacy `Catalogs` (bridge producto↔Lista actual) — pendiente si se exige deny-by-default también sobre el metadato de catálogo.

## Decisiones técnicas materializadas — Incremento: Clave por usuario (password, 2026-08-24)

| Fecha | Decisión técnica | Motivo | Impacto | Estado | Aprobado por |
|---|---|---|---|---|---|
| 2026-08-24 | Nueva columna `User.password TEXT NULLABLE` (hash bcrypt) + migración `20260824151000_user_clave`. NULL = sin clave (no se pide). Nunca se expone el hash en respuestas. | Clave personal por usuario que el área de compras asigna desde Usuarios; reversible (eliminar clave = NULL) | Alto | Implementado | comercial-dev |
| 2026-08-24 | `ProductsService.assertClave(ctx, clave)`: exige clave en `update`, `doTransition` (cubre transition + toggleVisibility + toggleActive) y `remove`, SOLO si el usuario tiene `password`. Sin ctx o sin password → no exige. Scheduler (`internal=true`) nunca exige. | La clave por usuario debe bloquear eliminar/modificar productos; no debe romper el scheduler ni llamadas internas | Alto | Implementado | comercial-dev |
| 2026-08-24 | La clave por usuario y la clave maestra global (`masterKey`) son **capas independientes**: `assertClave` se valida primero; el masterKey sigue exigiéndose para borrado en cascada de productos con datos asociados. | No debilitar la protección de cascada ya existente (masterKey); la clave per-usuario es una capa adicional de identidad | Alto | Implementado | comercial-dev |
| 2026-08-24 | Códigos de error discriminantes en cuerpo: 409 `{code:'CLAVE_USUARIO_REQUERIDA'}`, 403 `{code:'CLAVE_USUARIO_INCORRECTA'}`. El frontend existing dialog (409/403) se reutiliza y discrimina por `code` para etiquetar "Clave del usuario" vs "Clave maestra" y enviar el campo correcto (`clave` / `masterKey`). | Reutilizar el diálogo de confirmación ya construido sin romper el flujo masterKey | Medio | Implementado | comercial-dev |
| 2026-08-24 | Endpoints de clave: auto-servicio `PUT/DELETE /api/users/:id/clave` (abiertos a cualquier autenticado; el service fuerza "propio usuario" → 403) + administración `PUT/DELETE /api/users/:id/clave/admin` y `GET /api/users/:id/clave` (`@Roles('Super Admin','Admin Comercial')`). DTO `SetClaveDto` (clave min 6, currentClave opcional). | Cada usuario gestiona su propia clave; los admins pueden resetear/eliminar cualquiera sin conocer la actual | Alto | Implementado | comercial-dev |
| 2026-08-24 | Frontend: panel "Clave por usuario" en UsersPage (admin), diálogo extendido en ProductDetailPage y BulkDeleteModal (fase confirmar → clave usuario → clave maestra → done), y campo inline en ProductFormModal (modificar). | Cubrir eliminar Y modificar (spec) en todas las UI de producto | Alto | Implementado | comercial-dev |
| 2026-08-24 | Toggle endpoints (`toggleVisibility`/`toggleActive`) ahora aceptan cuerpo opcional `ToggleProductDto { clave? }` y la reenvían al FSM vía `doTransition`. UpdateProductDto / TransitionProductDto / DeleteProductDto extienden con `clave?: string`. | Los toggles modifican estado y deben exigir clave como cualquier write | Medio | Implementado | comercial-dev |



## Cierre de etapa — Adopción de Gentle-AI (2026-09-21)

| Fecha | Decisión técnica | Motivo | Impacto | Estado | Aprobado por |
|---|---|---|---|---|---|
| 2026-09-21 | ADOPT-GENTLE-AI-001: se adopta Gentle-AI (v3.4.0, telemetría OFF) como capa de flujo/memoria/review (ODD/SDD/RDD, Engram, skills, CodeGraph, personas) para claude-code, kilocode y opencode. Se archiva la gobernanza de coordinación multi-agente (docs/agent-coordination, .kilo/rules, .kilo/context, .opencode/agents, kilo.jsonc, CLAUDE.md pre-Gentle, graphify-out, WORKFLOW.md, AGENT_TEAM.md) en docs/archive/legacy-coordinacion-2026-09/ sin borrar historia. Fin de la orquestación automática (Orca); las sesiones pasan a ser dirigidas por humano. Issues GitHub #16-#27 de la cadena comercial siguen vigentes y se ejecutan por sesión directa. | El modelo de ejecutores autónomos con tablero/issues/Orca quedó obsoleto frente al nuevo flujo Gentle-AI; el archivo preserva toda la evidencia histórica | Alto | Implementado | usuario (coordinador) |
