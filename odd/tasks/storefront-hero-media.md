# Storefront hero media layout

## Objective
Make the storefront hero span the full page width and present the existing Hikvision and EZVIZ banners alongside the restored hero design.

## Scope and constraints
- Authorized scope: `StorefrontHome` layout only.
- Preserve the storefront header unchanged.
- Reuse the existing local banner assets; do not introduce external image dependencies.
- Do not commit, push, or open a pull request without explicit authorization.

## Tasks
- [x] SHM-01 — Move the hero outside the constrained content container so it spans the page width.
- [x] SHM-02 — Place the Hikvision and EZVIZ banner photos in the full-width hero slider.

## Acceptance criteria
- The hero uses the full available page width.
- Both existing banner photos are responsive, link to the catalog, and rotate in the full-width hero slider.
- The header remains unchanged.

## Checks
- Docker frontend build and lint — pending: execution permission was declined after the slider update.
- 2026-09-29: the user authorized the commit. The slider spec expected prev/next arrows that the WIP had dropped; arrows were restored (44px, visible focus) and the text overlay got `pointer-events-none` so the banner links are clickable again. Checks: vitest storefront+services 180/180, `tsc -b` exit 0, lint 2 errors / 9 warnings (unchanged baseline). Commit `3814905` (7 files, +393/-63). `.env.example` stays uncommitted (not part of this feature; access to it is denied to the agent).
