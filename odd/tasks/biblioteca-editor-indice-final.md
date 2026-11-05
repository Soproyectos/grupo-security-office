# biblioteca-editor-indice-final

Objective: final structure of the product editor (Biblioteca > Actualización > Fichas), no repeated fields, mirrors the storefront, friendly to the end user.

History: round 1 (flat 12-item index, spec groups in Descripción, unified save bar) is done and verified (tsc clean, 268 tests). The user rejected the result on 2026-10-28 and approved a new structure ("Sí, fase 1").

## Approved structure (2026-10-28)
1. Datos generales: name (single name; saving copies it to the sheet `name`), brand, category, "Estado en la tienda" (Vigente/Descontinuado). Manufacturer identifiers moved here, collapsed.
2. Imágenes: several files at once, type per image, in-page delete confirmation (no `confirm()`), URL add = phase 3 (backend).
3. Resumen para el cliente: Etiquetas, Destacados, Características (3 labelled blocks, each says where it appears).
4. Descripción y especificaciones: description + spec groups master-detail (+ disclaimer). Legacy simple list only if it has values.
5. Precios.
6. Recursos: documentos + firmware (+ note). Firmware upload from PC = phase 3 (backend).
7. Publicar: locked steps (Datos básicos -> Imagen principal -> Precio vigente -> Revisión final y publicar). Web address (slug/published) as collapsed advanced block.
8. Archivar o quitar, Notas internas, Historial.
Removed from the UI (data kept, payload unchanged): "En la tienda" name/reference/brand/image overrides, Modelos disponibles.

## Phases
- Phase 1: structure, images (multi-file + own confirm), Publicar steps, backend handoffs.
- Phase 2: live preview (right column, field-focus highlights, click preview -> field, mobile toggle, built from real storefront components + a draft->ProductDetail adapter).
- Phase 3: images by URL, firmware upload (needs backend answers).

Constraints: no commits/push/deploy/migration (AGENTS.md). Frontend only (handoffs for backend). Keep payloads. Skill gs-disenador-web rules. TDD off; runner `cd src/frontend && npx vitest run`; typecheck `npx tsc --noEmit`. Route: delegated direct, cheap-model writer (user request), one writer, tasks sequential, I verify each.

## Tasks
- [x] R1 Round 1 (flat index, specs in Descripción, unified save) — superseded in parts by P1a
- [x] P1a Structure: index, Datos generales fields, Resumen para el cliente, remove Modelos/overrides from UI
- [x] P1b Images: multi-file upload, in-page delete confirmation
- [x] P1c Publicar: locked steps
- [x] P1d Backend handoffs (images by URL + multi, firmware upload)
- [ ] P1e Verification and review
- [ ] P2 Live preview (started 2026-10-28 after "Fase 2 ya")
  - [x] P2a Pure model: `features/products/preview/preview-model.ts` (+spec): `PreviewField`, `buildPreviewProduct` (draft -> ProductDetail), `describePreviewField`, section/field maps. Route: delegated direct (haiku writer; trigger: new module + spec). Evidence: tsc exit 0, vitest 28/28 (`src/features/products/preview`). Price = public tariff CLIENTE_FINAL_IVA matched by `priceList.code` (backend env override not visible); breadcrumb = Catálogo > category (no ancestors on the frontend type); non-PUBLISHED products still show price in the preview (backend would hide it) — intended.
  - [x] P2b `data-preview-field` attributes: storefront components (attributes only, no visual change) + editor zones in LibraryProductEditorPage. Helper `preview/preview-fields.ts` (`previewField`, `fieldFromElement`). Route: delegated direct (haiku writer). Evidence: tsc exit 0; vitest 28 files/363 tests (products + editor page); storefront diff = import + attribute lines only; 6 attribute-only wrappers in the editor page (status, internal x2, images, price, resources). Mobile price bar also marked `price` (me).
  - [ ] P2c `LivePreview` (same-origin iframe + React portal, copied styles, highlight, click -> field) + 3-column layout / Editar|Vista previa toggle + wiring
    - [x] P2c1 components in `features/products/preview/`: `PreviewFrame` (iframe+portal, click capture, highlight, own-window scroll), `use-frame-document`, `focus-field`, `preview-frame-css`, `LivePreviewView/Panel` (+specs). Evidence: tsc clean for these files, vitest 7 files/59 tests, eslint clean. Highlight color uses `--color-primary` (the `--library-*` variables only exist under `.biblioteca-workspace`, not inside the iframe). Copy fixed by me: «Elige un campo…».
    - [x] P2c2 page wiring + layout CSS + toggle (haiku writer, 2 rounds). Stage wrapper inside `ProductSheetScope`; `Editar | Vista previa` toggle; 3rd sticky column when the stage is >= 1240px wide measured with `useStageWide` (ResizeObserver) — NOT CSS container queries: `components/ui/Modal.tsx` is not portaled, so `container-type` would have trapped its `position: fixed` overlays (price and publication modals). `focusFieldZone` also opens a closed `<details>`; focusing outside any section panel (save bar) keeps the highlight.
  - [~] P2d Verification: automated DONE (tsc exit 0; vitest `src/features src/pages src/services` 122 files / 1304 tests; eslint clean on touched files). Browser check PENDING: the editor needs a signed-in session (the in-app browser is at the login page; credentials are the user's to enter). Unverified in a browser: iframe style cloning, highlight/scroll, click-to-focus, 3-column vs toggle at 1440/1024/375px, modal overlays, price/photos/breadcrumb data in the preview.
- [ ] P3 URL images + firmware upload (after backend)

## Phase 2 design (decided 2026-10-28)
- Storefront pieces use viewport media queries (`lg:`/`sm:`), so an in-page render in a narrow column would be wrong. Decision: render the REAL `ProductDetailPage` inside a same-origin `<iframe>` through a React portal (shares Router/context, own viewport = true mobile layout, own scroll, `fixed` mobile bar stays inside). Styles are cloned from the parent `<head>` on load.
- Highlight: `data-preview-field="<field>"` on storefront elements; the active field gets `data-preview-highlight` (brand-red outline) and is scrolled into view only when the active field changes (never while typing). Click in the preview (capture, preventDefault) -> opens the section and focuses the field's first control.
- Editor side: zones `data-preview-field` wrap existing blocks in the page (no edits inside blocks). `onFocusCapture` on the content column sets the active field; fields with no storefront place show a plain caption "no se ve en la tienda".
- A caption (aria-live polite) states in plain language where the active field shows, or that it is empty/hidden (e.g. description is hidden while highlights exist).
- Data: name/brand/description from page values, the rest from the sheet draft; price, photos and breadcrumb from saved data (changes apply on save). Mimic the backend mapper (`product.mapper.ts`) without editing backend.
- Layout: stage >= 1240px wide (measured with ResizeObserver, `data-wide`) -> third sticky column (400px); below that an Editar | Vista previa toggle swaps the content column (both stay mounted). No CSS containment (it would trap the non-portaled Modal).
- Known limits: `useScrollSpy` listens to the parent window, so the spec-index highlight inside the preview does not follow the preview scroll; desktop-width toggle is a possible later addition; nothing verified in a browser yet.

Next step: browser check of the preview once a signed-in session is available; then user review, then P3 (needs backend answers).
