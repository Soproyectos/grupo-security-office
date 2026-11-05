# Biblioteca menu restructure — phase 1 (navigation only)

## Objective
Replace the catalog panel menu ("Catálogo y precios": Listas / Biblioteca de productos / Publicación del catálogo) with a single "Biblioteca" entry with sub-tabs: Productos, Actualización, Publicación. Frontend only; no data model or API change.

## Decision (user)
- Productos: view only (`/commercial/products`, `products:read`).
- Actualización: everything that changes data (`/commercial/library/update`, `listas:read` for now, no permission weakening).
- Publicación: `/catalog-management/publication`, `products:publish`.
- "Listas" stops being a tab; `/commercial/lists*` routes stay untouched (ListasPage is the only way to manage Listas until the backend redesign).

## Scope (authorized)
`src/frontend` only: `features/users/access.ts`, `components/layout/CommercialLayout.tsx`, `components/layout/Header.tsx`, `App.tsx`, new `pages/LibraryUpdatePage.tsx`, and the affected specs.
Do NOT touch: `ProductsPage.tsx`, `ProductDetailPage.tsx` (other thread's uncommitted work), `nifty-robinson-8a8974`.
No commit/push/deploy without explicit approval (AGENTS.md).

## Constraints
- TDD: not enabled (no project/session config); ordinary functional checks. Runner: `npx vitest run <specs>` in `src/frontend`; typecheck `npx tsc -p tsconfig.json --noEmit`.
- Route: delegated direct (one writer; 4 source files + 1 new page + 5 specs).

## Tasks
- [x] T1 `access.ts`: `CATALOG_TABS` -> Productos / Actualización / Publicación; `isCatalogPath` includes `/commercial/library`.
- [x] T2 `CommercialLayout.tsx` title "Biblioteca"; `Header.tsx` label "Biblioteca" and fallback `/commercial/products`.
- [x] T3 `App.tsx` route `commercial/library/update` (`AccessBoundary actions={['listas:read']}`) -> new `LibraryUpdatePage`: "Carga de precios" (opens `PriceImportModal`, same gating as ListasPage button: `hasPermission('products:write')`) and transitional link "Listas" -> `/commercial/lists`.
- [x] T4 Update specs: `access.spec.ts`, `CommercialLayout.spec.tsx`, `Header.spec.tsx`, `App.spec.tsx`, `UserAccessAssignments*.spec` (only if affected: not affected, unchanged) + new brief `LibraryUpdatePage.spec.tsx`.
- [x] T5 Checks: tsc clean; vitest of touched specs green.
- [ ] T6 Manual check at http://localhost:5174/commercial/products (user logs in; no credentials entered by the agent).

## Out of scope (pending)
Productos read-only, Fichas de producto section, change history, price-list backend, product photo history, staleTime/price invalidation.

## Acceptance
tsc 0 errors; touched specs green; menu verified in the browser; report what was and was not verified. No commit.

## Progress / evidence
- Route per task: all delegated direct (writer), trigger = writer rule (2+ non-trivial files).
- Commits: none by design (AGENTS.md: commit requires explicit approval).

- T1–T4 done by one delegated writer; parent re-ran the checks.
- `npx tsc -p tsconfig.json --noEmit`: exit 0 (parent re-run).
- `npx vitest run` (6 touched specs): 6 files, 43 tests passed (parent re-run).
- Known gap (not fixed, pre-existing pattern): Header `NavItem` is a plain `NavLink` on `catalog.tabs[0].to`, so the "Biblioteca" entry is not highlighted on `/commercial/library/update`, `/commercial/lists*` or `/catalog-management/*`.
- `UserAccessAssignments.tsx` still labels its package "Catálogo y precios" / "Biblioteca de productos" (permission-grant UI, outside the authorized files).
- "Actualización" tab is not highlighted on `/commercial/lists*` (Listas is reachable only through the transitional link).

## Next step
T6: user signs in to the built-in browser (pane shows /login); then verify the menu at http://localhost:5174/commercial/products.
