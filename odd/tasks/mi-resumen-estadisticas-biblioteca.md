# Mi resumen: per-tab library statistics permission

## Objective
"Mi resumen" (`/`) is empty by default. Library statistics appear only when the user has an extra, per-tab
permission ("Ver estadísticas") on top of the tab's own access. Consulta with only the Productos tab sees no figures.

## Decisions (user-approved, 2026-10-27)
- Agenda propia is level 0 by role (done, see `src/backend/src/common/security/base-access.ts`).
- One new assignable action per Biblioteca tab: products / update / publication. Off by default (no package grants it).
- Each action depends on its tab's own access; the API enforces it (hiding in UI is not authorization).
- Scope: the 3 Biblioteca tabs only. Backend work authorized by the user. No migration, no commit.

## Tasks
- [x] T1 Backend: three `libraryStats:*` actions in the access catalog (+ spec)
- [x] T2 Backend: `GET /api/dashboard/library-stats` returning only the sections the user is granted (+ spec)
- [x] T3 Frontend: Mi resumen renders those sections, empty state when none (+ spec)
- [x] T4 Make the new actions assignable from the Usuarios access screen (if it needs a label/entry)
- [x] T6 Productos card redesigned (total, state, needs-attention, link) and two notices (no panels / stats not enabled); vitest AssignedHome 13/13, tsc and eslint clean on touched files
- [ ] T5 browser check (needs the user's login; not done)

## Known data gaps (not calculable today)
Image upload date/author, who edited a product, previous price. `pendingPublication` in
`dashboard-insights.service.ts` counts a `READY` state that is never written: do not reuse it.

## Constraints
TDD off (runner: jest backend, vitest frontend). No touching ProductsPage, Library*, library-workspace.css,
price-import, CommercialLayout, Header. Fictitious data in tests. No commit/push without approval.

## Route
Delegated direct: one writer (backend + frontend).
