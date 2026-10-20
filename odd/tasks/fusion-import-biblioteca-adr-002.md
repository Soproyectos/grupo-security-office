# odd/tasks/fusion-import-biblioteca-adr-002.md

> Espejo Engram: topic `odd/fusion-import-biblioteca-adr-002/tasks`
> Locator: `odd/tasks/fusion-import-biblioteca-adr-002.md`

## Objetivo
Fusionar la rama `agent/claude/IMPORT-BIBLIOTECA-VITRINA-001` en `main` (autorizado por el coordinador: "fusiona todo"), conservando íntegro el WIP del portal de clientes que vive en el árbol de trabajo.

## Problema
La rama conserva 4 commits que `main` no tiene: 71bf534 (columnas de identidad ADR-002 + migración), 98370b5 (identity guard: productos bloqueados no se sobreescriben), c008538 (truncado 70 chars, nunca rechazo), 5e2eea8 (script import-biblioteca dry-run/apply gated). 17 archivos; 7 se solapan con la evolución que ya entró en main (SEC-IMPORT, PR #52/#53, upload zip).

## Por qué
El usuario pidió organizar el repo para seguir trabajando desde `main`; descubrí que la rama NO estaba fusionada (corrige mi afirmación previa) y el usuario eligió fusionar todo.

## Scope (autorizado)
- Merge de la rama en `main` con resolución de conflictos (sin push; commit local).
- Preservar WIP portal (schema.prisma portal + rutas /admin + configs) intacto.
- No borrar rama hasta verificar el merge.

## Restricciones
- Sin push. Sin tocar credenciales/env reales. Cambios mínimos.
- Resolución del módulo de import: base = versión de main (SEC-IMPORT es la arquitectura vigente); portar del branch solo lo que main no tenga (guard de products bloqueados si aplica).
- schema.prisma = unión (MFA/RBAC de main + identity locking del branch + modelos portal del WIP).

## Tasks
- [x] **T1** Preparar árbol: stash del schema.prisma WIP (staged); `git merge agent/claude/IMPORT-BIBLIOTECA-VITRINA-001` (--no-ff). Check: merge inicia, conflictos listados.
- [x] **T2** Resolver conflictos (schema.prisma union; import module: ours + portar guard branch si falta; package.json: ours + deps branch necesarias; zip: ours). Check: 0 conflictos; `git diff --check` limpio.
- [x] **T3** Commit merge (Conventional Commit) + `gentle-ai review assess` (RDD ON). Check: merge commit existe; boundary/assessment registrado.
- [x] **T4** Restaurar WIP: aplicar diff del schema.prisma del stash WIP sobre el schema fusionado; resolver 3-way (base old-main, ours merged, theirs WIP portal). Check: modelos portal presentes + identity + MFA en schema.
- [x] **T5** Validación: lint + typecheck del backend; git status final coherente; rama lista para borrar (preguntar antes). Check: sin errores de tipo/bloqueantes.

## Progreso
- T1 ✓ merge limpio (ort) en `main` → commit `21f759e` (16 archivos, +1774/−42; base 14c95a5 == origin/main).
- T2 ✓ unión semántica verificada: schema identity (nameSource/nameLockedAt) + MFA (UserMfa, MfaBackupCode, StepUpGrant, LoginAttempt) + bloque biblioteca (SEC-IMPORT markers intactos); zip = main (blob 71f4595...); package.json incluye `db:import-biblioteca`.
- T3 ✓ `gentle-ai review assess --base-ref 14c95a5 --committed-only` → risk **medium** (configuration_change package.json), changed_paths 16, changed_lines 1816, review_due **true** (slice_budget_reached). Preflight STATUS → collect `intended_untracked_selection` (schema `gentle-ai.review-intended-untracked-selection/v1`): shape exacto NO reproducible headless (4 formatos JSON probados → invalid_request; sin acceso a gentle-ai.dev). Review del commit 21f759e queda **pendiente** (boundary sigue en 14c95a5). No baja el tier.
- T4 ✓ WIP restaurado: pop/adicion de stash `wip-schema-prisma-portal-antes-fusion` — diff del schema (+70 líneas: models `PortalAccount`, `PortalPriceListMapping`, `PortalSession`, enums) aplicado con `git apply` sobre el schema fusionado (apply-check OK, sin marcadores); los 5 archivos de config restaurados vía pop `wip-adicionales-antes-merge` (Login.tsx `navigate('/admin')`, opencode.json model nvidia, .env.example `PORTAL_SESSION_HOURS`). 17 archivos M finales.
- T5 ✓ typecheck EXIT 0, lint limpio, tests del módulo import-biblioteca 17/17 (3 casts de tipos corregidos en `import-biblioteca.logic.spec.ts` con doble-cast `unknown`); `git diff --check` limpio; sin marcadores de conflicto.

## Verificación / evidencia
- Merge commit: `21f759e` en `main` ("Merge ... ort"); `git branch --merged main` ya lista `agent/claude/IMPORT-BIBLIOTECA-VITRINA-001` ✓.
- Schema final: `grep -c` nameSource|nameLockedAt|lastSeenAt = 4; mfa|2fa = 11; models Portal* presentes (líneas 656–707).
- `npx tsc --noEmit` → exit 0; `npm run lint` → sin errores; `npm test -- --runInBand src/scripts/import-biblioteca.logic.spec.ts` → 17/17.
- RDD: assessment ejecutado; review del merge commit pendiente (collect provider-bound no resoluble headless; ver T3).

## Siguiente paso
- Preguntar al coordinador si borra la rama `agent/claude/IMPORT-BIBLIOTECA-VITRINA-001` (ya mergeada; usar `git branch -d`).

## Evidencia de commits (2026-09-28, autorización del coordinador)
- Biblioteca protegida en git: `biblioteca/` (774 fichas), `catalogo-base.json`, `listas/` y `scripts/parsear_listas.py` → commit `a1db9c7` `chore(data): add catalog biblioteca (774 fichas), provider lists and import helper`. Antes estaban untracked (riesgo de pérdida); además respaldo en `/tmp/opencode/backup-biblioteca-20260928-174429/`.
- RDD: si el coordinador quiere cerrar el review de 21f759e, reintentar collect con shape conocido o aceptar manualmente (la revisión queda documentada como pendiente, tier medio, sin rebajar).
- Stashes conservados: `wip-schema-prisma-portal-antes-fusion` (backup), `wip-overlap-main-antes-pull-1519`, `wip-portal-biblioteca-antes-de-main`, `opencode.json openpencil MCP local`.

## Rutas por task (delegación)
- T1: inline (operación de estado git, no escribible por subagente).
- T2: inline (resolución de merge con semántica de negocio que el parent conoce; delegar rompería el estado del index).
- T3: inline + herramienta review.
- T4: inline (stash pop stateful).
- T5: inline (checks).

## TDD
- Modo: no configurado en repo (sin watermark TDD); runner observado: jest/vitest en backend (specs existentes). Checks funcionales: typecheck + lint.