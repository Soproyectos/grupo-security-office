# Feature: Product Detail View (Hikvision-style)

## Objective
Implement the Hikvision-style product detail view from the zip file (`ficha-producto-grupo-security.zip`) and integrate it with the existing Grupo Security platform. This is a public-facing catalog product page with:
- Hero section with breadcrumb, image, title, highlights, features
- Fixed subnav (Especificaciones / Recursos)
- Specifications with sidebar navigation (desktop) / carousel (mobile)
- Resources with documents and firmware (license agreement modal)
- JSON-LD schema.org/Product for SEO

## Problem
The current storefront product page (`/catalogo/productos/:id`) has a simpler design. The new design provides a richer product experience matching Hikvision's product sheets, with structured specifications, downloadable resources with license agreement, and proper SEO markup.

## Scope
### Backend
- Extend Prisma schema with new models for ProductSpecGroup, ProductDocument, ProductFirmware
- Create new NestJS module `ProductsPublicDetailModule` with controller/service
- Add endpoint `GET /api/public/products/:slug/detail` returning the extended ProductDetail contract
- Seed script for example product

### Frontend
- Create new feature `src/features/products` with all components from zip
- Add new route `/productos/:slug` (public, no auth) using the new ProductDetailRoute
- Integrate with existing TanStack Query and API client
- Adapt to existing Tailwind config and design tokens

## Constraints
- No new dependencies (zip uses only React, Tailwind, TanStack Query)
- Reuse existing `api` client, `VITE_API_URL` env
- Colors: `red-600` and `neutral-950` (brand colors in styles.ts)
- Sticky subnav requires no `overflow: hidden` on parent containers
- License modal text is example - legal review needed before production
- Image hosting: save to `public/images/productos/{slug}.webp`

## Acceptance Criteria
1. Backend: `GET /api/public/products/ids-e04hqhi-d/detail` returns full ProductDetail with specGroups, documents, firmware
2. Frontend: `/productos/ids-e04hqhi-d` renders the full Hikvision-style page
3. Specs sidebar highlights active section on scroll (desktop)
4. Resources section shows documents and firmware with license modal
5. JSON-LD schema.org/Product rendered in page head
6. Download analytics event fired to dataLayer
7. Mobile: specs as carousel, subnav sticky
8. ~~Existing storefront page at `/catalogo/productos/:id` unchanged~~ — superseded 2026-10-02, see "Scope change: unification"

## Scope change: unification (2026-10-02, user-authorized)
The Hikvision-style sheet must serve EVERY product, not only the seeded example.
Before this change two detail pages coexisted: `/catalogo/productos/:id`
(`StorefrontProductPage`, all 678 products, public price, linked from store
cards) and `/productos/:slug` (new sheet, only `catalogPublished` products,
linked from nowhere).

Decisions:
- One product page with the new design. The backend builds the sheet for any
  public product from its base data (name, image, brand, category, public price)
  and adds enriched catalog data (spec groups, documents, firmware) only when it
  exists. The frontend hides sections without data.
- Store cards keep linking to `/catalogo/productos/:id`, which now renders the new
  sheet. `/productos/:slug` keeps working for enriched products.
- `StorefrontProductPage` is retired; its price, gallery and contact CTA carry over.
- Products without enriched data look sparser until content is loaded (content
  work: `tools/enrich_hikvision_catalog.py`, `catalog-librarian`).

New acceptance criteria:
9. `GET /api/public/products/:idOrSlug/detail` returns a sheet for any public product (id or published slug), including its public price; unknown → 404.
10. `/catalogo/productos/:id` renders the new sheet for a product with no enriched data, without empty sections.
11. Price, image gallery and contact CTA from the old page remain available.

TDD mode: off (source: no project/session TDD configuration found; tests exist but do not enable TDD). Ordinary checks apply.

