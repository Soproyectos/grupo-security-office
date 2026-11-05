# Price import — single price for suppliers without tariff tiers (option B)

## Objective
Suppliers such as Hikvision send up to 5 tariff columns; others send one price. Let Compras upload a file with ONE price column (`PRECIO UNICO (CON IVA)`), choose on screen which tariffs receive it (default all five), see the result in the preview BEFORE applying, and be warned that a supplier price is not a sale price: it is copied as is (VAT included) to the chosen tariffs. No migrations, no schema change.

## Decision (user, relayed by the parent session)
Option B: single-price column, exclusive with tariff columns; preview expands each row to the chosen tariffs so saved revision, apply, 30% cap, `ProductChange` and `TARIFF_UNAVAILABLE` see normal rows.

## Verified facts (mapper, read-only)
- Reader `modules/prices/import/price-template.ts`: `headerText` does NFC + trim + collapses spaces + strips " *" + uppercases, but does NOT strip accents, so both spellings must be accepted. Output `{tariffs, rows, ignoredColumns}`; file-level errors are `BadRequestException` in Spanish; row-level problems are `issues`; empty cell = no price (keeps current); columns A-H only (`price-workbook-structure.ts`).
- `PRICE_IMPORT_TARIFFS` = INSTALADOR_IVA, TIENDA_IVA, DPP_ORO_IVA, DPP_PLATINO_IVA, CLIENTE_FINAL_IVA (`price-import.types.ts`). Frontend hardcodes in `PriceImportPreviewPanel.tsx` and `provider-profiles.utils.ts`.
- Controller: `POST preview` multer `fields: 1` (DTO has only `listaId`, not passed to the service); `POST revisions` (save) `fields: 2`; apply is JSON. Global ValidationPipe is `whitelist + forbidNonWhitelisted`: a new multipart field must be declared in the DTO. The current flow without lists sends 0 fields in preview and 1 in save.
- `fileHash` = sha256 of the raw buffer only; `idempotencyKey` = client UUID. Save RE-READS the file and compares only `fileHash` + `createdById`: same file with another tariff selection would return the OLD revision (risk to fix). Apply does NOT re-read the file; it uses rows/prices stored in DB.
- Permissions around preview/save/apply are grant-based (`prices:preview|save|apply` + `prices:read` + `listas:read`) plus roles SA/Supervisor/AC. Not touched by this task.
- Backend `node_modules` is ABSENT in this worktree: backend `tsc`/`jest` cannot run here without installing or linking dependencies (needs the user's approval). The generated Biblioteca Prisma client is also absent in a clean clone.

## Contract (backend; writer reports any deviation)
- New header `PRECIO UNICO (CON IVA)` (also with accent) in the `PLANTILLA`/`PRECIOS` sheet, EXCLUSIVE with tariff columns: if both appear -> `BadRequestException` in clear Spanish.
- Preview and save accept an optional multipart field `singlePriceTariffs` (CSV of `PRICE_IMPORT_TARIFFS` names, like the template endpoint's `tariffs`). Absent + single-price file = all five. Unknown names, duplicates collapse, empty string = 400 in Spanish ("Elige al menos un escalafón"). Ignored (no effect, not hashed) when the file is not single-price.
- Preview response adds `singlePrice: { tariffs: PriceImportTariff[] } | null` so the UI knows it must show the selector.
- `fileHash` for single-price files includes the sorted selection; normal files keep the raw-buffer hash. Save re-expands with the same selection. Revision `summary` JSON may record `singlePrice.tariffs` (optional, no migration).
- Template: add a line about single price to the INSTRUCCIONES guide; second template download "Plantilla de precio único" only if cheap.
- Permissions: unchanged.

## Constraints
- No commit/push/deploy; no services started; no DB connections; no migrations; no installs (AGENTS.md).
- Backend has uncommitted work from the builder thread (price-import files are modified): targeted edits only, read the current file first.
- TDD: not enabled; ordinary checks. Frontend: `npx tsc -p tsconfig.json --noEmit`, `npx eslint`, `npx vitest run` in `src/frontend`. Backend checks need dependencies that are absent (see above).
- UI: Spanish, verb first, sentence case, one primary button per screen. Existing table layout (one row per SKU+tariff, column Tarifa) is kept instead of one column per tariff (minimal change); parent informed.

## Tasks
- [ ] T20 Backend: reader (header, exclusivity, expansion), preview/save field + DTO + multer limits, hash with selection, response flag, jest specs (valid single price, mixed with tariffs = error, partial selection, empty selection = error, rounding/range, hash differs by selection, non-single-price ignores the field). Written; cannot be run here.
- [ ] T21 Frontend: `PriceImportFlow` selector (five checkboxes, all checked), banner "Este precio se aplicará a: …", re-preview on selection change, supplier-price warning, save sends the same selection; vitest specs; tsc/eslint clean.
- [ ] T22 Template guide line + optional second download (backend + button).
- [x] T23 Test Excel `C:\Users\sopor\Downloads\pruebas-carga-precios\5_precio_unico.xlsx` created with python/openpyxl (sheets PLANTILLA and INSTRUCCIONES, SKUs WD122PURP, WD102PURP, UY2 and one non-existent; the four existing files untouched).
- [ ] T24 Checks and report (what changed, contract, guards, not tested, what the user must approve to test locally).

## Out of scope / pending
- Docs/code mismatch `ORO_IVA` (docs, IMP-02, `docs/plantillas/generar_plantilla_precios.py`) vs `DPP_ORO_IVA` (code): noted, not touched.
- Per-list panel (`PriceImportPreviewPanel`, `ListaDetailPage`): Listas no longer exist per the user; not changed.
- Misleading message about drafts: only if touched in passing.
- Permission map decisions (paused).

## Progress / evidence
- T23 done: file listed with the four originals untouched (sizes/dates unchanged); contents read back with openpyxl.

- T20/T22 backend done (reader, `singlePriceTariffs` CSV field on preview/save, `singlePrice` in preview, hash with selection, `summary.singlePrice`, `?singlePrice=true` template). Parent re-run after the user approved installing dependencies: backend `tsc` exit 0; `eslint` on 4 source files exit 0; `npx jest src/modules/prices/import`: 16 suites passed, 2 skipped, 438 tests passed, 16 skipped.
- T21/T22 frontend done (selector + banner, re-preview on change, fresh idempotency key, template button, revisions note). Parent re-run: `tsc` exit 0; `eslint` exit 0; `vitest` price-import + pages + App: 20 files, 140 tests passed.
- Not tested: real backend (the one the user sees runs on the VPS, no deploy), browser, a real Excel through the full flow.

## Next step
Test locally with `5_precio_unico.xlsx` once a local backend + DB is approved; then resume permission rebuild (`biblioteca-acceso-por-paneles.md`).
