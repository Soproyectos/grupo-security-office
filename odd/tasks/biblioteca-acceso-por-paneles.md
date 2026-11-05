# Biblioteca: access only from panels (rebuild, v1)

## Objective
Rebuild the access rules of the Biblioteca panel so that EVERY permission comes from panel assignments (grants), never from job role or from Listas, and leave the panel ready to be used and tested. Source of truth for the rules: `docs/biblioteca-dominio/mapa-de-permisos-biblioteca.md` §7 (user answers of 24/10/2026) and the gap list in §4.

## Rules (user decisions)
1. Internal notes only with their own permission (`products:notes`); fix the leak in list/detail responses.
2. Roles never grant Biblioteca permissions. Super Admin keeps full access and administration (confirmed by the user on 26/10). Default panel anchoring by role remains a separate pending action.
3. Mass uploads (Excel) and editing live only in Biblioteca > Actualización.
4. Prices change only by mass upload or from the product sheet; nothing else may write prices (e.g. `prices[]` in PUT/POST /products).
5. No dependency on Listas anywhere in Biblioteca flows (listing, detail, edit, publish, price import checks): `listas:*` removed from Biblioteca packages and checks.
6. Actualización = ONE panel access: edit (modify, edit, mass upload, prices, remove/archive with confirmation), INCLUDING internal notes (confirmed 26/10). Complete global history remains T36, not delivered by this permission slice.
7. (26/10/2026) Tariffs (escalafones) are DATA, not code: any user with the Actualización "edit" permission can create and edit them (name included). The fixed list `PRICE_IMPORT_TARIFFS` and the `ORO_IVA` vs `DPP_ORO_IVA` rename are therefore superseded: no database rename; the price import must read tariffs from the existing tariff records. Design to confirm with the user before building (see report).
- Biblioteca panel = 3 tabs = 3 selectable packages in the assignment screen: Productos (read-only: catalog with prices and characteristics), Actualización, Publicación. Granting the panel by default gives only Productos.

## Constraints
- AGENTS.md: no commit/push/deploy/migrations/service changes without explicit approval; no DB writes (no migrations, no data scripts).
- Existing users who edit/publish today by role LOSE that ability until a package is assigned: transition must be planned and approved before any deploy.
- Backend and frontend dependencies are now present (verified by Codex on 26/10). No dependency installation is needed to resume checks. Backend typecheck currently fails in tariff-import specs using the old contract; this is a separate pending integration fix.
- Backend has uncommitted baseline edits (acl, products, price-import); targeted edits only.
- UI: Spanish, verb first, sentence case, one primary button per screen. Plain language with the user.

## Tasks
- [x] T30 Record the rules (map doc §7, memory, this doc).
- [ ] T31 Reconcile backend test readiness: dependencies are present and focused grant suites ran (145 tests on 26/10); full typecheck still fails in the tariff-import specs. Do not reinstall dependencies or mark the whole backend verified.
- [x] T32 Grant-only Biblioteca checks implemented and covered by focused tests; Super Admin bypass retained. Session profile now uses live global grants and dependencies; audit alternative path closed. Not an exhaustive browser/HTTP acceptance of every endpoint.
- [x] T33 Library note filtering, price-body rejection, write-controlled delete/archive and listing/detail without Lista ACL verified by focused tests. Audit before/after values additionally require write+notes.
- [x] T34 Three current packages in Biblioteca, catalog version `panels-20261026-2`; previous packages only revocable; new Listas grants rejected. Commercial/Vendedor no longer implicitly grants Biblioteca in new assignments. No existing users migrated.
- [x] T35 Library controls use grants/global scope; own-access refresh synchronizes profile permissions without changing identity; publishing separated from archive/edit. Old Listas and Lista assignment routes redirect to Products; old links/copy/KPI removed from visible flows.
- [ ] T36 History: every change recorded and visible in Actualización > Historial (resumes paused phase 3 with grant-only guards); paneles por defecto por cargo as a Super Admin action (no silent migration).
- [ ] T37 Verification, test-environment instructions (what the user must approve to run backend + DB locally), report.

## In flight (separate task, not blocked by this one)
Single-price import (option B): `odd/tasks/biblioteca-precio-unico.md`.

## Out of scope / pending
Public files (photos/PDF open by link): confirm; role defaults mapping (which panels per role) to be proposed; data migration of existing users; dedicated-DB cutover.

## Progress / evidence
- T30 done: rules recorded.
- 26/10, final permission block: Codex + economical agent completed T32-T35 in code and QA. User confirmed Super Admin full access and notes included in Actualización, then explicitly approved updating only `gs-test-demo-api`. 228 backend tests / 8 suites and 76 frontend tests / 8 files passed; lint, application typecheck, Nest and frontend builds passed. Full backend typecheck retains 16 pre-existing tariff-spec errors (T31/next tariff block). QA catalog `panels-20261026-2`, zero new Listas actions, active profiles checked read-only, health OK, counts unchanged 5056 products / 4 users / 52 grants. Browser assignment/revocation acceptance remains T37. See `docs/bitacora/2026-10-26-biblioteca-permisos-sin-listas.md`.
- 26/10, runtime preview: at the user's request, this branch's compiled backend was applied to the existing VPS test API `gs-test-demo-api`, retaining its configuration and `gs_api_copy` database; no migrations or production changes. The running API reports `panels-20261026-1` and the three new Biblioteca packages. Local frontend `http://127.0.0.1:5173` uses an HTTP tunnel to that API. Health OK, anonymous products 401, product/user/grant counts unchanged (5056/4/52). This is not browser acceptance or a dedicated-database cutover. See `docs/bitacora/2026-10-26-biblioteca-preview-local.md`.
- 26/10, T34 frontend slice: OpenCode (`opencode/deepseek-v4.1-flash-free`) implemented the three visible Biblioteca packages and retained the previous packages under `Accesos anteriores`. Codex reviewed and requested the missing grouping/empty-state/SSR coverage, then fixed the adjacent cache-helper test to forward the server-provided catalog version. `UserAccessAssignments.spec.tsx`, `access.spec.ts` and `App.spec.tsx`: 39 tests passed; lint on the three changed files and frontend `tsc -b` passed. No browser/API click-through, user reassignment, services or production changes. See `docs/bitacora/2026-10-26-biblioteca-opencode-asignacion.md`. T34/T35/T37 are not closed in full by this slice.

## Next step
Accept assignment/revocation in the running QA page with test users (T37), explicitly replace/remove old access sources as needed; then close the tariff-import contract transition and resume global history. Dependencies are already available. No schema/data retirement is implied by removing Listas from visible flows.
