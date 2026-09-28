# Mega Menu Categorías (Homecenter-style)

## Objective
Replace the storefront header's `CategoryDropdown` with a full-stack mega menu modeled on homecenter.com.co: an open panel with a left sidebar of root categories (icons) and a right area with a scrollable row of featured circular subcategories plus columns of level-2 categories with level-3 links. Backed by the real category tree from the database.

## Problem
The current storefront header (`src/frontend/src/features/storefront/components/StorefrontChrome.tsx`) renders a `CategoryDropdown` fed by a hardcoded array (`StorefrontChrome.tsx:6`) with fake subcategories. Navigating the menu teaches nothing about the real catalog, and the design is below Homecenter quality.

## Why
Approved plan from the coordinator (2026-09-25): feed the dropdown from the DB, replicate the Homecenter mega menu look (design only; invent images/demo data), full-stack scope.

## Scope
- DB fields for images and icons on `Category` (additive).
- Public read endpoint `GET /api/public/categories/menu`.
- Demo seed data (idempotent, separate from `seed.ts`).
- Locally generated placeholder images (no internet downloads, license-free).
- Frontend mega menu (sidebar + featured circles + columns), mobile drawer, category landing page.

## Constraints
- UI copy in Spanish; code, identifiers and comments in English.
- No new runtime dependencies (no icon lib, no Swiper). Tailwind tokens from `tailwind.config.js` (`security.500`, `surface`, `ink`, `neutral`, radii).
- Public endpoint must never expose inactive categories or non-whitelisted fields.
- Do not download images from the internet; generate locally (license-free, reproducible).
- Catalan tree depth capped at 3; inactive parent hides whole subtree.

