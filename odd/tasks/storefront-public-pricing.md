# Storefront public pricing and datasheet

## Objective
Show the public price to anonymous storefront visitors in listings and on a public product detail page, and expose the product's technical datasheet there.

## Problem
The storefront sells to end users and installers (decision 2026-09-29), but every public surface hides prices ("public catalog exposes products without prices"). There is no routed public product detail, and category pages show "Productos próximamente". Meanwhile `GET /api/products/trending` is `@Public` and leaks every price list plus the full product row (`extraAttributes` holds COSTO/PLATINO), and it interpolates `categoryId` into `$queryRawUnsafe`.

## Why
- End users do not buy without a visible price; the Syscom benchmark (`docs/benchmark/syscom-colombia-analisis.md`) confirms hidden prices only fit a closed B2B wholesaler.
- The trending leak exposes internal price lists and cost to anyone, and allows SQL injection.

## Decisions (user, 2026-09-29)
- Public price = active `PriceList` with code `CLIENTE_FINAL_IVA` (IVA included), overridable via `PUBLIC_PRICE_LIST_CODE`.
- Anonymous visitors see only that public price: no other price lists, no `extraAttributes`, no cost.
- A product without a valid public price is still shown, with a "Solicitar cotización" WhatsApp CTA instead of a price.
- The datasheet is shown from `Product.documents` (URL entries); PDF upload is out of scope.
- Installer-specific pricing after sign-up is NOT decided yet; out of scope.

## Scope and constraints
- Authorized scope: backend public catalog endpoints, the trending endpoint, storefront listing/search/category/detail UI, and the docs that state the old no-price rule.
- Do not register the whole `CustomerPortalModule`; serve public data from the existing public products controller.
- Do not touch the uncommitted `StorefrontHome.tsx` hero WIP or `.env.example`; stage only task files.
- Branch `feat/storefront-public-pricing`, created from `agentation-clipboard` at `c6049f8` (that commit is not on `main` yet).
- Commits: Conventional Commits, no AI attribution trailer (project CLAUDE.md). Push/PR only with explicit user authorization.
- ~400 authored lines per task is an advisory heuristic only.

## TDD and checks
- TDD: OFF (source: project ODD docs `storefront-homecenter-parity.md:26`, `public-storefront.md:26`).
- Backend: `cd src/backend && npm test`, `npm run lint`, `npm run build`.
- Frontend: run inside the `gs-frontend` container (host has no `node_modules/.bin`): `docker exec gs-frontend npm test`, `npm run lint`, `npm run build`.
- RDD: on (global). After each work-unit commit run `gentle-ai review assess --cwd <repo> --agent claude-code --base-ref <last reviewed boundary> --committed-only --json`. First boundary: `c6049f8`.

## Delivery
- Forecast: ~1,000 authored changed lines across 6 tasks (above the ~400 budget).
- Strategy: `ask-on-risk`. Chain strategy: `stacked-to-main`, approved by the user together with the plan on 2026-09-29.
- Planned slices: PR1 = SPP-01; PR2 = SPP-02 + SPP-03; PR3 = SPP-04 + SPP-05 + SPP-06. Push and PR creation still need explicit user authorization.
- Base caveat: the branch contains `c6049f8` (agentation-clipboard), which is not on `main`. Before PR1, either merge agentation-clipboard first or rebase onto `main`.

## Tasks
- [x] SPP-01 — Close the trending leak: `GET /api/products/trending` requires staff auth; parameterize `categoryId`; tests. Route: delegated direct (2+ non-trivial files). Commit `cc930a7` (4 files, +72/-8).
  - Evidence: the controller and service specs pass (109 tests, rerun by the parent). With the fix stashed, the 3 new tests fail.
  - Full backend suite: 855/856. The single failure is the pre-existing time-bomb test `account-lockout.service.spec.ts › getStatus › reinicia el contador tras un acceso correcto`, which fails identically on the base. Lint and build: exit 0.
  - The staff Dashboard still works: it calls trending through the axios client using the `access_token` cookie.
  - RDD assess: medium, `review_due=false`, `under_budget` (80 lines). Stays pending in the slice; the boundary remains `c6049f8`.
