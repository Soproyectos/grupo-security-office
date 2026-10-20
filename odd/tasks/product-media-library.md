# Product media library (official photos per product)

## Objective
Every published product shows at least 3 official photos on the storefront, and the photos survive container rebuilds.

## Problem
- 477/497 published products have no photo, so the storefront falls back to the spec label.
- The 20 existing `product_images` rows hotlink third-party retailers (`pbtech.co.nz`, `pcx.com.ph`): not official, fragile, unclear rights.
- The backend serves `/uploads` from `/app/uploads` inside `gs-api`, but that path is not mounted. Anything uploaded from the staff panel is lost when the container is recreated.
- `tools/enrich_hikvision_catalog.py` found 3 images on a matched product page but downloaded only 1 (trial run 2026-09-29).

## Decisions (user, 2026-09-29)
- Photos are registered in the database (`product_images` rows). For now the files live on the project server; binaries are NOT stored inside Postgres.
- Target: at least 3 images per device.
- Source policy: official manufacturer or supplier images only. For Hikvision, use the official site via `tools/enrich_hikvision_catalog.py` (the user authorized querying hikvision.com). Other brands (Accessmatic, Powest, Fuli, Western Digital, …) need the supplier's official media kit; the user will request it.

## Scope and constraints
- Authorized scope: persistent uploads mount (compose), a repeatable media importer (backend script + tests), a fix to the enrichment script's image download count, and loading the Hikvision results into the server DB, with a DB backup before any write.
- Branch: `feat/storefront-public-pricing` (continues the storefront work; same delivery chain).
- Never delete existing `product_images` rows without explicit user approval. The third-party hotlinks stay until the user decides.
- Conventional commits, no AI attribution trailer. No push/PR without explicit authorization.
- ~400 authored lines per task is advisory only.

## TDD and checks
- TDD: OFF (source: `odd/tasks/storefront-public-pricing.md`, project ODD convention).
- Backend: `cd src/backend && npm test`, `npm run lint`, `npm run build` (host). Known failure: `account-lockout.service.spec.ts › getStatus › reinicia el contador tras un acceso correcto`.
- Enrichment tool: run with the scratchpad venv (`requests beautifulsoup4 pandas openpyxl playwright`, Chromium headless shell v1243).

## Tasks
- [ ] IMG-01 — Persistent uploads: bind-mount a host directory into `gs-api` at `/app/uploads` in `docker-compose.yml` (and the prod compose equivalent), keep it out of git, and verify `/uploads/...` is served through Vite. Route: delegated direct.
- [ ] IMG-02 — Fix `tools/enrich_hikvision_catalog.py` so it downloads up to `--max-images` distinct official images per matched SKU (the trial found 3 and saved 1). Route: delegated direct.
- [ ] IMG-03 — Media importer `src/backend/scripts/import-product-media.ts` (+ npm script + tests). It reads the enrichment output, matches products by normalized SKU, copies images to `uploads/products/<productId>/`, and creates `product_images` rows (first = primary, ordered, alt = product name). Datasheet PDFs go to `Product.documents`. It is idempotent, has `--dry-run`, and never deletes. Route: delegated direct.
- [ ] DATA-02 — Rerun Hikvision enrichment with the fixed tool, back up gs-db, run the importer on the server, and verify counts (products with ≥3 / 1–2 / 0 images) plus the storefront in the browser. Route: parent.

## Acceptance criteria
- Recreating `gs-api` keeps uploaded files.
- Each matched Hikvision product has up to 3+ official images and they render in cards, detail gallery and shelves.
- Importer is idempotent (second run creates 0 rows) and reports per-product counts.

## Progress
- 2026-09-29: first Hikvision batch (211 SKUs, pre-fix tool) → `scratchpad/hik/full`: 16 matched, 195 not_found, 16 images (1 per SKU).
  - Every match came from only two series pages (Turbo-HD Value and ColorVu), so discovery is the bottleneck. IMG-02 scope was widened to navigate all product families and series on /es-co/ with a fallback to /en/.
  - The sitemap route was rejected: Hikvision serves `sitemap.xml` behind an anti-bot JavaScript challenge, and working around it would mean evading bot detection. `robots.txt` allows crawling with `Crawl-delay: 1`, so the tool must keep ≥1.5 s between requests.
  - Writer launched for IMG-01..03.
- Engram mirror: pending (earlier `mem_save` failed with "multiple active runtime sessions").
