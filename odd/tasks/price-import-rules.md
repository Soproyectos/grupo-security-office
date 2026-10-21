# Price import rules: mixed lists, unknown SKUs, large-change alert, product history

## Objective

Change the price import (`src/backend/src/modules/prices/import`) so that the purchasing person can upload one template with mixed lists and brands. The system matches rows by SKU, applies the valid ones, reports the rest, warns about large price changes, and keeps a per-product history of every change. The purchasing panel and the 3-step screen come after this backend slice.

## Problem

- The SKU lookup is tied to one destination lista, so a mixed file cannot be loaded.
- Any invalid row, including an unknown SKU, blocks the whole revision (`REVISION_HAS_ERRORS`).
- There is no alert for large price changes.
- There is no per-product history. Price changes are visible only per import revision. `AuditService.log` does not even write `productId`.
- `ADR-20261014` and `DISENO-IMPORTACION-PRECIOS-2026-10-14.md` contradict the decisions below.

## Product decisions (user, 2026-10-20)

- R1: a price file is matched by SKU only, without a destination lista. A product keeps its own single lista and is never moved by an import. Products with no lista are updated and marked "sin lista" (no auto-link). Rows whose lista the person has no permission on are rejected.
- R2: an unknown SKU is rejected and reported without stopping the import. Users with Biblioteca permission can then create the product as a hidden draft marked "pending ficha" (SKU, name, brand, category) and its price from the file is applied, or skip it.
- R3: a price change above 30% (up or down) is flagged with previous, new and percent. It does not block, and the person must confirm before applying. Zero, negative, non-numeric and out-of-range prices are always rejected. A blank cell keeps the current price.
- R4: import history per revision (exists) plus per-product history of every variable: who, when, old value, new value, source.
- R5: template v3 columns REFERENCIA, INSTALADOR_IVA, TIENDA_IVA, ORO_IVA, DPP_PLATINO_IVA, CLIENTE_FINAL_IVA, final prices with IVA, whole COP, HALF_UP (already met; regression tests only).
- Apply with rejected rows: the valid rows are applied, but the person must explicitly confirm the number of rejected rows left unapplied.

Defaults adopted from the design (change if the user objects):

- Pricing products with no lista, and resolving unknown SKUs, require `prices:apply` and `products:write` with global scope.
- Large changes are confirmed in the same apply call (`confirmLargeChanges`); the same person may prepare and apply.
- If a permission is revoked between preview and apply, the whole apply returns 409 (atomic).
- Skipped unknown SKUs are not remembered for the next import.
- Uploaded files of applied revisions are kept until a retention policy exists.

## Scope

Backend only: migration, types, price import service, a resolution controller for unknown SKUs, a `ProductChange` history with its read endpoint, history writes for price apply, draft creation, manual price edits, product create/update and lifecycle transitions, and document amendments. History for images, the vitrina sheet, legacy and Biblioteca imports, hard delete and lista unlink is NOT covered yet, and the history API must say so.

## Out of scope

The 3-step screen, the purchasing package and its assignment, Supabase data comparison, domain and deploy work.

## Constraints

- Prefer additive, non-destructive migrations with a `migration.down.sql`.
- No new action IDs: reuse `prices:*`, `listas:*`, `products:write`.
- Throwaway Postgres containers only (ports 127.0.0.1:54400-54420); never touch `gs-api`, `gs-frontend`, `gs-db`, host nginx, or any container named `gs-tanda-db`.
- Code, comments and commit messages in English; docs under `docs/procedimientos` in neutral Spanish. Conventional Commits, no AI attribution.
- Planning heuristic of about 400 authored changed lines per task is advisory only.

## Delivery

- Stacked PRs into main (user decision, 2026-10-20). PR 0: `feat/panels-price-import-base` -> main. Block 1 (T8, T1, T4): `feat/price-import-rules-1` based on the base. Block 2 (T2, T3, T5): `feat/price-import-rules-2` based on block 1. Block 3 (T6, T7): `feat/price-import-rules-3` based on block 2. Each PR targets the previous branch; after a PR merges, the next one is retargeted to main.
- Strategy: `ask-on-risk` with chain strategy `stacked-to-main` (chosen by the user), because the forecast is about 3,000 authored lines.
- TDD: off (no project or session configuration); RDD unavailable (`gentle-ai` is not installed); functional checks per task.
- Engram mirror `odd/price-import-rules/tasks`: pending (Engram tools unavailable in this session).

## Tasks

Route per task: delegated writer (2+ non-trivial files). Design source: the read-only design of 2026-10-20 recorded in this document's decisions.

- [x] T8 Amend `ADR-20261014`, `DISENO-IMPORTACION-PRECIOS-2026-10-14.md` and `IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md` to match the decisions. Check: no remaining text that requires a destination lista or forbids unknown-SKU creation.
- [x] T1 Additive migration (`price_import_revisions.listaId` nullable with `SET NULL`; row columns `productId`, `listaId`, `resolution`, `resolvedAt`, `resolvedById`; price columns `productId`, `changePercent`, `largeChange`; table `ProductChange`), types and constants (`LARGE_PRICE_CHANGE_PERCENT = 30`, incidence codes), in-memory test helper. Check: `migrate deploy` up and down on a throwaway DB, `migrate diff` empty, `tsc`.
- [x] T4 `ProductChangeService`, `AuditService.logTx`, `productId` in audit, `GET /api/products/:id/changes` (price fields only with `prices:read`). Check: unit and DB-backed specs.
- [x] T2 R1 in `computePreview`, `saveRevision` and revision reads: global SKU matching via `findProductsBySkus`, per-lista authorization, `byLista` summary, idempotency by file hash and creator. Check: updated and new specs.
- [x] T3 R3 percent and flag in preview and save. Check: boundary specs 30.00 / 30.01 / previous zero.
- [x] T5 New apply: valid rows only, explicit confirmation of rejected rows (`acknowledgeRejectedRows`) and large changes, `prices:apply` per lista, `FOR UPDATE` on products, `P2034` mapping, history and audit inside the transaction, skip `unchanged`. Check: mock specs plus DB-backed concurrency specs.
- [ ] T6 R2 draft creation (`createPendingSheetDraft`) and the resolution controller; confirm the sheet and library routes open `listaId` null products. Check: specs, plus the draft does not appear in `PUBLIC_CATALOG_VISIBILITY` search or detail.
- [ ] T7 History writes in `prices.service` (create, update, delete), `products.service` create/update and lifecycle transitions. Check: specs.

