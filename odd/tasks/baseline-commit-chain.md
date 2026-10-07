# Feature: baseline-commit-chain — proteger el árbol de trabajo con commits por feature

## Objetivo

Convertir los ~167 cambios pendientes del checkout `feat/storefront-public-pricing` en
una cadena de commits de trabajo por feature, sin perder nada y sin subir artefactos
sensibles (backups, dumps) a Git. Primero el bloque de **seguridad + tests**, que es el
que ya está verificado.

## Problema

`git status` en `/home/soporte/office_ai/grupo-security-office` (rama
`feat/storefront-public-pricing`, HEAD `451393c`): 71 archivos modificados con
`+5946/-5898` y 96 entradas sin seguimiento. El trabajo incluye fixes de seguridad del
Hito 1 ya implementados, módulos nuevos (notifications, team-workflow, ficha de
producto Hikvision, auth Notion), 6 migraciones Prisma de octubre y backups de
despliegue en la raíz. Todo sin commitear: riesgo de pérdida y de mezclar features en
un commit inmenso.

## Por qué

- Riesgo de pérdida por un `git checkout`/`clean` accidente.
- `backend-hostinger-*.zip`, `frontend-hostinger-*.zip`, `supabase-backup-20261002.dump`
  sin `.gitignore` → un `git add .` subiría backups con datos (regla 1 de AGENTS.md).
- 1 test rojo impide declarar la suite verde.
- `docs/PROJECT_STATUS.md` afirma "0 tests" (real: 1102 backend / 377 frontend).

## Scope (autorizado por el coordinador, 2026-10-07)

1. `.gitignore`: excluir backups de despliegue y dumps de base de datos.
2. Arreglar el test rojo `account-lockout.service.spec.ts:120`.
3. Cadena de commits de trabajo **por feature** en la rama actual, empezando por
   seguridad + tests.

**No autorizado**: push, pull request, merge, cambios de credenciales, deploy,
ejecutar scripts destructivos (`cleanup-orphaned-list-products.ts`), borrar trabajo
no relacionado.

## Restricciones

- AGENTS.md: cambios mínimos, código/identificadores en inglés, comunicación en español.
- Commits Conventional en la rama actual (ya no es la rama por defecto).
- Sin `git add .` ciego: se añaden archivos por grupo explícito.
- Los zips/dumps **no** se commitean; quedan ignorados en disco.

## Verificación aplicable

- Backend: `npx jest` en `src/backend` → 1102/1102 (tras el fix).
- Frontend: `npx vitest run` en `src/frontend` → 377/377.
- `git status` limpio de artefactos ignorados; ningún `.zip`/`.dump` en `git ls-files`.
- RDD: `gentle-ai review assess` por commit de trabajo si el switch está habilitado.

## Tasks

- [ ] SBC-01 — `.gitignore`: excluir `*.zip` de despliegue, `*.dump` y artefactos de backup locales.
- [ ] SBC-02 — Fix del test rojo `account-lockout.service.spec.ts` (corte `since` dentro de la ventana de 24 h).
- [ ] SBC-03 — Verificación: suite backend verde (1102) + suite frontend verde (377).
- [ ] SBC-04 — Commit 1: `chore(repo)` gitignore de backups.
- [ ] SBC-05 — Commit 2: `feat(security)`/`test(security)` bloque de seguridad Hito 1 + specs.
- [ ] SBC-06 — Commit 3: `feat(db)`/migraciones y módulos backend pendientes agrupados por feature.
- [ ] SBC-07 — Commit 4: `feat(frontend)` features de UI pendientes agrupadas por feature.
- [ ] SBC-08 — Commit 5: `docs` documentación y bitácoras pendientes.
- [ ] SBC-09 — Cierre: `git status` final, conteo de commits, actualización de este documento y del espejo Engram.

## Criterios de aceptación

- Ningún `.zip`/`.dump` versionado.
- Suites backend y frontend verdes.
- Todo el trabajo previo del árbol queda commiteado en grupos coherentes por feature.
- Historia de Git legible: un mensaje Conventional por unidad de trabajo.

## Ruta y modo elegidos

- Ruta: **delegada direct** si el agrupamiento excede la exploración en línea; si no,
  inline. Evidencia de trigger: >4 archivos por entender (mapping trigger).
- TDD: **desactivado por configuración de proyecto** (no hay evidencia de TDD activo);
  correcciones verificadas con las suites existentes (runner: `jest` / `vitest run`).
- RDD: evaluar por commit con `gentle-ai review assess` si el modo está habilitado.

## Progreso

- 2026-10-07: documento creado; exploración inicial (estado Git, suites, Hito 1 ya
  presente en el árbol). Siguiente: SBC-01.
