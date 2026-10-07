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

- [x] SBC-01 — `.gitignore`: excluir `*.zip` de despliegue, `*.dump` y artefactos de backup locales. (1a35342)
- [x] SBC-02 — Fix del test rojo `account-lockout.service.spec.ts` (corte `since` dentro de la ventana de 24 h). (f549bab)
- [x] SBC-03 — Verificación: suite backend verde (1102) + suite frontend verde (377).
- [x] SBC-04 — Commit 1: `chore(repo)` gitignore de backups. (1a35342)
- [x] SBC-05 — Commit 2: `fix(security)` feedback de política de contraseña + fix del test de lockout. (f549bab)
- [x] SBC-06 — Commits 3-11: `feat(db)`, `feat(auth)`, `feat(notifications)`, `feat(team-workflow)`,
      `feat(customer-portal)`, `feat(products)`, `fix(import)`, `feat(media)`, `feat(audit)`. (332a2a9…cff42d7)
- [x] SBC-07 — Commits 12-15: `feat(storefront)`, `feat(app)`, `chore(frontend)`, `chore(tools)`. (1fb02a3…445a89b)
- [x] SBC-08 — Commit 16: `docs` (ACTION_ITEMS, runbooks, propuestas UI, libretas ODD). (c48b13d)
- [x] SBC-08b — Commit 17: `fix(types)` typecheck limpio en frontend y backend (361ae05).
- [x] SBC-09 — Cierre: `git status` sin cambios trackeados; 18 commits (17 de trabajo +
      este cierre de documentación); espejo Engram actualizado.

## Evidencia de verificación (2026-10-07)

| Check | Resultado |
|-------|-----------|
| `npx jest` (src/backend) | **1102/1102** en 64 suites |
| `npx vitest run` (src/frontend) | **377/377** en 35 archivos |
| `tsc --noEmit -p tsconfig.json` (backend) | 0 errores |
| `tsc -b` (frontend) | 0 errores |
| `npm run lint` backend | limpio |
| `npm run lint` frontend | **2 errores preexistentes** en `features/users/components/DashboardGrants.tsx` (archivo no tocado por esta feature) + 9 warnings |
| `git ls-files \| grep zip/dump` | solo 2 zip históricos ya versionados antes de esta cadena (`Grupo Security Design System.zip`, `src/frontend/grupo-security-frontend.zip`) — **no** subidos aquí |
| RDD `gentle-ai review assess` | **no disponible**: el binario `gentle-ai` no está en PATH en esta sesión → sin evaluación de riesgo por commit |

### Correcciones adicionales detectadas durante la verificación

- `node_modules/@types/{deep-eql,prop-types,babel__*}` eran **directorios vacíos** y hacían
  fallar `tsc -b` con TS2688; eliminados del `node_modules` local (no es cambio de repo).
  Al quitarlos aparecieron **6 errores reales** en el código, corregidos en `fix(types)`.

### Ruta empleada (declaración de triggers)

- Ruta: **inline** en su totalidad. El trigger de mapeo (167 archivos > 4) se resolvió
  con lecturas de diff en línea en lugar de delegar una exploración: **desviación
  registrada**. Ninguna decisión de producto abierta; commits autorizados por el coordinador.
- TDD: modo **desactivado** (resuelto por ausencia de configuración de TDD en el
  proyecto); corrección del test con RED observado → GREEN observado.
- Commits por unidad de trabajo, en la rama `feat/storefront-public-pricing`.
  **Sin push, sin PR, sin merge.**

### Segunda ronda autorizada por el coordinador (2026-10-07, "sí, hazlos")

- [x] SBC-10 — Borrar `src/backend/src/test/` y `src/backend/src/test2/`
      (módulos probe; no estaban trackeados, sólo existían en disco).
- [x] SBC-11 — `.gitignore`: añadir `.atl/` (caché del skill-registry).
- [x] SBC-12 — Sacar del índice los 2 zips históricos
      (`Grupo Security Design System.zip`, `src/frontend/grupo-security-frontend.zip`)
      con `git rm --cached` + gitignore: quedan en disco, **la historia no se reescribe**. (e7e6ba7)
- [x] SBC-13 — Actualizar `docs/PROJECT_STATUS.md` y `docs/handoffs/HANDOFF_ACTUAL.md`
      con estado verificado (Hito 1 cerrado salvo C006, riesgos R007–R011 resueltos,
      DT002/DT003/DT004/DT007 resueltas, R012/R013 nuevos).

### Pendiente de decisión (no autorizado aún)

| Artefacto | Estado |
|-----------|--------|
| `Cliente — Tienda pública (estilo retail)@2x.png` | captura de diseño 2880×5120 (3.9 MB) en la raíz; el coordinador pidió que se le explique antes de decidir: borrar / mover a `docs/UI/` / ignorar |
| `features/users/components/DashboardGrants.tsx` | 2 errores de lint preexistentes (fuera del alcance de esta feature) |

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
  presente en el árbol).
- 2026-10-07: **cerrado** — SBC-01..SBC-09 completados. 17 commits en
  `feat/storefront-public-pricing` (1a35342…361ae05 + cierre), árbol limpio.
- 2026-10-07: **segunda ronda** — SBC-10..SBC-13 completados (probes borrados,
  `.atl/` ignorado, zips fuera del índice en `e7e6ba7`, PROJECT_STATUS y
  HANDOFF_ACTUAL actualizados con estado verificado).
  Siguiente paso pendiente de decisión del coordinador: la captura PNG de la raíz,
  los 2 errores de lint de `DashboardGrants.tsx`, y push/PR/merge de la rama.