- [x] SPP-02 — Public price on `GET /api/public/products`: attach `price: { value, currency } | null` from the public price list within its validity window; tests. Route: delegated direct. Commit `6e70dbb`.
  - Adds `PublicPricingService`: one batched query filtered by code, `isActive` and both validity windows. The code comes from `ConfigService` (`PUBLIC_PRICE_LIST_CODE`, default `CLIENTE_FINAL_IVA`).
  - Adds `PublicCatalogService` with an explicit `select`, returning `sku`, `brandName` and `price`.
  - Tests: 307/307 products tests after the commit. A mutation check (dropping the code filter) makes 5 tests fail.
- [x] SPP-03 — Public category listing and product detail endpoints (`GET /api/public/products?category=&offset=&limit=`, `GET /api/public/products/:id` with specs, datasheet documents and public price; published only); tests. Route: delegated direct. Commit `65c5944`.
  - Listing covers the category and its descendants, with limit 1..48 and `meta {total, offset, limit}`. An unknown slug returns 200 with an empty list.
  - Detail returns 400 for a malformed UUID and 404 unless PUBLISHED. It includes the breadcrumb (ancestors), images, sanitized specs, sanitized datasheets and the price.
  - Tests: 352/352 products tests (parent rerun). Full suite 916/917; the one failure is the known lockout test. Lint and build: exit 0.
  - Live checks: prices are present (e.g. 118,258.8 COP), the descendants listing works, the leak grep finds 0 matches (parent rerun on a 48-item category page), 404 and 400 behave as specified, and anonymous trending still returns 401.
  - Blocked: the writer could not edit `src/backend/.env.example` (harness denied access), so `PUBLIC_PRICE_LIST_CODE` is not documented there yet. Surfaced to the user; the parent must not work around the denial.
- RDD after SPP-03: medium, `review_due=true` (`slice_budget_reached`, 1,679 lines from `c6049f8`). Preflight done, and START returned consent `review-8a498b87cf67f065`, now relayed to the user.
- [x] SPP-04 — Storefront listings: price on search result cards; category page product grid replacing "Productos próximamente"; quote CTA when no price; tests. Route: delegated direct. Commit `43d7e20` (14 files, +777/-209).
  - Adds `PublicProductCard` (+spec), `PublicProductGrid` (grid, skeleton, pager, error), `formatCop` (+spec), `usePublicProductListing` (offset/limit 24, "Cargar más"), `fetchPublicProducts` replacing `searchPublicProducts`/`usePublicProductSearch`. Search and category pages use them; category shows the count and the empty state only when total is 0.
  - Checks: vitest storefront+services 158/159 (only failure is `storefront-home.spec.tsx` slider, uncommitted hero WIP, not touched); `tsc -b` exit 0; lint 2 errors / 9 warnings = baseline.
  - Cards linked to the category page in this commit; SPP-05 switched them to the detail route.
- [x] SPP-05 — Public product detail page at `/catalogo/productos/:id`: gallery, price (IVA incluido), specs, datasheet link, WhatsApp quote CTA; cards link to it; tests. Route: delegated direct. Commit `cb2a4ad` (11 files, +694/-7).
  - Adds `StorefrontProductPage`, `ProductGallery`, `usePublicProductDetail`, `fetchPublicProductDetail` (404/400 resolve null), `constants/contact.ts` (demo WhatsApp/phone), `productHref`, route in `App.tsx`; cards link to the sheet.
  - Checks: vitest storefront+services 179/180 (same WIP slider failure); `tsc -b` exit 0; lint baseline (2 errors / 9 warnings). Live smoke: `/catalogo/productos/<id>` returns the SPA shell 200; API detail returns the product.
