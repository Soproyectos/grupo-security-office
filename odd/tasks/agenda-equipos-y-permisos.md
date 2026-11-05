# Agenda y tareas: equipos y permisos

Objective: leave `/agenda` working for every internal user, with team control based on the existing `User.supervisorId` hierarchy.
Decisions (approved by the user 2026-10-28):
- Team = subordinates (direct and indirect) via `supervisorId`. No schema change, no migration.
- Team powers come from an assignable package (option A), for any role (Supervisor, Admin Comercial, other area heads).
- Own agenda is level 0 by role (already done).
- Only Super Admin can set any supervisor; others only inside their own branch.
- Completed tasks are locked.
- "Assign to" selector lists all active people of the actor's team (not only Vendedor).
- "View team" without "assign" = read-only view, no 403.

Constraints: no commit, push, migration or deploy without explicit approval (AGENTS.md). TDD off; runners: jest (backend), vitest (frontend). Do not touch AssignedHome.tsx or modules/dashboard/.

## Tasks
- [x] T1 Users: supervisor change limited to actor's branch; close PUT /users/:id bypass (users.controller/service, hierarchy.service)
- [x] T2 Agenda backend: package "jefe de equipo", sellers list for read-only team and all active team members, create validates assignee active+team, assign blocked on completed
- [x] T3 Agenda backend: cap notice (limit 1000) exposed to the UI
- [x] T4 Agenda frontend: use agendaAccess, read-only team view, empty state, cap notice, remove features/supervisor/AgendaCalendarPage.tsx
- [x] T5 Tests: role parity front/back, team read-only, completed lock, cap (frontend specs + backend parity run; see evidence)
- [x] T6 Handoff in docs/handoffs/2026-10-28-agenda-equipos.md (integrado) and final report
- Extra: added 'jefe-de-equipo' to PACKAGE_PANELS (UserAccessAssignments.tsx) so Super Admin can assign it from Usuarios. Users tests: 51 pass, 2 fail (both Biblioteca-panel specs from other sessions' work, not this change).

## Route
Delegated direct: one writer at a time (backend first, then frontend).

## Verification evidence
Backend writer (T1-T3), run from src/backend, no commit made:
- `npx jest src/modules/team-workflow/workflow-team-scope src/modules/team-workflow/workflow.service.spec src/modules/team-workflow/workflow-team.spec src/modules/team-workflow/workflow-agenda src/common/hierarchy src/modules/users/users.controller src/common/security/access-catalog src/common/security/base-access`: all suites passed (11 suites passed in the combined run with access-assignments; 193 tests passed).
- Same run included `src/common/security/access-assignments.service.spec.ts`: FAILED, 45 tests, DB unreachable (`localhost:54331`), environmental, file not touched.
- Earlier run also showed failures not caused by this change: `workflow-links.spec.ts` and `workflow-convert.spec.ts` (need real DB at `localhost:54331`), `users/dto/assign-access.dto.spec.ts` ("products:read no admite el alcance list", unrelated catalog scope).
- `npx tsc --noEmit`: 17 errors, all in `modules/prices/import/*.spec.ts` and `modules/products/products.service.spec.ts` (files not touched); no errors in touched files.
- `npx eslint` on touched dirs/files (hierarchy, users.controller + new spec, team-workflow, access-catalog.ts, base-access.parity.spec.ts): exit 0, no output.
- Route: T1-T3 delegated direct, one backend writer. Contract and errors: docs/handoffs/2026-10-28-agenda-equipos.md (Estado respondido).
- Decisions taken: new package `jefe-de-equipo` (read+assign+complete team) instead of renaming `supervisor-comercial`; `ACCESS_CATALOG_VERSION` not bumped (mirrored in frontend); sellers() own-only returns 403 TEAM_DIRECTORY_FORBIDDEN; cap exposed via headers X-Total-Truncated / X-Activities-Limit.

Frontend writer (T4 + frontend of T5), run from src/frontend, no commit made, not verified in a browser:
- `npx vitest run src/features/agenda src/services/agenda.service.spec.ts`: 7 files, 151 tests passed.
- `npx vitest run src/App.spec.tsx -t "agenda|Agenda"`: 2 passed (22 skipped). The full `src/App.spec.tsx` has 2 failures unrelated to the agenda (`DATOS-ACTUALIZACION` Biblioteca routes: "Actualizacion monta con su paquete..." and "Actualizacion y Publicar en tienda...").
- `npx eslint src/features/agenda src/services/agenda.service.ts src/services/agenda.service.spec.ts`: exit 0, no output.
- `npx tsc --noEmit`: 1 error, in `src/components/layout/CommercialLayout.spec.tsx(60,49)` (not touched; actionId `string | undefined`). No errors in touched files. (An earlier run showed 4 other errors about `biblioteca-actualizacion` in App.tsx and users/access.spec.ts, not touched, gone in the second run.)
- From src/backend: `npx jest src/common/security/base-access`: 1 suite, 2 tests passed (parity regex reads `BASE_ACCESS_ROLES = [...]` in agenda-access.ts; literal kept).
- Deleted orphan `src/frontend/src/features/supervisor/AgendaCalendarPage.tsx` after `rg` showed no importer (only comments mention the name).
- Route: T4/T5 frontend delegated direct, one frontend writer.
- Finding (not changed): `UserAccessAssignments.tsx` `PACKAGE_PANELS` lists package ids by hand; `jefe-de-equipo` is in none, so it likely does not appear in Usuarios. `ACCESS_CATALOG_VERSION` (`panels-20261028-1`) left as is (user decision).
