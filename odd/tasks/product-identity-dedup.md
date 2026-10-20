# Feature: One product per model (SKU identity, dedup, sheet editing)

## Objective
Every model exists exactly once, is editable from its Lista, and its full product
sheet (Hikvision-style) can be edited section by section from the admin.

## Problem (evidence, 2026-10-02)
- Production and local DB: 181 duplicate pairs (362 of 678 products), identical pattern:
  - Copy A: created 2026-09-28 (biblioteca import), `listaId` NULL, `nameSource=curado`,
    mixed-case SKU (e.g. `iDS-E04HQHI-D`), visible in the store, no `technicalSpecs`, no images.
  - Copy B: created 2026-10-01 (price-list import), has `listaId`, `nameSource=sistema`,
    upper-case SKU (`IDS-E04HQHI-D`), has `technicalSpecs`, mostly not visible.
- Cause: the list import matches existing products by exact, case-sensitive SKU; `sku` is
  `@unique` case-sensitively, so `iDS-…` and `IDS-…` coexist.
- Admin catalog only lists products with a Lista → the 181 copies A are in the store but
  not visible/editable in the admin.
- Admin product card shows "SIN DATOS" and no image for a product whose detail shows 2 photos.
- The example enriched sheet was loaded onto copy A (`8f56c0a9`) while the user's photos are on copy B (`655337aa`, prod).