- [ ] SPP-06 — Docs: replace the no-price rule in `odd/tasks/public-storefront.md` and `storefront-homecenter-parity.md`, record the resolved decision in ADR-002. Route: inline (mechanical docs).
- [x] SPP-07 — Home with real data and card redesign (Design plan v2). Route: delegated direct (single writer). Commit `c7e6612` (34 files, +1400/-502).
  - Adds `extractSpecHighlights` + `ProductSpecLabel`/`ProductGlyph` (spec label when no photo, 4:3 media), condensed ink prices (`text-storefront-ink` token `#1A1A1A`), hover = border color only, focus rings.
  - Home: `HomeHero` (no overlay, sr-only h1, pause on hover/focus, no auto-rotate with reduced motion), "Compra por categoría" (menu roots + `limit=1` counts, cap 8, count desc, session cache, 6 concurrent requests), 3 shelves (`HOME_SHELVES` in `constants/home-catalog.ts`), `BrandsStrip`, solutions pointing at real categories/search. Deleted `fixtures/home-sections.ts`.
  - CategoryPage: removed the empty-subcategories line. Detail: `toSentenceCase` on ALL-CAPS descriptions (brand kept).
  - Checks: vitest storefront+services 235/235; `tsc -b` exit 0; lint 2 errors / 9 warnings = baseline.
- [x] SPP-08 — Page titles and dead links. Route: delegated direct (single writer). Commit `5d18cce` (18 files, +392/-169).
  - `useDocumentTitle` + `utils/documentTitle` (home, catálogo, categoría, búsqueda, producto).
  - Footer/account menu/sales channels are data-driven (entries without `href` are hidden); "Proyectos", "Ventas al por mayor" and "Vende con nosotros" open WhatsApp with a prefilled message; social icons hidden except WhatsApp; "Crear cuenta" and "Rastrea tu pedido" hidden (`AccessRequestPage`/`ClientLoginPage` are not routed). Demo contact data centralized in `constants/contact.ts` with a TODO.
  - Checks: vitest storefront+services 244/244; `tsc -b` exit 0; lint 2 errors / 9 warnings = baseline.
  - Note: COP whole-peso rounding was already done in SPP-04 (`formatCop`).
- [x] SPP-09 — Fix the rate-limit blowout found in the parent's live check (2026-09-29). The home fans out ~35 `GET /api/public/products?category=…&limit=1` count requests plus 3 shelves. With the public throttle at 60/min per IP (and StrictMode doubling in dev), a second load returns 429 and every shelf shows the error state. Behind a shared proxy IP this would block all visitors. Fix: expose a published-product count per category (descendants included) in `GET /api/public/categories/menu`, computed with one grouped query; the home reads counts from the menu and drops the fan-out. Also re-verify in the browser that the `storefront-ink` Tailwind token renders (the running Vite had not reloaded `tailwind.config.js`, so names and prices showed in the inherited link red). Route: delegated direct (backend + frontend, 2+ non-trivial files). Commit `a3fa3f5`: `productCount` (PUBLISHED, descendants rolled up from one grouped query) on every `GET /api/public/categories/menu` node; home reads it, `useCategoryProductCounts` deleted (home = 1 menu + 3 shelf requests). Evidence: backend categories tests 29 pass; full `npm test` 918 pass / 1 known failure (account-lockout); lint and build OK; frontend vitest 244 pass, `tsc -b` OK, lint 2 errors / 9 warnings (baseline); live menu shows camaras-turbo 164; production build contains `.text-storefront-ink{color:rgb(26 26 26 / …)}` from `storefront.ink` in tailwind.config.js.
- RDD after SPP-09 (2026-09-29, parent):
  - Assess `c6049f8..a3fa3f5`: medium, `review_due=true`, `slice_budget_reached`.
  - The user authorized running gentle-ai and chose "Revisar este cambio" on the consent/v3 envelope (lineage `review-a1d434a6e2031256`).
  - START granted → stop `lens_context_budget_exceeded` (82 files, 5,969 lines). No authority was created and nothing needs abandoning.
  - Per the stop table: reduce scope and start new transactions, or `D`. Review only supports base..HEAD, so slices need temporary worktrees at intermediate commits.
  - User decision (2026-09-29): review in slices. Each slice ran in a temporary detached worktree, following only provider-returned transitions. All five were approved and acknowledged (`authority: burned`), and the worktrees were removed afterwards:
    - s1 `c6049f8..65c5944` (1,679 lines): `review-772d2bfd85f452d3`
    - s2 `65c5944..cb2a4ad` (1,681): `review-8f80929942e2dd69`
    - s3 `cb2a4ad..3814905` (456): `review-b7be9826dc8712b4`
    - s4 `3814905..c7e6612` (1,902): `review-5b1cdaadc11ed186`
    - s5 `c7e6612..a3fa3f5` (819): `review-674f4107b11c5bbb`
  - The reviewed boundary is now `a3fa3f5`.
  - Non-blocking follow-ups (WARNING):
    - s1:
      - Public price is nondeterministic when two valid rows exist (no `orderBy`).
      - The listing dereferences brand/category without null guards.
      - An inactive ancestor does not hide the subtree.
    - s2:
      - `loadMore` has no stale-request guard.
      - The pagination hook is untested.
    - s3:
      - Off-screen hero links stay focusable with an empty name.
      - The FeaturedSolutions scroll buttons are untested.
    - s4:
      - `toSentenceCase` uppercases the Spanish words "va"/"ir".
      - The `useCategoryProductCounts` findings are moot, because s5 deleted that hook.
    - s5:
      - The `productCount` rollup walks through inactive parents.