## Acceptance criteria

- A mixed file updates the prices of products in several listas in one revision, and rows in listas the person cannot touch are rejected without leaking list names or prices.
- An unknown SKU never blocks the others, and can be created as a hidden draft that does not appear in the public vitrina.
- Changes above 30% are flagged and require confirmation; rejected rows require explicit acknowledgement.
- Every applied price change creates one `ProductChange` row per product and tariff with the revision id.
- `tsc`, lint, jest and vitest show no new failures against the recorded baseline (6 failures in `public-products.spec.ts` on main and 4 in `product-revisions.backfill.spec.ts`, which needs the container `gs-tanda-db`).

## Progress

- 2026-10-20: design produced and decisions recorded. Next: user chooses the chain strategy, then T8.
- 2026-10-20 T8 done: ADR amended in place (section "Enmienda 2026-10-20"), design doc and implementation report annotated, recovery note added. Check: `rg` for destination-lista / unknown-SKU-not-created sentences shows only amended text.
- 2026-10-20 T1 done. Checks (throwaway postgres:18-alpine): `prisma validate` ok; `migrate deploy` from scratch ok; `migration.down.sql` then `migrate deploy` again ok (up/down/up); `migrate diff --from-migrations --to-schema-datamodel` = "No difference detected" and `--from-url` (after up/down/up) also empty; backend `tsc --noEmit` 0; eslint src/modules/prices 0 errors; jest prices+audit 14 suites / 328 tests pass (includes new helper and types specs).
- 2026-10-20 T4 done. Checks: new specs pass (product-change.service 17+, controller 2, audit write 3); DB-backed `product-change.db.spec.ts` 2/2 against a throwaway postgres:18-alpine (skipped unless `PRODUCT_CHANGES_TEST_DATABASE_URL` is set); backend `tsc --noEmit` 0; eslint `src/**/*.ts` 0 errors (6 pre-existing warnings); full jest (without the backfill spec, which needs `gs-tanda-db`): 104 suites passed, 7 failed / 76 failed tests = 6 in `public-products.spec.ts` (same as main) + 70 in six specs that hard-code a Postgres at `localhost:54331` (listas-conservation, catalog-jobs, access-assignments, batch-executor, workflow-links, workflow-convert; "Can't reach database server"), untouched by this block and environment dependent (no listener on 54331 in this session).
- Block 1 commits: T8 dcd3aa6, T1 d7fef58, T4 b356847. Route per task: one delegated writer (inline docs for T8). Next: block 2 (T2, T3, T5).
- 2026-10-20 T2 done (324f31b, branch `feat/price-import-rules-2`). Route: delegated writer. Checks: backend `tsc --noEmit` 0 errors; eslint on touched dirs 0 errors; jest `src/modules/prices` + `products/helpers` + `common/filters` 15 suites / 335 tests pass; DB-backed `price-import.db.spec.ts` 4/4 on throwaway postgres:18-alpine (127.0.0.1:54400, migrate deploy applied). Note: apply of a mixed (null lista) revision answers 409 `REVISION_APPLY_UNSUPPORTED` until T5; the single-lista apply tests move to T5.
- 2026-10-20 T3 done (eaa83a8). Route: delegated writer. Checks: boundary specs 30.00 / 30.01 / -30.00 / -30.01 / previous zero / decimal previous / env override pass; regression specs for 0, negative, non-numeric, out of range, blank cell, HALF_UP and template v3 header order pass; jest `price-import.service` + `price-import-revisions` 68/68; DB-backed `price-import.db.spec.ts` 5/5 (percent persisted, extreme ratio clamped to 9999999.99); tsc 0; eslint prices 0 errors.
- 2026-10-20 T5 done (061baa9). Route: delegated writer. Checks: new `price-import-apply.spec.ts` 39 tests and `price-import-apply.http.spec.ts` 11 tests pass; DB-backed `price-import.db.spec.ts` 10/10 on throwaway postgres:18-alpine, run 3 times (real apply, rollback on audit failure, concurrent double apply, FOR UPDATE race against a `listaId` change, real P2034 recognized); backend `tsc --noEmit` 0; eslint `src/**/*.ts` 0 errors (6 warnings); full jest with the 54331 throwaway DB prepared (t05..t09 migrated) and the backfill spec excluded: 115 suites, 114 passed, 1 failed = the 6 known `public-products.spec.ts` failures; 1,997 tests passed. `prisma migrate diff` = no difference; frontend `tsc -b` exit 0. Not run: `product-revisions.backfill.spec.ts` (needs `gs-tanda-db`).
- Block 2 commits: T2 324f31b, T3 eaa83a8, T5 061baa9. Next: block 3 (T6, T7).
