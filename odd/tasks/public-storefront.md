# Public Storefront

## Objective
Implement the approved public commercial storefront from the uploaded design handoff without mixing client and internal-staff authentication.

## Problem
The prior root route was the protected internal admin. The design handoff defines public storefront, client login, and client access-request experiences.

## Scope
- Public storefront: `/` and `/catalogo`.
- Client routes: `/clientes/login` and `/clientes/solicitar-acceso`.
- Internal admin: `/admin/login` and `/admin/*`.
- Compatibility redirect from `/login` to `/admin/login`.
- High-fidelity visual implementation using existing React, TypeScript, Tailwind, and UI components.
- Visual-only client access-request form until a dedicated backend API is authorized.

## Constraints
- Do not reuse internal domain/MFA staff login for clients.
- No commits, push, or production deployment without explicit coordinator authorization.
- Preserve unrelated uncommitted work.
- Final logo asset remains pending confirmation; use existing public asset unless the handoff asset is explicitly approved.

## Delivery
- Strategy: ask-on-risk.
- Forecast: approximately 8 non-trivial frontend files; delegated route due to multi-file implementation.
- TDD: no configured TDD mode found during implementation; functional build/lint checks were run.

## Tasks
- [x] STOREFRONT-01 — Establish route namespaces and compatibility redirect.
  - Route: delegated; multi-file routing and page implementation.
  - Evidence: `App.tsx` maps `/` and `/catalogo` to public storefront, client pages under `/clientes`, staff area under protected `/admin`, and `/login` redirects to `/admin/login`. Staff redirects and post-login navigation now use `/admin`.
  - Checks: `npx vite build` passed; `npm run build` blocked by existing missing `vitest` type resolution in `features/dashboard/registry/compose.spec.ts`. Browser verification pending: Vite served on port 5174, but the required `agent-browser` executable was unavailable in this environment.
- [x] STOREFRONT-02 — Implement the high-fidelity public storefront home and reusable chrome/product card.
  - Route: delegated; multiple non-trivial React components.
  - Evidence: created reusable public chrome and a responsive home/catalog page with hero, categories, fallback product shelves, CTAs, promo and footer. Uses the shipped `/logo-grupo-security.png` only.
  - Checks: `npx vite build` passed. `npm run lint` reached pre-existing errors in `DashboardGrants.tsx` (2 `no-unused-expressions` errors); no storefront lint errors reported. Browser verification pending: Vite served on port 5174, but the required `agent-browser` executable was unavailable in this environment.
- [x] STOREFRONT-03 — Implement client login and access-request visual flows.
  - Route: delegated; two pages plus navigation.
  - Evidence: created client-only visual login and request pages. Forms prevent default and contain no API/auth-store calls; navigation returns to the storefront.
  - Checks: `npx vite build` passed. Browser verification pending: Vite served on port 5174, but the required `agent-browser` executable was unavailable in this environment.

## Progress
All approved frontend implementation tasks are complete. No commit was created per coordinator constraint.

## Next Step
Install or expose `agent-browser`, then verify `/`, `/catalogo`, `/clientes/login`, `/clientes/solicitar-acceso`, and `/admin/login` in-browser against the handoff. Authorize a client authentication/API contract before making either client form operational.

---

## Functional portal expansion (authorized 2026-09-24)

### Objective
Make the commercial storefront functional with dedicated customer accounts, server-authoritative catalog data, private type-based pricing, and internal approval.

### Decisions
- Public catalog exposes products without prices.
- Customer accounts are self-registered but remain `PENDING` until approval.
- Initial customer types are final customer and installer; distributor is out of scope.
- Type-to-price-list mapping is configurable by Commercial.
- Matching NIT/email records require human review.
- Supervisor, Admin Comercial, and Super Admin can approve or reject accounts.
- This release is catalog-only: no checkout, cart, quote request, or automatic email.