- Parent live check after SPP-09:
  - The home issues menu + 3 shelves (7 requests with StrictMode), all 200.
  - The `storefront-ink` rule was missing in dev because the long-running Vite process cached the Tailwind config. `docker restart gs-frontend` fixed it: names and prices are ink, red is only on brand labels and CTAs.
  - The detail page shows sentence-case descriptions and the per-product title.
- Engram mirror: pending. `mem_save` failed earlier with "multiple active runtime sessions match the current project".

## Design direction (user, 2026-09-29: "diseña una buena web según tu criterio UX/UI para un e-commerce como este")
- Source of truth: `Grupo Security Design System.zip` → `design_handoff_catalogo_comercial` (tokens: brand red `#CE0203`/hover `#AD0102`, storefront ink `#1A1A1A`, institutional gray `#484748`, surfaces `#F8FAFC`/`#E2E8F0`, text `#0F172A`/`#475569`/`#94A3B8`; radii 10px controls, 14–16px cards, 999px pills; Roboto).
- Product card (design system): square media tile (gradient placeholder `#F8FAFC→#E2E8F0` + category icon when no image), uppercase brand label 700 red, name 2-line clamp, mono SKU `#94A3B8`, CTA pill. Adapted to the public-price decision: price block "IVA incluido" replaces "Ver precio"; no stock dot (no stock data yet).
- E-commerce UX baseline: price is the strongest element of the card; every card links to the detail page; WhatsApp quote CTA always visible on detail; breadcrumbs; responsive grid 2/3/4 columns; skeleton loading; empty and error states; no dead links.
- No external design skill was installed at first. On 2026-09-29 the user authorized installing `frontend-design` (anthropics) and `ui-ux-pro-max` (nextlevelbuilder) at user level (`~/.claude/skills/`), by manual copy after review. `ui-ux-pro-max` needed its script path patched (`${CLAUDE_PLUGIN_ROOT}` → `$HOME`). Its generic palette (green/orange) is ignored; the brand tokens win.

### Design plan v2 (frontend-design two-pass + ui-ux-pro-max, 2026-09-29)
Live critique before the plan:
- 477/497 products have no photo, so square grey placeholders dominate every grid. Only one row fits above the fold.
- The hero headline overlay collides with the wordmarks baked into the banners. The earlier coordinator decision was "sin overlay de texto".
- Category pages print noise ("Esta categoría todavía no tiene subcategorías").
- Product descriptions arrive in ALL CAPS from the supplier data.
- The home promotes empty categories and demo prices.

Plan:
- **Color** (brand, unchanged):
  - Rojo `#CE0203`: the primary CTA only. Prices are ink, not red.
  - Tinta `#1A1A1A`: text, prices and dark bands.
  - Gris institucional `#484748`.
  - Superficie `#F8FAFC`, línea `#E2E8F0`.
  - WhatsApp `#25D366`: only on WhatsApp actions.
