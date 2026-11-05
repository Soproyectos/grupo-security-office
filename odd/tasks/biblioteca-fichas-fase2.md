# Biblioteca product sheet editing flow — phase 2 (frontend only)

## Objective
Let a user edit product sheets ("fichas") from the Biblioteca: Productos stays view-only; Actualización gets sub-navigation (Carga de precios | Fichas de producto | Historial de cambios), a work queue of pending products and a per-product sheet editor. Frontend only; no API or data model change; reuse existing components/services.

## Decisions
- Edit permission = `products:write` (catalog action "Editar productos"); delete = `products:delete`; do not weaken.
- "Listas" is removed from Actualización; `/commercial/lists*` routes stay alive but with no link in any Biblioteca menu.
- The Actualización tab (`CATALOG_TABS`) and the `library/update` layout boundary moved from `listas:read` to `products:write` (approved by the user after phase 2: with Listas gone, all Actualización content needs `products:write`). `listas:read` alone no longer grants any Biblioteca tab; `/commercial/lists*` routes keep their own `listas:read` boundary.
- Queue quick filters (sin imagen, sin marca, sin precio, borrador) are computed client-side on the loaded page from fields already returned by `useProducts`; the list API only filters by search/category/brand/isVisible/isActive. Server-side filters are pending.
- "Historial de cambios" (global) has no real source (only per-entity `GET /audit/Product/:id`): shown as a disabled "Próximamente" item; the per-product Historial section lives in the editor.
- Preview panel "Cliente | Tienda | Vendedor": no reusable admin-product preview exists; mock-up marked "pendiente".
- Design: one primary (corporate red) button per screen; Spanish, verb first, sentence case.

## Constraints
- No commit/push/deploy without explicit approval (AGENTS.md). No backend changes.
- `ProductsPage.tsx` and `ProductDetailPage.tsx` have uncommitted work from the builder thread: edit only what is strictly needed, with targeted edits.
- Known backend limits (not ours to change): `PUT /products/:id` only for Super Admin / Admin Comercial; `update()` rejects isActive/isVisible/publishStatus/publishAt/unpublishAt; `DELETE` needs roles + ACL manage.
- TDD: not enabled; ordinary functional checks (`npx tsc -p tsconfig.json --noEmit`, `npx vitest run <specs>` in `src/frontend`).
- Route per task: delegated direct (one writer at a time).

## Tasks
- [x] T7 Sub-navigation layout for Actualización (Carga de precios | Fichas de producto | Historial próximamente); remove Listas card; queue page `/commercial/library/update/products` with quick filters + "Siguiente pendiente".
- [x] T8 `ProductsPage`: new helper text, "Editar ficha" on cards and table rows (only with `products:write`), filters preserved on "Volver" (filters/page now synced to URL search params).
- [x] T9 Editor route `/commercial/library/update/products/:productId` (`AccessBoundary products:write`): sections, bottom bar (Guardar cambios / Descartar + unsaved counter), breadcrumbs, preview mock-up.
- [x] T10 Specs (queue, button, layout, routes, editor, helpers) + tsc + vitest green.
- [~] T11 Verify what is possible; report to parent. Browser check NOT done: the built-in pane is not signed in; interactions have no DOM-level tests.

## Out of scope / pending
Server-side queue filters (hasImage, hasPrice, missing brand, status), global change history, image reordering (no endpoint), showcase-name/OSCO-reference fields if absent from the API, real Cliente/Tienda/Vendedor previews, `listas:read` gating review, backend list-price redesign, product photo history, staleTime/price invalidation.

## Progress / evidence
- Route per task: all delegated direct (mapper + writer A for T7/T8 + writer B for T9); trigger = mapping (4+ files) and writer (2+ non-trivial files) rules.
- Parent re-run after writer B: `npx tsc -p tsconfig.json --noEmit` exit 0; `npx vitest run src/App.spec.tsx src/features/users src/components/layout src/pages src/features/products`: 33 files, 285 tests passed. Writers also report `eslint` clean on changed files.
- Vite at :5174 compiles (HTTP 200) LibraryProductEditorPage, LibraryProductQueuePage, LibraryUpdateLayout, LibraryUpdatePage, ProductsPage, App.
- Shared-component change (additive, default unchanged): optional `embedded?: boolean` on `ProductSheetEditor.tsx` / `ProductSheetTab.tsx` (non-sticky bar, secondary button).
- Commits: none by design (AGENTS.md).

## Gating change (approved by the user)
- Tab + `library/update` layout boundary: `listas:read` -> `products:write` (`access.ts`, `App.tsx`). Parent re-run after the change: `npx tsc -p tsconfig.json --noEmit` exit 0; `eslint` on the 6 touched files exit 0; `npx vitest run src/App.spec.tsx src/features/users src/components/layout src/pages src/features/products`: 33 files, 286 tests passed. Specs updated: `access.spec.ts` (+ new test: products:write grants Actualización, listas:read does not), `CommercialLayout.spec.tsx`, `Header.spec.tsx`, `App.spec.tsx`.
- Effect: a `products:write`-only user now gets the panel, Actualización, the queue and the editor; a `listas:read`-only user no longer sees Biblioteca. Users with `products:read` + `listas:read` but no `products:write` lose the Actualización tab (it had no content for them).

## Findings / flags for the parent
- Backend limits: `PUT /products/:id` and delete only for Super Admin / Admin Comercial; `deleteProduct` sends only `confirm` + optional `clave` (the master key of ProductDetailPage's modal is ignored by the service).
- Fields that do not exist: showcase name on Product (only "Nombre de ficha" inside the public sheet, edited via embedded sheet editor), OSCO reference (omitted, SKU read-only).
- "Editar precios": detail page has no tab deep-link and hides Precios outside a Lista -> link to the Lista product page when `listaId` exists, else "Ir a carga de precios".
- Queue chips are client-side on the loaded page (list API lacks hasImage/hasPrice/missing-brand/status filters).
- Untested: interactions (edit/save/discard/beforeunload/modals, ProductsPage URL write-back) have only server-render + pure-helper tests; no browser check yet.

## Next step
Sign in to the pane (or the user opens http://localhost:5174/commercial/products) and check the flow: Productos > Editar ficha > editor > Volver; Actualización > Fichas de producto (queue) > Siguiente pendiente.