### Tasks
- [x] PORTAL-01 — Kilo: add isolated customer portal persistence, authentication, catalog APIs, and approval workflow.
  - Evidence: additive `portal_accounts`, `portal_sessions`, and `portal_price_list_mappings` migration/model; isolated customer JWT cookie/guard; public no-price catalog and product detail; active customer type-priced catalog and product detail; pending registration; staff approval/rejection and price-list mapping endpoints.
  - Checks: `npx prisma validate` passed; `npm run build` passed; focused portal/product Jest suite passed (109 tests).
  - Revision (Kilo, 2026-09-24): registration now links a matching existing `Customer` by NIT/email (`customerId`, case-insensitive) and the account stays `PENDING` per the ODD decision — approval reuses the linked customer instead of creating a duplicate NIT record; auto-created customers now use the house `CL-####` code with `documentType: 'NIT'` instead of ad-hoc `PORTAL-####` codes. Login no longer hard-fails on a missing type mapping (the catalog enforces it) and reports `403` "pendiente de aprobación"/"rechazada" only after a correct password, keeping the generic `401` anti-enumeration response for bad credentials. Customer-catalog price resolution is now a single batched `price.findMany` (was one query per product). `@Throttle` added to register (10/min) and login (5/min), mirroring the internal auth. `GET admin/price-list-mappings` added for the approval/config UI.
- [x] PORTAL-02 — Kilo: add backend authorization and regression tests.
  - Evidence: portal service tests cover email normalization/pending registration, non-enumerating pending login denial, no public price output, public detail no-price output, type-priced detail mapping, mapping prerequisite, and approval prerequisite; existing product lifecycle tests remain green.
  - Checks: `npx jest --runInBand --testPathPatterns=...` passed (2 suites, 109 tests).
  - Revision (Kilo, 2026-09-24): fixed two authorization defects found in review of the concurrent draft — (1) `@Roles()` was inert because `RolesGuard` was never applied: approval/rejection/pending/mapping routes now carry `@UseGuards(JwtAuthGuard, RolesGuard)` with the exact role matrix (review: Super Admin/Supervisor/Admin Comercial; type-price-list config: Super Admin/Admin Comercial); (2) customer-session routes (`auth/me`, `auth/logout`, `customer/catalog/products/:id`) lacked `@Public()` so the global internal `JwtAuthGuard` blocked portal customers before `PortalAuthGuard` could run. New `customer-portal.controller.roles.spec.ts` regression-contract locks the role matrix, the `@Public`/guard wiring, and that no class-level guard demands internal auth on public routes. Service spec extended to 16 tests: NIT/email match linking, PENDING/REJECTED 403 login semantics, anti-enumeration 401 with discard hash, mapping-independent login, batched type-price resolution, linked-customer reuse on approval, `CL-####`+NIT creation, and rejection audit/conflict paths. Final checks (this revision): `npx prisma validate` passed; `npm run lint` passed; `npm run build` passed; full backend suite `npx jest` 47/48 suites green with 828/829 tests passing — the single failure is the pre-existing date-dependent `account-lockout.service.spec.ts` "reinicia el contador" (fixed fixture date 2026-09-21 vs. now-anchored window, committed in 54f7cf0, untouched by portal work; fails identically without these changes).
  - Final verifier (2026-09-24): `npm run build` passed (exit 0). Focused `npm test -- --runInBand src/modules/customer-portal/customer-portal.service.spec.ts` passed: 1 suite, 16/16 tests. Integration remains unproven: `docker compose ps` showed no local services/database, so no migration was applied and API/browser flow testing remains pending.
