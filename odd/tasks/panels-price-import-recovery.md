# Panels + price import recovery

## Objective
Rebuild a compiling, tested base from copy B (the takeover snapshot) for the panels and price import work, so that the purchasing panel can be built on top of it afterwards.

## Problem
The unpushed work was recovered from two incompatible snapshots:
- A (`gs-tanda-recovered`): older "admin-access" model (`accessRule`, `ACCESS_ACTIONS`, `hasAction`, admin-access guard, action audit interceptor, `StorefrontBanner`).
- B (`takeover-extracted/src`): newer access model (grants / `resolveAccess` / `AccessAssignments`), price import with revisions, apply and provider profiles, packages in `access-catalog`.
- `B/current/` (23 files) is NOT newer: it removes APIs used by the rest of B and deletes three packages. It is excluded.
- A previous integration branch mixed both and failed: backend tsc 96 errors, jest 31/116 suites failed, vitest 27 failures.

## Scope (this task only)
Rebuild from B, restore the three packages and the `StorefrontBanner` model, remove leftovers of A, make it compile and pass tests.

## Out of scope
New features: mixed lists, unknown-SKU draft panel, >30% alert, per-product history, purchasing package. (Note 2026-10-20: these are now planned in `odd/tasks/price-import-rules.md`.)

## Constraints
- Production-candidate VPS: never touch gs-api, gs-frontend, gs-db, host nginx, ports 80/443/3001/8080/5432/19999, /opt/grupo-security, /etc, systemd, Netdata. No sudo.
- Databases only in throwaway containers (127.0.0.1:54400-54420, postgres:18-alpine); never create a container named `gs-tanda-db`.
- No push. Conventional Commits, no AI attribution.
- ~400 authored changed lines per task is an advisory heuristic only.

## Delivery
Single branch `feat/panels-price-import-base`, no push. Strategy: ask-on-risk. RDD: unavailable (gentle-ai not installed). TDD: off (restoration task; no project/session TDD config); functional checks only. Engram mirror: pending (Engram tools unavailable in this session).

## Tasks (route: delegated writer)
- [x] T1 Base: overlay B/src on 5449ecb2 (no `current/`), then keep only non-conflicting assets from A. Commits 92167d2, b5f20b1. Evidence: 94 files existed only in A; 14 kept (11 docs, banners migration SQL, 2 images), 80 dropped.
- [x] T2 Merge current origin/main with the documented conflict policy. Commit 89f7361. Evidence: 69 conflicted files resolved (35 takeover side, 19 main side, 15 hand-merged from d8ba797); no conflict markers left; main added no migrations.
- [x] T3 Restore `StorefrontBanner` in schema.prisma, check migration drift, verify the 3 packages and prices:* / listas:* actions.
- [x] T4 Green: backend/frontend tsc 0, lint 0 errors, jest and vitest failing only for pre-existing or environment reasons.
- [x] T5 Security notes on the merge resolutions (document only, no behavior change).

## Acceptance criteria
- Backend `tsc --noEmit` and frontend `tsc -b`: 0 errors.
- Lint: 0 errors on both.
- jest and vitest: failures only if pre-existing on origin/main or environment dependent, each listed with evidence.
- Migrations consistent with schema.prisma (or drift reported).

## Progress
- T3: `StorefrontBanner` added to schema.prisma (matches migration 20261009160000). `prisma migrate diff --from-migrations --to-schema-datamodel` printed 3 drifts before the fix and an empty migration after it. Schema-only fixes (no new migration): `Notification.id` is `@db.Uuid` with `gen_random_uuid()` default (as in migration 20261005160000), `CatalogJobUnit.updatedAt` gets `@default(now())`, and the long unique index on `price_import_revision_prices` keeps its truncated name through `map:`. The three packages exist in `access-catalog.ts` and `prices:read|preview|save|apply`, `listas:*`, `providers:*` are all defined there and used by the prices controllers.

- T4 (checks observed, throwaway Postgres 18 containers, migrations applied to t05..t09):
  - Backend `tsc --noEmit`: 96 -> 0 errors. Backend lint: 0 errors (6 pre-existing warnings).
  - Backend jest: 31/116 suites failed -> 2/107 failed (10 tests of 1874). Frontend `tsc -b`: 0 errors, lint: 0 errors (9 warnings), vitest: 27 failures -> 0 (863 tests, 84 files).
  - Fix commits: 5c5f1f4 (revision lens on public read + library include typing), 783237f (Header and supervisor pages), 53a6ee6 (stale specs), d88e926 (App route table), and the promotions controller commit below.
  - Remaining failures:
    - (b) `public-products.spec.ts`, 6 tests of `PublicCatalogService.search`: identical failure on a clean origin/main worktree (spec expects prices and no `isInformational`); left untouched.
    - (c) `product-revisions.backfill.spec.ts`, 4 tests: the spec shells out to `docker exec gs-tanda-db ...` (container does not exist here and was not created).
- T4 corrections of the first merge resolution (found while fixing): the earlier "main wins" choice had replaced the takeover Header, the two supervisor pages and App.tsx with main's role-based or demo versions, and had added `@Roles` to the promotions controller. All restored to the takeover side. A second `origin/main` merge (4c4b456, biblioteca verifier fix) is included.

## Security notes (T5, documentation only, no behavior changed here)
- customers, quotes: `JwtAuthGuard` only; every operation is decided in the service with `resolveAccess` over the current grants (own/team/global scope on the concrete resource). No role fallback.
- sales-targets: `JwtAuthGuard + RolesGuard` without `@Roles`; `targets:read` / `targets:edit` decided in the service by grants.
- promotions: same pattern; `@Roles` from main was removed so grant-holders without the Supervisor role are not blocked. Service denies when there are no grants.
- team-workflow: activities decided by `requireAction` (`resolveAccess`); `requests*` endpoints additionally require the Super Admin role.
- Public catalog: `PUBLIC_CATALOG_VISIBILITY` (main) is `PUBLISHED` OR library-informational records; it no longer requires `catalogPublished`. Public list and detail apply the revision lens on top. Informational records are exposed without price (`isInformational`).
- Price import (`/api/prices/import`): `JwtAuthGuard + RolesGuard + PermissionsGuard` with `@Roles('Super Admin','Supervisor','Admin Comercial')`, then per request `prices:*`/`listas:read` grants in the service and `assertListaAccess(view_prices)` per lista. `/api/prices` (lists and prices) uses `PriceActionGuard` with grants.
- Weaker or inconsistent places (not changed):
  1. (Note 2026-10-20: the "search only inside the chosen lista" rule of the original import is amended to global SKU matching with per-lista authorization; see `price-import-rules.md`.) `resolveAccess` is called WITHOUT a resource in price-import `assertActions`, so a lista-scoped grant is not limited to that lista there; `assertListaAccess` is the real limit.
  2. `PriceImportService.concede()` returns true when the user has no grants ("transition D5"), which contradicts the strict model used elsewhere. It is behind the controller role gate.
  3. The price-import controller role gate blocks grant-only users whose role is not Super Admin, Supervisor or Admin Comercial, even if they hold the `gestion-listas-precios` package (stricter than the model, not weaker).
  4. The takeover `d5-action` (strict, no-grants -> deny) is used by products/revisions/sheet; roles alone never grant these actions.
  5. Files taken whole from one side (user side for access, main for public read) lose any later main-side edits in those files; the list is in the merge commit message.