## Environment / baseline (reconciled with the live repo)
- **Branch**: `feat/mega-menu-categorias` created from **`main`** (NOT from remote `feat/catalogo-comercial`, which lacks today's storefront WIP; the active storefront lives untracked in `main`).
- **Storefront chrome file**: `StorefrontChrome.tsx` (the plan's `StorefrontLayout.tsx` does not exist in `main`; it lives only in the stale remote branch).
- **Routes**: links go to `/catalogo/categoria/:slug` (plan's `/tienda/categoria/:slug` does not match `App.tsx:58-64`, which uses `/` and `/catalogo`).
- **Public endpoint pattern**: mirror `modules/customer-portal/customer-portal.controller.ts` (`@Public()` + `@Throttle`, no class-level guards). The `access-requests` module referenced by the plan does not exist.
- **TDD**: OFF (no `odd/tasks/catalogo-comercial.md`; `odd/tasks/public-storefront.md:26` records "no configured TDD mode found"). Functional checks: backend lint/test/build, frontend lint/build (tsc via `vite build`; vitest binary missing locally — pre-existing).

## Delivery
- Strategy: `ask-on-risk`. Forecast ~1,300 authored lines; RUNNING COUNT (commits 6d5a5e9 + 330c6ab + 39905ec): ~1,650 authored lines (420 + 679 + 549) — EXCEEDS the ~400 budget → ask-on-risk fired; coordinator responded "si continua".
- **Chain strategy (cached 2026-09-25): `feature-branch-chain`** (elegida por defecto tras "si continua" — work-unit commits ya separados, feature debe integrarse completa antes de main). Skill `chained-pr` resolved por registry name. Tracker PR draft (no-merge) + child PRs: PR1 = MENU-01 → tracker; PR2 = MENU-02 → PR1; PR3 = MENU-03+04+05+06 → PR2.
- Suggested slices: PR1 = MENU-01; PR2 = MENU-02; PR3 = MENU-03 + MENU-04 + MENU-05 + MENU-06.
- Push, PR creation and merge stay with the user.
- RDD: per work-unit commit (`gentle-ai review assess ...`). If the CLI is missing, record `unavailable`, treat the commit as due, tell the user.

## Tasks
- [x] MENU-07 — Real images for featured tiles (AUTHORIZED 2026-09-25, option 2: download from public web, coordinator accepts license risk).
  - Commit: `ac70b3e` `feat(categories): add real product photos for featured tiles` (20 files, +37/−3: 18 fotos + seed + generador).
  - Route: delegated (research ×2 + writer ses_f25f51dc1ffeQGhPmn8LRPkCN3, reporte vacío — completado por el padre tras verificar el estado real; corrección de sintaxis del writer: keys con guión sin comillas en REAL_IMAGE_EXT).
  - Research: 2 rondas (27/27 slugs con URL directa; fuentes: Hikvision CDN, ZKTeco s3.zktecoip.com/zkteco.systems/zkteco.technology, TP-Link static, Western Digital, APC/Schneider eshop-sa.se.com, Renogy, Commax, StarTech, Connectec, Mighty Max, Security System Depot/Akuvox, secuview). Hikvision /europe bot-blocked (/uk, /sg ok); s3.zktecoip.com timeout HEAD desde esta IP.
  - Descargadas (18 con foto real): grabadores-nvr.jpg (TP-Link VIGI — Hikvision primary falló por Akamai), kits-cctv.webp (TP-Link VIGI kit), accesorios-cctv-discos-duros.jpg (WD Purple), biometricos-huella.jpg (ZKTeco K40), cableado-utp.png (Connectec), cerraduras-inteligentes-smart.png (ZKTeco), citofonos.png (Commax DP-SS), electroimanes.jpg (ZKTeco LM-350), energia-paneles-solares.jpg (Renogy), fuentes-de-poder.jpg (Secuview), intercomunicadores-ip.png (Akuvox E12), racks.jpg (StarTech RK619WALL), routers-y-wifi.jpg (TP-Link Archer C6), sensores-humo.jpg (BigCommerce System Sensor), switches-poe.jpg (TP-Link), ups.jpg (APC BX1600MI), baterias.jpg (Mighty Max SLA), videoporteros.png (Commax CDV-70H2).
  - FALLARON (mantienen SVG, 9): camaras-ip-domo/bala/ptz (Hikvision Akamai challenge desde curl), biometricos-reconocimiento-facial + lectores-rfid (s3.zktecoip.com timeout), paneles-de-alarma, sensores-movimiento, timbres-con-video, torniquetes-y-barreras (Hikvision challenge).
  - Seed: mapa `REAL_IMAGE_EXT` (18 entradas citadas) + `desiredRow` usa `REAL_IMAGE_EXT[node.slug] ?? 'svg'`; header comment actualizado con atribución. Generador: solo comentario de fallback (SVGs siguen deterministas para los 9 sin foto).
  - Checks (REALES): seed corrida 1 → 18 actualizadas, 0 creadas/omitidas/error; corrida 2 → 58 sin cambios (idempotente ✅); endpoint localhost:3000 → 18 nodos con foto real + 9 con SVG; vite build PASS (10.07s); eslint seed + generador exit 0.
  - Nota: las fotos se sirven desde Vite public/ (sin dependencia de terceros en runtime); fuentes atribuidas en el seed. Licencia/copyright: riesgo aceptado por el coordinador (opción 2).
  - RDD: assess `review_due:true` `slice_budget_reached` (slice 39905ec..ac70b3e; untracked inventory digest nuevo `sha256:1b33e1a7144e9d1b6cb9f6211bbfc661bd2d7a39ade26c19aef8c54daf730d3b`) → `review start --consent granted` created lineage `review-4432070f0797542e` (state reviewing, 4 lenses, budget 200, risk medium).

- [x] MENU-01 — Backend: schema media fields + public menu endpoint.
  - Route: delegated (writer); 6+ non-trivial files (schema, 2 DTOs, service, new controller, module, specs).
  - Checks: DTO rejects `javascript:` URL; integration spec: no JWT → 200, 61st request → 429; `findMenu` excludes inactive subtrees, caps depth 3, whitelist holds, order kept. `npm --prefix src/backend run lint`, `npm --prefix src/backend test`, `npm --prefix src/backend run build`.
  - Evidence / commit: `6d5a5e9` — see Progress.
- [x] MENU-02 — Placeholder images + demo seed.
  - Commit: `330c6ab` `chore(categories): add demo category seed and placeholder images` (37 files, +1306; ~679 authored + 33 SVGs generated).
  - Route: delegated (writer, ses_f26c97da7ffeKpZ9Rkdkd5Touc).
  - Evidence: `generate-category-placeholders.mjs` (pure Node, deterministic, `--check` mode, fails if a demo slug is missing from seed) + npm script `gen:category-images`; `seed-categories.ts` (upsert by slug, read-compare-write so rerun is a byte-level no-op: run1 58 created / runs2-3 0 created 0 updated; safety guard skip si slug tomado por fila con productos o padre fuera del demo tree) + npm script `db:seed:categories`; 27 tiles 240×240 (radial #CE0203→#AD0102→#484748, 6 glyph familias) + 6 root icons 24px stroke currentColor.
  - Checks: gen PASS (33 SVGs, determinismo 33/33 byte-identical); backend lint PASS; backend test 48/49 suites 836/837 (solo fallo pre-existente account-lockout fecha); build PASS (seed type-checked); `npx vite build` PASS (455 modules); `npm run build` frontend BLOCKED pre-existente vitest; lint frontend 2 errores pre-existentes DashboardGrants. Seed ejecutado contra Neon dev (aditivo 35→93 categorías, sin deletes) y endpoint verificado: unauthenticated GET /api/public/categories/menu → 200, 41 roots, 27 featured, 29 level-3, fields exactos `children,iconUrl,id,imageUrl,isFeatured,name,slug,sortOrder`.
  - FINDINGS para MENU-03/04: (1) payload DOBLE WRAP `{data:{data:[...]}}` (service {data} + TransformInterceptor global) → MENU-03 debe unwrap dos veces; (2) endpoint devuelve 41 roots (35 pre-existentes planas sortOrder 0 de biblioteca + 6 demo sortOrder 10-60 que ordenan AL FINAL) → MENU-04 debe decidir presentación; (3) `currentColor` NO hereda vía `<img>` → icons root necesitan `mask-image` CSS o inline; (4) backend :3000 stale → reiniciar para exponer la ruta.
  - Deviations: `energia-paneles-solares` en vez de `paneles-solares` (slug live ya existe); safety guard extra en seed.
  - RDD: assess `review_due:true` `high_risk` → `review start --consent granted` created lineage `review-8d65e043e157a307` (state reviewing, 4 lenses, correction budget 200). Native review in progress; boundary advances on acknowledgement.
- [x] MENU-03 — Frontend data layer.
  - Commit: `39905ec` `feat(storefront): add category menu data layer` (5 files, +549).
  - Route: delegated (writer, ses_f26bd03daffeGroD90i10QBlL7).
  - Evidence: `features/storefront/types/categoryMenu.ts` (MenuCategory + CategoryMenuStatus); `services/public-catalog.service.ts` `fetchCategoryMenu()` vía api client con `toMenuArray` bounded-loop unwrap (max 3 niveles) — porque el interceptor de `api.ts` YA pela una capa `data`, el payload real llega como `{data:[...]}` y el doble wrap solo aparece en curl directo; `features/storefront/hooks/useCategoryMenu.ts` store module-scoped + `useSyncExternalStore`, cache de sesión, `retry()` limpia cache y recarga, guard anti-stale por requestId.
  - Checks (REALES, con vitest instalado no-save): `npx vitest run` → 3 files/43 tests PASS (20 míos + 23 pre-existentes compose.spec.ts); `npx tsc -b --force` exit 0; `npx vite build` PASS 455 modules; lint solo 2 errores pre-existentes DashboardGrants (scoped en mis 5 files exit 0). Verificación extra: wire real `{data:{data:[...]}}` con interceptor real de api.ts + axios adapter fake → fetchCategoryMenu devuelve el array.
  - DEVIATION IMPORTANTE: vitest estaba ausente de node_modules → instalado `vitest@5.0.2 --no-save --no-package-lock` (node_modules only; package.json/package-lock intactos, declarado ^5.0.1 en devDependencies). Esto destrabó el bloqueo pre-existente `compose.spec.ts TS2307` — `npm run build` frontend YA NO está bloqueado.
  - RDD: assess `review_due:true` `high_risk` → `review start --consent granted` created lineage `review-362d998d86cc0bd4` (state reviewing, 4 lenses, budget 200, changed_files 51 / changed_lines 2208 acumulados desde boundary 21f759e). Native reviews in progress: `review-b211592a60451cd9` (MENU-01), `review-8d65e043e157a307` (MENU-02), `review-362d998d86cc0bd4` (MENU-03). Boundaries advance on native acknowledgement.
- [x] MENU-04 — Mega menu UI (container/presentational).
  - Commit: `e720dbd` `feat(storefront): add categories mega menu` (10 files, +1577).
  - Route: delegated (writer, ses_f26ae7ae5ffe4dl3aVX22tlW1z). Replaces `CategoryDropdown` in `StorefrontChrome.tsx` (trigger = botón Categorías).
  - Evidence: `components/mega-menu/` — CategoryMenuContainer (open state, backdrop, Escape/outside/route close, focus return, aria-expanded/aria-controls), MegaMenu (presentational), CategorySidebar (roots + `CategoryIcon` mask-image/bg-current para currentColor), FeaturedCategoryRow (circles rounded-full border security-500 ~96px, overflow-x-auto snap-x, scrollBy arrow, hidden lg:flex), SubcategoryColumns (grid-cols-5, level-2 bold security-500 + chevron, level-3 text-ink truncate), MobileCategoryDrawer (full-screen fixed inset-0 drill-down con `<details>/<summary>` zero-JS + back; circles hidden lg:flex); extras `menu-model.ts` + `menu-controller.ts` (lógica pura testeable sin DOM). Panel `lg:absolute lg:inset-x-0 lg:top-full` sobre `<header className="relative">`, sidebar+columns scroll independiente max-h-[70vh], backdrop bg-neutral-900/40; hover-intent 120ms (HOVER_INTENT_MS), click/focus inmediatos; Arrow Up/Down entre roots; skeleton sidebar; error "No pudimos cargar las categorías" + Reintentar (retry()); links `/catalogo/categoria/:slug`; loading/error render únicos (1 live region).
  - DECISIÓN 41-roots: sidebar filtra a raíces con children.length > 0 (`navigableRoots` en menu-model.ts) → las 6 familias demo en orden sortOrder; las 35 planas siguen alcanzables vía "Ver todo el catálogo" → `/catalogo` al pie del sidebar y del drawer. No se puede filtrar por iconUrl/imageUrl (las 35 planas tienen null igual que las familias); shape del árbol es la única señal fiable.
  - Tests: `mega-menu.spec.tsx` — interacción (open/toggle/close+focus-return, Escape/outside/link/route close, hover-intent 120ms restart y cancel, arrow wrap, selection clamp, mobile back) sobre el store real con vi.useFakeTimers(); markup/hrefs/aria/skeleton/error+Reintentar/empty/circles/drawer via renderToStaticMarkup + MemoryRouter. NO ejecutables sin browser: keydown listener document, focus(), scrollBy (CategoryMenuContainer).
  - Checks (REALES): `npx vitest run` 4 files/74 tests PASS (31 nuevos + 43 pre-existentes); `npx tsc -b --force` exit 0; `npx vite build` PASS 465 modules (era 455); eslint scoped 9 archivos + StorefrontChrome exit 0/0 problems (solo 2 errores pre-existentes DashboardGrants).
  - DEVIATIONS: (1) test file `.spec.tsx` no `.test.tsx` (convención repo); (2) 2 archivos extra no listados (menu-model.ts + menu-controller.ts) + 6º componente MobileCategoryDrawer — la lógica tuvo que salir de los componentes para ser testeable sin DOM; (3) se quitó aria-haspopup="menu" (el panel no es role=menu) y se agregó aria-controls; (4) el link fake "Promociones" desapareció con el dropdown hardcoded.
  - RDD: assess `review_due:true` `high_risk` → preflight STATUS (untracked inventory cambió por `.atl/`+`biblioteca/`; digest canónico nuevo `sha256:f90dfaf92c458fc8f8de3b24cd0296beb00e8a26c5c4b1b0a066b6cbd4caf13d`) → `review start` FALLÓ con `lens_context_budget_exceeded` para el rango acumulado (51 files/2208 líneas desde 21f759e) → re-assess con `--base-ref 39905ec` (slice = solo e720dbd) → `slice_budget_reached` (medium) → `review start --consent granted` created lineage `review-5fe263acf5c8fd86` (state reviewing, 4 lenses, budget 200, risk medium). CONFIRMA estrategia cadena por slice (feature-branch-chain) para revisiones nativas viables.
- [x] MENU-05 — Category landing route.
  - Commit: `510f2b0` `feat(storefront): add category landing page` (3 files, +564).
  - Route: delegated (writer, ses_f26a035bcffe6OmvtWbK0GY8Vs).
  - Evidence: `features/storefront/pages/CategoryPage.tsx` — `useCategoryMenu()` + búsqueda recursiva del slug por todo el árbol (cadena de ancestros para breadcrumb), acotada por el contrato depth-3 del endpoint (nodo en `ancestors.length + 1 < MAX_TREE_DEPTH`); breadcrumb chevron SVG (ancestros enlazan a su propia página), name como `h1`, hijos como tiles ordenados por sortOrder (img/CategoryIcon mask-image/placeholder neutral), "Productos próximamente" en hoja; slug desconocido/error → bloque 404 "Categoría no encontrada" + "Volver al catálogo" → `/catalogo`; loading skeleton 6 círculos. Self-wrap en `<StorefrontChrome>` como hermanos (`CatalogPage.tsx`, `StorefrontHome.tsx` — no hay layout wrapper). App.tsx: ruta top-level `<Route path="/catalogo/categoria/:slug" element={<CategoryPage />} />` (2 líneas).
  - Tests: `category-page.spec.tsx` (18 tests) — slug nivel 1/2/3 con cadena ancestros, 404 unknown/empty, depth cap (level-3 sí, level-4 404), breadcrumb links + aria-current único, h1, hrefs hijos + sortOrder, img/mask/placeholder, "Productos próximamente", leaf, chrome, error, skeleton. Sin jsdom/RTL → renderToStaticMarkup + MemoryRouter (precedente MENU-04); sin click/keyboard/assertion queries; fetch cubierto por useCategoryMenu.spec.ts.
  - Checks (REALES): vitest 5 files/92 tests PASS (18 nuevos); tsc -b exit 0; vite build 466 modules; eslint scoped 0/0; extra: tree commiteado en git worktree temporal → tsc 0 + vitest 92/92.
  - DEVIATIONS: (1) staging parcial de App.tsx — el diff completo vs HEAD (~60 líneas de WIP storefront /, /catalogo, /clientes/*, AdminRoutes) es pre-existente y NO commiteado; solo se stagearon las 2 líneas propias (App.tsx queda `MM` post-commit, esperado); (2) helpers módulo-privados (findCategoryTrail, childrenBySortOrder, CategoryTrail) sin exportar para evitar warnings react-refresh/only-export-components; (3) estado error reusa bloque 404 sin botón Reintentar (retry() queda en el header mega menu dentro del chrome).
  - RDD: assess `review_due:true` `slice_budget_reached` (slice 39905ec..510f2b0) → preflight STATUS → `review start --consent granted` created lineage `review-a7890e205a5524b6` (state reviewing, 4 lenses, budget 200, risk medium).
- [x] MENU-06 — Docs + graph.
  - Route: inline.
  - Evidence: feature doc fully updated with commit SHAs + check outputs (see Tasks/Progress); cross-link added in `odd/tasks/public-storefront.md` ("Related feature: Mega Menu Categorías"); `graphify update .` **unavailable** — no `graphify` binary in PATH and no `graphify` subcommand in `gentle-ai 3.4.0` (checked `gentle-ai help`, `~/.gentle-ai/bin/` empty). Recorded skipped, not claimed.
  - Commit: no source change → no dedicated commit (docs live in `odd/` untracked, not committed per repo policy).

## Authorized scope
Plan pasted by the coordinator from the previous session: all six tasks above verbatim (title + intent), with the reconciliations recorded in "Environment / baseline". Demo data and images may be invented for design purposes; no production data changes.
EXTENSION (2026-09-25, coordinator): MENU-07 authorized — replace the 27 featured tile placeholders with real product photos downloaded from public manufacturer/distributor sites. The "do not download images from the internet" constraint is relaxed for MENU-07 only; coordinator accepts the license risk (option 2: "corro el riesgo").

## Acceptance criteria
1. `GET /api/public/categories/menu` (unauthenticated) returns only active categories, depth ≤ 3, whitelisted fields.
2. Storefront "Categorías" button opens the Homecenter-style panel: sidebar roots with icons, featured circles row, level-2 columns with level-3 links.
3. Hover/focus/click switches the root; Escape/outside click/link click/route change close the panel; focus returns to the button.
4. Mobile (< `lg`): full-screen drill-down drawer, no circles row.
5. Category landing page at `/catalogo/categoria/:slug` shows breadcrumb, name, children tiles, "Productos próximamente".
6. Seed is idempotent (run twice, second is a no-op). Backend and frontend lint/build pass; backend Jest suite green.

## Progress
- [x] MENU-01 — See Tasks. Commit `6d5a5e9`; RDD lineage `review-b211592a60451cd9` reviewing.
- [x] MENU-02 — See Tasks. Commit `330c6ab`; RDD lineage `review-8d65e043e157a307` reviewing.
- [x] MENU-03 — See Tasks. Commit `39905ec`; RDD lineage `review-362d998d86cc0bd4` reviewing.
- [x] MENU-04 — See Tasks. Commit `e720dbd`; RDD lineage `review-5fe263acf5c8fd86` reviewing.
- [x] MENU-05 — See Tasks. Commit `510f2b0`; RDD lineage `review-a7890e205a5524b6` reviewing.
- [x] MENU-06 — See Tasks. Docs + cross-link done; `graphify update .` unavailable (no binary/subcommand in gentle-ai 3.4.0).

## Docs committed (2026-09-28)
- MENU-06 dejó los docs en `odd/` untracked; hoy quedaron commiteados: `odd/tasks/mega-menu-categorias.md`, `public-storefront.md`, `fusion-import-biblioteca-adr-002.md`, `nvidia-gentle-ai-models.md` → commit `6242d5c` `chore(odd): add task docs for mega-menu, public storefront and biblioteca fusion`.
- RDD hoy: CLI `gentle-ai` no está en PATH (ni `~/.gentle-ai/bin`, ni `/usr/local/bin`) → assessment de los commits nuevos = **unavailable** (no baja el tier; commits quedan due hasta que corra el review nativo).

## Next Step
All six MENU tasks complete (5 work-unit commits, docs done). Remaining:
1. **RDD**: 5 native reviews in progress (MENU-01 `b211592a`, MENU-02 `8d65e043`, MENU-03 `362d998d`, MENU-04 `5fe263ac`, MENU-05 `a7890e20`) — boundaries advance per slice on native acknowledgement; headless runtime lacks provider-bound lens context. NOTE: accumulated range 21f759e..HEAD exceeds native lens budget (`lens_context_budget_exceeded`) → per-slice reviews are the viable path (confirms feature-branch-chain).
2. **PR chain** (user-owned, per cached `feature-branch-chain`): tracker draft + PR1=MENU-01, PR2=MENU-02, PR3=MENU-03+04+05+06, using skill `chained-pr`.
3. Optional reminders: restart backend on :3000 to expose `/api/public/categories/menu`; verify in browser once `agent-browser` available.