- **Type**:
  - Roboto for body.
  - Roboto Condensed 700 for product names, prices and section titles. Condensed type is the vernacular of spec sheets and hardware labels.
  - Prices use tabular numbers.
- **Signature element ("spec label")**:
  - A product without a photo shows a technical label, not a grey box: category icon, plus the key specs parsed from name and SKU in large condensed type. Examples: `1080P`, `4K`, `8 MP`, `IR 40 m`, `2.8 mm`, `1/2 HP`, `3000 VA`.
  - The missing photo becomes buying information that installers scan for.
  - Media ratio is 4:3, not square, so two rows fit above the fold.
- **Home layout** (ui-ux-pro-max *Marketplace/Directory*: search first, then categories, featured listings, trust, CTA):
  1. Full-width banner slider with no text overlay. The banners carry the message; an sr-only h1 keeps a11y. The carousel pauses on hover, focus and reduced motion.
  2. "Compra por categoría": tiles for categories that really have products, each with its live count from `meta.total` (Cámaras Turbo, DVR, Motores para puertas, UPS, Baterías, Almacenamiento).
  3. Two or three real vitrinas from the public API with real prices: videovigilancia, automatización de puertas, energía y respaldo. Each has "Ver todo".
  4. Real brands strip (Hikvision, Accessmatic, Powest, Fuli, Western Digital, Imou, Kingston), linking to search.
  5. Featured solutions (committed) linked to real categories. Sales channels. Trust.
  - Fixture offers and new arrivals with fake prices are removed.
- **Alignment**: left-aligned content in a 1280px max container. Only the hero is full-bleed.
- **Restraint**:
  - The one bold thing is the spec-label and condensed-price pairing.
  - No entrance animations. Hover is a border-color change only; no lift on every card.
  - Focus rings visible, 44px touch targets.
- **Review against generic defaults**:
  - Uppercase brand labels and the mono SKU stay because the brand design system requires them (the brief wins).
  - The red price was dropped in favour of an ink price: red is reserved for actions, so the CTA stays the only red element.
  - The square media was dropped for the 4:3 spec label.

- SPP-07 scope (revised, done): the home per the plan above, plus the card spec-label/4:3/condensed price (reopens the SPP-04 card design), removal of the category noise line, and sentence-case rendering of ALL-CAPS descriptions on the detail page.

## Acceptance criteria
- Anonymous `GET /api/products/trending` returns 401; staff Dashboard still loads it.
- Anonymous public endpoints return only the `CLIENTE_FINAL_IVA` price (or `null`), never other lists, `extraAttributes` or cost.
- Search, category and detail pages show the price formatted in COP with "IVA incluido", or the quote CTA when missing.
- The detail page shows specs and a datasheet link when `documents` has one.

## Progress
- 2026-09-29: feature document created; branch `feat/storefront-public-pricing` created at `c6049f8`.
- 2026-09-29: SPP-01 done (`cc930a7`). The user asked for a detailed plan before continuing. The plan has been presented; waiting for approval of SPP-02..06 and of the chain strategy (recommended: `stacked-to-main`).

## Server validation (2026-09-29, srv-soporte, http://100.87.48.41:5173)
This machine is the office server. `gs-frontend` and `gs-api` mount this working tree, so the live site follows the checked-out branch.
- Fixed live: every `/api` call through Vite :5173 returned 500. The running Vite process held a stale `localhost:3000` proxy target. Touching `vite.config.ts` restarted Vite; categories and search now return 200.
- Confirmed live: anonymous `GET /api/products/trending` returns 401 (SPP-01 in watch mode).
- Data: 497 PUBLISHED products, 20 images, **0 price lists / 0 prices**, 0 products with `documents` or `technicalSpecs`. Public prices need the Excel price import first, and datasheets need data.
- Category pages show "Productos próximamente". Search cards link to the category, so browsing dead-ends (covered by SPP-04/05).
- "Mi Cuenta › Ingresar" goes to `/login`, the internal staff login ("panel empresarial", "Correo corporativo").
- "Crear cuenta" and every footer link (FAQ, rastrea tu pedido, devoluciones, centro de ayuda, sobre nosotros, términos, política de datos, …) have no route and bounce to `/tienda`.
- Contact data is demo: `(6) 123 4567` and an `.example` email. Public pages carry the title "Grupo Security - Panel de Administración".