## Decisions (user-approved 2026-10-02)
- Survivor of each pair: the product that belongs to a Lista (copy B).
- Carry over from copy A: curated name (kept as `curado` and locked so imports don't overwrite it),
  enriched catalog data (catalog* fields, spec groups, resources) when the survivor has none,
  store visibility, and every reference (prices, quotes, orders, images, etc.) without losing history.
- SKU identity becomes case- and whitespace-insensitive in imports and in the database.
- Production data changes are delivered as reviewed SQL the user runs in the Supabase SQL Editor
  (Claude Code cannot write to the production DB).

## Constraints
- Test everything on the local DB first; produce a dry-run report per pair before applying.
- Merge must be atomic and idempotent; never delete a referenced row without repointing it.
- Unique constraint on the normalized SKU can only be added after the merge.
- TDD mode: off (no project/session TDD configuration). Ordinary checks apply.
- English for code/comments; UI copy in the existing Spanish.

## Acceptance criteria
1. Re-importing a list with SKUs that differ only in case/spaces updates the existing product.
2. After merge: 0 duplicate normalized SKUs; product count = 678 − 181; no orphaned references; prices/quotes/orders preserved.
3. The DB rejects a new product whose normalized SKU already exists.
4. Admin card shows the product's real primary image.
5. From a product in its Lista, an admin can edit: catalog name/slug/published, highlights, features (with icon), badges, available models, spec groups and items, documents, firmware files (incl. requiresLicense), specs disclaimer, firmware note.

## Tasks
- [x] D01 (delegated — writer trigger: import code + migration + merge SQL + tests): shared `normalizeSku` (trim, remove all whitespace, upper) used by list import (batch executor, import service), products create/update/bulk upload, biblioteca and media import; `findProductsBySkus`/`findProductBySku` helpers. Merge SQL `docs/procedimientos/dedup-products-by-sku.sql` (+ report). Migration `20261002200000_products_sku_normalized_unique` (guarded expression index). Local result verified by orchestrator: 497 products, 0 dup groups, 0 orphan prices, index present; `IDS-E04HQHI-D` → single product `69ba44ee` (curated name, category "DVRs Turbo", 1 image, 7 spec groups). FK tables: prices (conflict → keep survivor; 1267 loser rows deleted, 104 had different values, survivor's newer list price kept), quote_items, product_images, stocks, audit_logs, catalog spec groups/resources. Category/brand: curated copy's values carried (list import had mis-categorized Turbo products as "Cámaras IP" 149, "Sin categoría" 27, "Smart Home" 4). Tests: 462 pass in products/scripts/commercial; full suite 984/985 (pre-existing date-dependent failure in `account-lockout.service.spec.ts`). Not converted: `getCurrentPriceBySku(s)` wizard preview (already case-insensitive, not whitespace-insensitive).
- [x] D02 (inline): DONE in production 2026-10-02. Sequence as it happened: step 1 had already run once (re-run failed with "relation products already exists"; backup valid: 678/3602/22); user ran step 2 AND the RESTORE file in one go, which reverted to the exact original (verified 0 row diffs vs backup, no cascade outside the 9 tables); then step 2 alone. Lesson: never hand over the RESTORE script together with the forward steps. Final production state verified read-only: 497 products, 2335 prices, 22 images, 0 dup groups, 0 orphan prices/images, `products_sku_normalized_key` present, 35 migrations. Merged DVR `655337aa`: single search result, curated name, "DVRs Turbo", 7 spec groups, 2 docs, 3 firmware, 7 highlights, 2 images; deep link 200 (frontend v2 with `.htaccess` live). Backup schema `backup_20261002` kept in Supabase for now.
  - Original package notes: Production package `docs/procedimientos/dedup-production-step1-backup.sql` (in-DB backup to schema `backup_20261002`), `dedup-production-step2-merge-and-index.sql` (merge + index + `_prisma_migrations` row, checksum `7818cb54…`), `dedup-production-RESTORE.sql`. Production read-only report: 678 products, 181 pairs, 0 skipped, 1267 conflicting loser prices, 0 loser images, 0 quote_items, 0 stocks. Full simulation on a scratch DB from the pre-dedup dump: step1 → step2 (678→497, prices 3602→2335, dups 0, index + migration row) → re-run no-op → RESTORE back to 678/3602/181 with 0 row differences. Waiting for the user to run step 1, then step 2. Side effect: store links using a deleted (loser) product id will 404.
- [ ] D03 (delegated together with D04 — writer trigger: 2+ non-trivial files, same admin area): Admin card shows the real primary image.
  - User decision 2026-10-02: finish D03 + D04, review locally, then build one backend + frontend package for Hostinger (includes D01 import-identity code).
  - [x] D03 DONE (code): root causes in `products.service.ts` — fuzzy-search branch of `findAll`/`findTrending` mapped images by a non-existent `productId` (and category/brand by product id), and list queries only included `isPrimary` images. Helper `helpers/primary-image.ts` (primary, else lowest sortOrder) applied in products and Lista lists. "SIN DATOS" = stock badge (no `stocks` row), unrelated; left as is. Not changed: same primary-only rule in `public-catalog.service.ts:112` and `customer-portal.service.ts:92`.
- [x] D04 (delegated, after D01–D02) DONE (code, pending user visual review): `GET/PUT /api/products/:id/sheet` (`modules/products/sheet/`), roles Super Admin/Admin Comercial + Lista ACL (`edit_products` for PUT), 409 on pending-deletion Lista or slug conflict, single transaction, audit `update_sheet`. UI: "Ficha" tab in `/commercial/lists/:listaId/products/:productId` (Identidad, Destacados, Características, Modelos, Especificaciones, Documentos y firmware, Notas; "Ver ficha pública"). Not implemented: image upload for the sheet (URL/alt only; photos via Imágenes tab), `catalogBreadcrumb` editing, in-app route-change guard. Public detail keeps `Cache-Control max-age=300` (editor warns). Orchestrator verification: backend products+listas+filters 528/528; frontend `tsc -b` clean, vitest 27 files / 294 tests; routes mapped; `GET …/sheet` without auth → 401; public DVR sheet unchanged (7/2/3, 1 image). Not verified: visual UI in a browser.
- [ ] D05 (inline): End-to-end verification locally and in production.
- User feedback 2026-10-02 after local review of D04 ("la ficha funciona"): consolidate editing, readable audit, public page polish. Delegated to one writer (writer trigger: 2+ non-trivial frontend/backend files).
- [x] D06 DONE (code, pending user visual review): admin product page has tabs Ficha (default) / Precios / Stock / Publicación / Auditoría. "Información", "Atributos" and "Imágenes" are gone; their editing moved into "Ficha" as blocks, extracted out of `pages/ProductDetailPage.tsx` (2368 → 1617 lines) into `features/products/sheet/`: `ProductFichaTab` (composition, one anchor nav, combined unsaved-changes warning), `ProductGeneralInfoSection` (SKU/name/description/category/brand, read-only in the global catalog view), `ProductDocumentsSection` (+ add-document modal), `ProductPhotosSection` (upload, primary, type, alt, delete), `ProductAttributesSection` (technicalSpecs/extraAttributes), `FichaSection` (shared card). The existing sheet editor sits between photos and attributes (`hideNav` so there is one nav). Save buttons are explicit: "Guardar información general", "Guardar ficha pública" (all sheet sections), "Guardar atributos"; photos and attached documents save instantly (stated in the UI). Permissions unchanged: outside a Lista only read-only general info + Auditoría; sheet editor only for `products:write`; Precios only for `products:write`. Duplicates resolved by labels, not merged: product name (Lista/quotes) vs sheet name ("Identidad"); `technicalSpecs` is the public fallback when the sheet has no spec groups; attached documents are the datasheet fallback (hints say so). Behavior notes: Guardar buttons of info/attributes are disabled until something changes. Tests: `ProductFichaTab.spec.tsx` (5), existing sheet editor spec still passes.
- [x] D07 DONE (code, pending user visual review): backend `AuditService.findByEntity` now selects only `user.name`, returns `actorName` (null for system entries/deleted users) and drops the `user` object (no id/email), spec +2 tests. Frontend: pure module `features/products/audit/audit-format.ts` (+ `audit-format.spec.ts`, 30 tests) and `ProductAuditTab` replace the raw table: each entry reads "<name> actualizó la ficha del producto · 2 oct 2026, 3:15 p. m." with a list of changed fields only (Spanish labels, Sí/No, dates, COP money, arrays as "N elementos", enum values translated, ids/UUIDs/`*Id`/timestamps hidden, same-size list edits flagged "(con cambios)"); `userId` null → "Sistema", userId without name → "Usuario eliminado"; unknown actions → "registró un cambio en el producto". Not changed: the audit endpoint still returns `ipAddress`/`userAgent` (unused by the UI); only Product-entity entries are shown (image/price entries are stored under other entity ids).
- [x] D08 DONE (code, pending user visual review): breadcrumb ends at the category (link; product name and `aria-current="page"` removed). Desktop (lg+): left column = gallery + feature chips + trust strip (3 columns from sm), right column = title, price, highlights, CTAs, datasheet, models; one DOM copy via grid placement, mobile order gallery → title/purchase → chips/trust. Scroll root causes found and fixed: (1) specs section on desktop was a 680px inner scroll panel with `overscroll-contain` that captured the mouse wheel and never chained to the page (the "se traba") → now sticky side menu + groups flow with the page, scroll spy on window, smooth scroll only when reduced motion is off; (2) sticky subnav used `backdrop-blur` over moving content (repaint every frame) → solid white; (3) `useScrollSpy` looked up elements and wrote state on every frame → elements cached once, state written only when the active section changes; (4) images: thumbnails got width/height + `decoding="async"` (main image keeps its fixed aspect box, no layout shift). Not changed: mobile specs carousel (`transition-[height]`), the header is not sticky. Tests: `product-detail.spec.tsx` updated (breadcrumb ends at category, chips/trust once and in DOM order), products suites 77/77.

## Also in the next Hostinger package (small, inline)
- User creation "did nothing" in production: `UserModal` (`src/frontend/src/pages/UsersPage.tsx`) had no error handling, allowed 8-char passwords, while the API enforces `PasswordPolicyService` (min 12 chars, zxcvbn score ≥3; ≥4 for privileged roles) and returns 400. Production evidence: 6 roles OK, no creation attempt reached the DB. Fix: modal shows the API message + policy hints, `minLength` 12 with a hint; global `HttpExceptionFilter` now forwards string-list `feedback` (it used to drop it); helper `getApiErrorFeedback`. Tests: `http-exception.filter.spec.ts`, `apiError.spec.ts`; backend filter+policy 18/18, frontend 2/2, `tsc -b` clean, eslint clean. Not live-tested (needs an authenticated admin session).
- Noted, not changed: the filter returns raw `exception.message` for unhandled 500 errors (may expose internals such as Prisma messages to clients).

## Hostinger packages — 2026-10-03 (include D01, D03, D04, D06–D08 and the users fix)
- `backend-hostinger-20261003.zip` sha256 `335f4e6fcca7f17f5f1fdc6231d2c4e1bf5f08b7bfabf791cc0032762672f50a`: same layout as the 20261002 package (no specs, no `.env*`, no `node_modules`/`dist`). Clean `npm ci && prisma generate && npm run build` in `node:20-alpine` → `dist/src/main.js`. Credential scan clean (only hit: the `IMPORTAR-BIBLIOTECA-2026` confirmation phrase in `prisma/import-biblioteca.ts`, not a secret). No new migrations versus production (35 with SQL locally = 35 in Supabase).
- `frontend-hostinger-20261003.zip` sha256 `eae41ac810bb7bea5cb63e283f1d2aff31cb3f69c5d4188192ce775fe1d96c98`: clean `vite build --mode production`, bundle `index-B8MR1C-X.js`, API base `https://api-dev.gruposecurity.com.co/api`, no localhost/Tailscale hosts, includes `.htaccess`.
- Deploy order: backend first, then frontend (the new audit endpoint adds `actorName`; the old frontend ignores it). Hard-refresh after upload (old tabs keep the old bundle).

## Recovery mirror
Engram mirror `odd/product-identity-dedup/tasks`: PENDING (mem_save fails: multiple active runtime sessions match this project). This file is the source of truth.

## Delivery note
Branch `feat/storefront-public-pricing` still holds a large uncommitted change set; work-unit
commits remain pending the user's decision on committing that prerequisite work.
