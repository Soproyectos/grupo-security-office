# scraper-fichas-biblioteca

Objective: a product-sheet scraper that reads a supplier price list (Excel), takes the SKU/reference column, searches the internet for each product (manufacturer sites first), extracts the data needed to publish it on the web, and sorts products into three lists. It must run unattended day and night on Linux for 5,000+ products and have a user interface.

Why: the library has ~5,038 SKUs; 4,316 are `pendiente_enriquecimiento`. The existing `laboratorio/` bots only query the company's own API (no internet search, no image/PDF download, one script does not compile).

Decisions (user, 2026-10-27):
- New folder `scraper-fichas/` at the root of this worktree; do not touch `laboratorio/` (the user works there with another agent) nor the other threads' files.
- Minimum for "completo": identity + images + technical specifications. Everything else is searched too but its absence does not make a product incomplete.
- Three output lists: completos, incompletos, no encontrados (plus "con error" for transient failures, never counted as "no encontrado").
- Must have an interface and a headless Linux mode (resumable, long-running).

Reference product (demo): Hikvision DVR `iDS-E04HQHI-D` at /catalogo/productos/655337aa-6b8a-4ae7-8973-ff977267af04. Checklist derived from it:
- Identity: SKU, showcase name, brand, category, featured flag (optional).
- Images: main image, extra images.
- Commercial summary: bullet benefits, feature badges.
- Technical specs: grouped sections (~5 groups, ~30 data points).
- Resources: datasheet PDF, user manual PDF, firmware, release notes.

Output contract (web import): manifest JSON `{schemaVersion:1, products:[...]}`; each sheet needs `referencia`, `estado` (`verificado|parcial|no_encontrado|pendiente_enriquecimiento`) and `nombre_vitrina.valor` except for `pendiente_enriquecimiento` (src/backend/src/scripts/import-biblioteca.logic.ts:23-98). Images: JPEG/PNG/WEBP/GIF up to 8 MB; documents up to 16 MB. Never copy prices.

Tasks:
- [x] T1 Core: Excel reader, SKU normalization, resumable job store (SQLite), polite search + extraction pipeline, completeness classifier, manifest writer.
- [x] T2 Interface (probada con curl y captura; flujo completo en navegador sin verificar): local web UI (works on a headless Linux box via browser) to pick the list, start/pause/resume, watch progress and open the three lists.
- [x] T3 Headless CLI + Linux run guide (systemd unit as a text file only; nothing installed or enabled).
- [~] T4 Real tests (18 unit tests OK; muestra real: Dahua OK; Hikvision bloqueado por el sitio, ver scraper-fichas/LIMITES.md) on a sample of SKUs and unit tests; tune extraction.
- [~] T5 HiTools adapter (Hikvision via the user's logged-in HiTools Designer account, no LLM): `hitools_parse.py` (pure parser, unit-tested against the saved sample: model, SAP, 7 bullets, 34 specs, 4 documents), `hitools_browser.py` (Playwright persistent profile, login helper, throttle, circuit breaker/PAUSE, authenticated image + document download), CLI `hitools-login` and `--hitools-headless/--hitools-profile`, 38 unit tests OK. LIVE FLOW VERIFIED on 1 SKU (2026-10-27 21:54, user's session): `one iDS-E04HQHI-D` gave identity + 34 specs + 7 bullets + 1 image (5000x5000 PNG, 5.1 MB) + manual and datasheet PDFs, conf 0.90, `faltantes: []`. Fixes needed on the way: Log In is not a `<button>`; HiTools drops its session cookie and per-tab storage on browser close, so `hitools-login` now saves cookies + storage to `data/hitools-session.json` (git-ignored) and each run restores them. NOT verified: session lifetime over hours, batches of many SKUs, headless on Linux, gallery with more than one image (only 1 downloaded; the sample showed 2 thumbnails), firmware/release notes.

Constraints: no commit/push/deploy; no installs without approval (requests, bs4, lxml, playwright, openpyxl, pandas, pymupdf, pypdf, tkinter are already present); respect robots.txt, identify the User-Agent, rate-limit per domain; store the source URL of every datum.
TDD: not enabled; ordinary functional checks.
Route: delegated direct (one writer).