- [x] PORTAL-03 — OpenCode: wire storefront, customer session, catalog, registration, and product-detail pages to the new APIs.
  - Evidence: Added isolated `customer-portal` Axios service and Zustand session state (without staff persistence/MFA), public and authenticated TanStack catalog queries, registration/login/session guard, real catalog pages and responsive data-driven storefront. Public cards/details explicitly render no price; authenticated catalog shows only backend-provided assigned-list price. Routes: `/catalogo`, `/catalogo/productos/:productId`, `/clientes/productos`, `/clientes/productos/:productId`.
  - Checks: `npx vite build` passed. `npm run build` remains blocked by pre-existing missing `vitest` type resolution in `features/dashboard/registry/compose.spec.ts`. `npm run lint` has no errors in PORTAL files; it remains blocked by two pre-existing `no-unused-expressions` errors in `features/users/components/DashboardGrants.tsx`. `npm test -- --run` could not start because the local `vitest` executable is missing.
  - Detail follow-up: Backend now provides server-authoritative public and authenticated `GET .../catalog/products/:id` endpoints; detail hooks call those endpoints directly. `npx vite build` passed after this integration.
- [x] PORTAL-04 — OpenCode: add the internal approval queue UI and frontend tests.
  - Evidence: Added a pending-account queue within Admin Comercial’s existing Customers page. Authorized staff can approve a pending account or reject it only with a reason; all mutations invalidate the queue query. The UI relies on backend role enforcement and does not alter staff auth.
  - Checks: same frontend checks as PORTAL-03. Automated frontend tests were not added/run because the local Vitest executable and its TypeScript resolution are unavailable; PORTAL-05 must verify the live API workflow.
- [ ] PORTAL-05 — Coordinator: run integrated functional, security, and browser verification.

### Progress
PORTAL-01 through PORTAL-04 are complete locally. The migration was created but was not run against production or any remote database. PORTAL-05 remains required for integrated functional, security, and browser verification. Final verifier confirmed backend build and 16/16 focused portal-service tests; Docker reported no running local DB, so local migration/API/browser proof is still pending.

Coordination note (2026-09-24): an OpenCode session ran the backend draft concurrently with the Kilo backend session despite the Kilo-backend/OpenCode-frontend split. Kilo audited the draft after it quiesced and completed PORTAL-01/02 on top of it (see revision bullets) instead of duplicating the module. No commit, push, deploy, or production migration was performed by either session.

### Delivery constraints
- Delegated implementation: Kilo owns backend/Prisma; OpenCode owns frontend.
- No commit, push, deployment, production database migration, or unrelated-file modifications without separate authorization.

### Neon migration verification (2026-09-24)
- Coordinator explicitly authorized the configured Neon PostgreSQL database.
- `npx prisma migrate deploy` applied `20260924090000_add_customer_portal` successfully.
- `npx prisma migrate status` then confirmed: `Database schema is up to date!`
- No deployment, fixture records, commits, or pushes were created.

## Portal work committed (2026-09-28, coordinator authorization)
- Schema + migration `20260924090000_add_customer_portal` → commit `8e0646d` `feat(prisma): add customer portal schema and applied migration`.
- Backend module (controller + roles contract, service, portal-auth guard, DTOs) → commit `dfcff32` `feat(customer-portal): backend module with RBAC matrix and portal specs` — spec evidence: `npx jest src/modules/customer-portal` 3 suites / 32 tests PASS (host, jest+ts-jest). NOTE: container Jest falls back to babel-jest (image built without devDependencies) → backend specs run on host, not in the api container.
- Frontend portal (ClientLoginPage, AccessRequestPage, `features/customer-portal/`, `services/customer-portal.service.ts`, `stores/customer-portal-auth.store.ts`) → commit `053a0bc`.
- PENDING: `CustomerPortalModule` is NOT registered in `app.module.ts` → no `/portal` routes yet. PORTAL-05 (integrated browser verification) remains open.

---

## Related feature: Mega Menu Categorías (2026-09-25)

See [mega-menu-categorias.md](./mega-menu-categorias.md) — approved full-stack mega menu (backend media fields + public endpoint, demo seed + placeholder images, frontend data layer, mega menu UI, category landing page). Extends the same storefront: header `Categorías` trigger, `/catalogo/categoria/:slug` routes, and `useCategoryMenu()` hook over the same catalog tree. TDD OFF record applies here too (no configured TDD mode found).
