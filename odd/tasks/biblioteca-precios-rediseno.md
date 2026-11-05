# biblioteca-precios-rediseno

Locator: `odd/tasks/biblioteca-precios-rediseno.md` — Engram mirror topic `odd/biblioteca-precios-rediseno/tasks` (pending).

## Objective
Redesign the "Precios" tab of Biblioteca (`/commercial/library/update`) so Compras can upload a price template, see it checked against the products in Biblioteca (by reference/SKU), understand every problem (unknown reference, duplicates, ambiguous match, invalid/missing prices, no permission, unconfigured tariff, big changes), and apply with confidence.

## Problem (user order, 2026-10-28)
The tab is a card plus a button; the whole flow lives in a full-screen modal. Problems are mixed into one flat table, text is repeated, prices do not refresh after Apply, there is no history on this tab, and UI/server permissions differ.

## Scope (authorized by the user, frontend only)
- T1 Show the flow directly in the tab (no modal, no intro card, no duplicated titles).
- T2 Group problems by kind with plain-Spanish titles, counts, what happens to those rows; list of big changes with %.
- T3 Comparison table: filter chips (Todas / Con problemas / Cambian / Sin cambios / Cambio grande) and a % column; brand tokens only.
- T4 Refresh product/price data after Apply (invalidate TanStack queries).
- T5 Success screen: clearer, link to Productos; clearer unknown-reference text.
- T6 Download the problems list (CSV, client-side) so the file can be fixed.
- Pending, NOT in scope without approval: backend changes, permission alignment (`products:write` vs `prices:*`), global history endpoint, editable tariff names. Revisions history stays out until permissions are decided.

## Constraints
AGENTS.md: no commit/push/deploy/migration/container changes without explicit approval (so NO work-unit commits here). Brand tokens only. Keep every existing field/action. `PriceImportModal`/`PriceImportPreviewPanel` stay for Lista pages.

## Mode
TDD: not configured (disabled); ordinary checks: `npx tsc --noEmit` + vitest in `src/frontend/src/features/price-import`, `src/pages`, `components/layout`.

## Checklist
- [x] T1 flow inline in tab
- [x] T2 grouped problems (+ pure util with spec)
- [x] T3 table filters + % column
- [x] T4 invalidate queries after Apply
- [x] T5 success screen + texts
- [x] T6 problems CSV
- [x] Checks green, report

## Progress / evidence
(route: delegated writer for T1–T6; parent verifies)

- Writer done T1-T6 (delegated). Parent re-ran: tsc --noEmit OK; vitest price-import + LibraryUpdatePage + layout: 69 passed; color scan (hex/red-/amber-/green-/blue-) clean in touched price files.
- NOT verified: render at 1440/375px (login needed, no backend); no spec for Flow click-apply/CSV download; checklist-ux.md not run.
- Pending: permissions alignment (products:write vs prices:*), history, tariff names; no commit (AGENTS.md).

## Phase 2 — independent Biblioteca tabs (user order, 2026-10-28)
Decision: Biblioteca panel -> tabs Productos / Fichas / Precios are independent; each is assigned separately and each shows only what the person was granted. "Actualización" stops being a place/tab/package name. Old package kept only as "Actualización (anterior)" (not assignable, still removable) so nobody loses access silently (assumption; user said it "se modifica", no data migration).
- [x] T7 Backend catalog: packages biblioteca-consulta ("Productos"), biblioteca-fichas ("Fichas"), biblioteca-precios ("Precios"); publicacion depends on Fichas; legacy biblioteca-actualizacion non-assignable; bump ACCESS_CATALOG_VERSION (+ frontend mirror); backend specs
- [x] T8 Frontend access model: tabs each with own action; routes/AccessBoundary per tab; Precios gated by prices:*; Save/Apply buttons by real grants (not by cargo)
- [x] T9 Rename visible texts "Actualización" -> pestaña Fichas / Precios; users screen shows Productos/Fichas/Precios
- [x] T10 Specs + docs (mapa-de-permisos, PRODUCT.md) + handoff in docs/handoffs/
- [ ] T11 (next, needs design) per-tab fine-grained permission checkboxes in the users screen (e.g. Precios: revisar / guardar / aplicar)

- Phase 2 done (no commit): backend catalog + purge, frontend access per tab, texts, docs, handoff `docs/handoffs/2026-10-28-biblioteca-tres-pestanas.md`. T11 pending design. Engram mirror pending.

## Phase 3 — T11 per-tab permission checkboxes (approved 2026-10-28)
Approved list. Productos: ver productos (products:read), ver precios (prices:read). Fichas: ver, editar (products:write), validar, notas internas, eliminar (products:delete); "Publicar en tienda" stays a separate complement. Precios: ver precios, revisar archivo (prices:preview), guardar revisión (prices:save), aplicar (prices:apply), ver y editar proveedores (providers:read/write). Ticking a box auto-ticks its dependencies. One "Biblioteca" block in users/access with the 3 tabs as sections; tab checkbox = tick all (shortcut), then fine-tune; one Save button; people who already hold Fichas/Precios packages show with all boxes ticked (nothing lost).
- [x] T11a backend: PUT /users/:id/access/library; one template source biblioteca-seleccion per user (no schema change)
- [x] T11b frontend: LibraryPermissionsBlock in UserAccessAssignments + gating by real grants
- [x] T11c specs, handoff, mapa-de-permisos

- T11a-c done (no commit, AGENTS.md; Engram mirror pending). Route: delegated writer. Storage: AccessSource kind template, templateId biblioteca-seleccion (reserved, not in PACKAGE_TEMPLATES), global grants; replaces consulta/fichas/precios/actualizacion sources and purges manual/legacy library grants in one transaction; publicacion kept only if products:write is selected (else 400). Handoff: docs/handoffs/2026-10-28-biblioteca-casillas-por-pestana.md.
- Evidence: backend tsc --noEmit = 17 pre-existing errors (prices/**, products.service.spec), none new; jest common/security + users.controller.access + auth.library-permissions + products.biblioteca-grants: 282 passed / 12 failed (3 known publication failures + 9 in catalog-resource-access.spec and data-scope.spec, untouched files, list-scope); new access-assignments.library-selection.spec 12 passed. Frontend tsc clean; vitest 111 files / 1147 passed.
- NOT verified: access-assignments.service.spec (real DB), real-DB run of replaceLibrarySelection, render at 375/1440px, checklist-ux manual.