## Tasks
- [x] **T01**: Add Prisma models for ProductSpecGroup, ProductDocument, ProductFirmware, ProductFirmwareFile
- [x] **T02**: Create Prisma migration and run it — original claim "db push synced" was false: no migration existed and the API failed with P2022. Fixed 2026-10-02 with migration `20261002151311_add_product_catalog_detail` (generated via `prisma migrate diff`, applied via `migrate deploy`).
- [x] **T03**: Create backend NestJS module (controller, service, mapper, DTO)
- [x] **T04**: Add seed script and example product data
- [x] **T05**: Register module in ProductsModule
- [x] **T06**: Copy frontend feature to `src/frontend/src/features/products`
- [x] **T07**: Add route `/productos/:slug` in App.tsx (public, no auth)
- [x] **T08**: Verify Tailwind content paths include new feature
- [x] **T09**: Test end-to-end with seeded product — 2026-10-02: seed linked to the existing product `iDS-E04HQHI-D` (catalogSlug set first to avoid a duplicate SKU); `/api/public/products/ids-e04hqhi-d/detail` → 200, `/productos/ids-e04hqhi-d` → 200.
- [ ] **T10**: Document any legal/content adjustments needed
- [x] **T11** (delegated — writer trigger: 2+ non-trivial files): Backend — `GET /api/public/products/:idOrSlug/detail` (UUID or slug; else 400). All visibility/price/images/category/specs come from `PublicCatalogService.getDetail`, so the sheet exposes exactly what `/api/public/products/:id` exposes; enriched fields overlay. Slug path now also requires `lifecycleStatus = PUBLISHED`. Base `technicalSpecs`/`datasheets` become a spec group / datasheet documents only when no enriched ones exist. DTO adds `id`, `price`, `description`, `images[]`. New `product.mapper.spec.ts`. Removed dead `public-product-detail.module.ts` (controller is registered in `ProductsModule`).
- [x] **T12** (delegated, same writer): Frontend — `/catalogo/productos/:id` and `/productos/:slug` both render `ProductDetailRoute` inside `StorefrontChrome`. Empty sections and their subnav links hidden; JSON-LD omits empty fields. Carried over: COP price + "IVA incluido"/"Precio a consultar", gallery with thumbnails, WhatsApp quote + call CTAs, mobile bottom bar, trust strip, description, breadcrumb, title, skeleton/404/error+retry. Dropped: "Solicitar cotización" → `/contacto` (route never existed). `fetchProduct` now uses the shared `api` client (raw fetch previously misread the `{data}` envelope). Deleted `StorefrontProductPage`, its spec, `usePublicProductDetail`, `ProductGallery`, `fetchPublicProductDetail` and its types. New `product-detail.spec.tsx`.
- [x] **T13** (inline): Verified 2026-10-02 — vitest products+storefront+services 22 files / 241 tests passed; live via proxy: enriched slug 200, bare product id 200 with price, unknown UUID 404; pages `/catalogo/productos/:id` and `/productos/ids-e04hqhi-d` 200. Not verified: visual rendering in a browser (to be checked by the user). Writer-reported: backend jest 19 suites / 361 tests passed with inline config (container lacks mounted `jest.config.ts` — env issue); pre-existing tsc errors in `import-biblioteca.logic.spec.ts` and `LicenseModal.tsx:53,56`.