## Follow-ups found (out of scope)
- `products.service.ts` `findAll` interpolates `categoryId`, `brandId` and `allowedListaIds` into `$queryRawUnsafe`. It is staff-only, but it is still SQL injection.
- The raw-search branch of `findTrending` maps category, brand, images and prices by the wrong ids, so they always come back empty or null. Staff-only.
- `account-lockout.service.spec.ts` hardcodes `2026-09-21` against a rolling window, so it now fails on every branch.

- 2026-09-29: the user approved the plan (SPP-02..06) and authorized loading prices from the `listas/` Excel files into the server DB. Data step DATA-01 runs before SPP-02, because the API watch-mode restarts would interrupt the import.

## Data steps (no code commits)
- [x] DATA-01 — Back up gs-db, then import prices from `listas/*.xlsx`. Product identity, lifecycle and images must stay unchanged. Verify the counts and the CLIENTE_FINAL_IVA coverage.
  - Backup: `/home/soporte/backups/gs-db-pre-price-import-20260929-031251.dump` (139 KB; `pg_restore -l` lists 231 entries).
  - Path: the normal import wizard was unsafe for this data. It would have:
    - failed because `LISTA-GENERAL` is missing;
    - created 267 new products from unmatched SKUs, plus section-title rows;
    - created 197 uppercase duplicates, because of the exact-case SKU match;
    - read only the first sheet.
  - A one-off scratchpad loader was used instead. It reuses the pipeline's parser, mapper, validator and normalizer classes, writes only `PriceList` and `Price` in one transaction, and matches products with `normalizeSku`. No repo file changed.
  - Result: 7 lists and 2,335 prices. CLIENTE_FINAL_IVA, INSTALADOR_IVA and TIENDA_IVA have 497 prices each; DPP_ORO, DPP_PLATINO, ORO_SIN_IVA and INSTALLER_SIN_IVA have 211 each (Hikvision only).
  - All values were cross-checked against the Excel cells: 0 mismatches.
  - Coverage: **497/497 PUBLISHED products have a CLIENTE_FINAL_IVA price**. Range 4,524 to 219.5M COP, median 612,243.
  - Identity checksums are identical before and after. The parent re-ran them: `md5_identity a4cc310b…`, `md5_products_full 16e739b0…`, and the images checksum is unchanged.
  - 267 Excel SKUs have no product; they were not created. INSTALADOR_IVA is about 5% above TIENDA_IVA in the source.
  - Rollback, not executed: `DELETE FROM prices; DELETE FROM price_lists;`, or `pg_restore` of the backup.
  - Pipeline defects found, out of scope: case-sensitive SKU match, first-sheet-only reading, section rows imported as products, and the missing `LISTA-GENERAL` seed.

## Next step
SPP-02 + SPP-03: one backend writer, one commit per task. The DB now holds internal lists (DPP_*, *_SIN_IVA, INSTALADOR, TIENDA), so the public endpoints must filter strictly to the public code.

## Decision gaps after SPP-07/08 (2026-09-29)
- Brand search: the public search matches name and SKU, not the brand column, so "Fuli Battery" and "Western Digital" chips use substitute queries (`Batería`, `WD`) and Hikvision/Accessmatic return only part of their catalog. A backend `brand` filter would fix it.
- "Compra por categoría" probes one `limit=1` request per menu root (35 today). A backend counts endpoint would replace them.
- "Control de acceso" solution card links to search `cerradura` (no biometric/reader stock); copy still promises readers.
- `AccessRequestPage`/`ClientLoginPage` are not routed: "Crear cuenta" is hidden until a route exists.
- Real contact data, social URLs and legal/help pages are pending (footer entries hidden until `href` is set).