## Supabase (production DB) — 2026-10-02
- Migrations `20260930183000_add_notion_token` and `20261002151311_add_product_catalog_detail` applied by the user in the Supabase SQL Editor (Claude Code's permission system blocked applying it from the session), using `docs/procedimientos/apply-20261002-catalog-notion-migrations.sql`, with Prisma checksums registered in `_prisma_migrations`. Rollback: `docs/procedimientos/rollback-20261002-catalog-notion-migrations.sql`.
- Verified read-only: 34 migrations, 678 products intact, 0 published, RLS enabled on the 4 new tables (via Supabase `ensure_rls` event trigger), 0 policies. Full schema fingerprint identical to local (`47df44a4955b6ea01a05ec6e1c4f7213`, 493 objects).
- No pg_dump backup was taken (DB password unavailable); risk accepted because the change is additive and atomic.
- Deploy caveat: new backend code requires `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI` (`getOrThrow`); without them the whole API fails at boot.

## Hostinger deploy packages — 2026-10-02
Built from the working tree (HEAD `a7c9797` + uncommitted changes; NOT a commit — commit pending).
- `backend-hostinger-20261002.zip` sha256 `7aa3597455bd87f95e8ef8bbfec0c58dbafee60d78473ca61f653b8ec8cb8b9d`: package.json/lock, tsconfigs, nest-cli, README, `src/`, `prisma/` (schema, migrations, seeds/scripts), `scripts/`; excludes specs, `.env*`, backups, `node_modules`, `dist`, `add_notion_token_manual.sql`. Credential scan clean. Verified with a clean `npm ci && npm run build` in `node:20-alpine` → `dist/src/main.js`.
- `frontend-hostinger-20261002.zip` sha256 `756694aada49d945b5d291f9c8dc20e472ccd1e783e0d909c385adf0d9ea78fa`: `vite build --mode production`; bundle API base `https://api-dev.gruposecurity.com.co/api`.
- Pre-deploy fixes: Notion integration made optional at boot (`NotionAuthService` no longer `getOrThrow`; OAuth calls return 503 when unconfigured; new `notion-auth.service.spec.ts`, auth tests 45/45); `LicenseModal.tsx` TS errors fixed (frontend `tsc -b` clean, products tests 18/18); dummy `NOTION_*` removed from `docker-compose.yml`.
- Hostinger backend env still required for Supabase TLS: `DATABASE_DRIVER=pg`, `DATABASE_URL` (Session pooler, 5432), `DATABASE_SSL_CA_BASE64` — see `docs/procedimientos/supabase-hostinger-tls.md`.

- Incident 2026-10-02: the first frontend package lacked the SPA `.htaccess` (the previous package had it, added by hand, not in source). After upload, deep links and reloads (`/tienda`, `/catalogo/productos/:id`) returned Hostinger's 404, and an already-open tab kept running the old bundle (user saw the retired page). Fix: `.htaccess` now lives in `src/frontend/public/` so every build ships it; `frontend-hostinger-20261002-v2.zip` sha256 `3740daf98a87ee8c7fc65d765d480ff7858932eb355cdd613c110a8cc8fd5059` (same JS bundle `index-D-ypKK-T.js`).
- Example product loaded into Supabase with `docs/procedimientos/load-example-product-ids-e04hqhi-d.sql` (user-run): `8f56c0a9` now serves 7 spec groups, 2 docs, 3 firmware files in production. Data issue: production has a duplicate of the same model, `655337aa…` (SKU `IDS-E04HQHI-D`, has the user's uploaded photos), while the enrichment sits on `8f56c0a9…` (no photo). IDs differ from local for some products (prod data diverged after the local restore).

## Follow-ups (not in scope)
- Seeded `catalogBreadcrumb` holds dead `/productos/...` hrefs (data fix).
- `ProductMedia` `size="detail"` variant possibly unused.
- `jest.config.ts` not mounted in `gs-api`; in-container `npx jest` fails to load suites.

## Delivery note
Work-unit commits are pending: branch `feat/storefront-public-pricing` holds a large
uncommitted OpenCode change set (schema, migrations, modules) that this work
depends on, so a commit of only these tasks would not build. The user decides how
to commit the prerequisite work first.

## Authorized Scope
- New Prisma models and migration
- New backend module under `src/backend/src/modules/products/public-detail/`
- New frontend feature under `src/frontend/src/features/products/`
- New public route `/productos/:slug`
- Seed data for demonstration

## Applicable Checks
- `lint` (eslint)
- `typecheck` (tsc --noEmit)
- `test` (vitest/jest)
- `build` (vite build for frontend, nest build for backend)