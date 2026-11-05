# Biblioteca change history — phase 3 (new read-only endpoint + UI)

## Objective
Build "Historial de cambios" in Biblioteca > Actualización: a paginated, filterable feed of who changed what (price loads, product-sheet edits, publication changes) with a per-item detail (product, before -> after). Backend: NEW read-only endpoints in a NEW module; no migrations, no schema change. Frontend: enable the disabled tab at `/commercial/library/update/history`.

## Verified facts (read-only mapping, parent re-checked the guard code it relies on)
- `product_changes`: id, productId, sku, field (String), oldValue/newValue (Json), source (String, no enum), sourceRef, actorId (NO relation to User), batchId (no FK), createdAt. Indexes: (productId, createdAt DESC) and (sourceRef). No index by createdAt/source/batchId, so cross-product scans must be bounded (default date window, page cap).
- Writers: PRICE_IMPORT (apply: sourceRef = revisionId + batchId; resolution; draft from prices), MANUAL (create, PUT /products/:id, product prices, prices.service), LIFECYCLE (publish / unpublish / schedule; sourceRef = productId). Sheet and image changes do NOT write ProductChange. `batchId` is only set by price imports. Rows of one edit share `createdAt` (single createMany).
- `PriceImportRevision`: status GUARDADA|APLICADA|DESCARTADA, listaId nullable, createdBy/appliedBy relations to User (User has only `name`), summary = {newPrices, changedPrices, unchangedPrices, unknownRows}. `appliedById` is not exposed by the existing API.
- Claim corrected: the price flow DOES write AuditLog in legacy mode (`price-import-apply`); in dedicated mode it writes `library_audit_events`.
- Existing read guards to not be looser than: `listRevisions` = `@Roles('Super Admin','Supervisor','Admin Comercial')` + `assertActions(['prices:read','listas:read'])` + lista ACL `view_prices`; product changes = ALL_ROLES + `products:read` d5 + product ACL, `price:*` fields need `prices:read`. Global ThrottlerGuard 20 req / 60 s.
- Local serving: `docker-compose.yml` api service runs `node dist/src/main` (no watch) built from `src/backend/Dockerfile.customer-access`; `db` = postgres:18. Backend dev script is `nest start --watch` (no `start:dev`). Vite on 5174 proxies `/api` to `VITE_API_TARGET` (SSH tunnel to the VPS), so a new endpoint will NOT exist there until deployed or until a local backend serves it.

## Constraints
- No commit/push/deploy; no starting or restarting services/containers; no DB connections; no migrations (AGENTS.md).
- Backend has uncommitted work from the builder thread (`acl.service.ts`, `products.controller.ts`, ...): do not touch it; new code goes in a NEW module; `app.module.ts` gets one targeted edit.
- TDD: not enabled; ordinary functional checks. Backend: `npx tsc -p tsconfig.json --noEmit` and `npx jest <pattern>` in `src/backend`. Frontend: `npx tsc -p tsconfig.json --noEmit`, `npx eslint`, `npx vitest run`.
- UI: Spanish, verb first, sentence case, one primary button per screen.

## Contract (backend; writer reports any deviation)
- `GET /api/library/history?type=PRECIOS|FICHAS|PUBLICACION&actorId=&from=&to=&limit=&cursor=` -> `{ items, nextCursor }`; item = `{ id (opaque), type, occurredAt, actor {id,name}|null, summary (verb-first, no actor name), counts|null, subject {...}, hasDetail }`. limit default 25, max 100; default window when `from` is absent (documented).
- `GET /api/library/history/actors` -> `{ actors: [{id,name}] }` (declared before `:id`).
- `GET /api/library/history/:id/changes?limit&cursor` -> `{ item, changes: [{productId, sku, productName|null, field, oldValue, newValue, occurredAt}], nextCursor }`.
- Sources: APLICADA price-import revisions (type PRECIOS) + product_changes (MANUAL price fields -> PRECIOS; other MANUAL fields -> FICHAS; LIFECYCLE -> PUBLICACION). PRICE_IMPORT rows are not listed again in the feed (they are the detail of their revision).
- Guards: deny by default; role list stricter than or equal to `listRevisions`; per-type d5 action checks (`prices:read`+`listas:read`, `products:read`, `prices:read` for price fields); global scope only (403 otherwise). Writer documents the exact guard stack in the controller and report.

## Tasks
- [ ] T12 Verify the findings (done by mapper; see facts above).
- [ ] T13 Backend: module `library-history` (controller, service, DTOs, module) registered in `app.module.ts`; jest specs for service and controller; tsc backend clean.
- [ ] T14 Frontend: service + hook + `LibraryHistoryPage` at `/commercial/library/update/history` (day-grouped timeline, filters type/person/date, detail panel, empty state, 404 degrade); enable the tab in `LibraryUpdateLayout`; vitest specs; tsc/eslint clean.
- [ ] T15 Run all checks; find out what the user must approve to see it working locally.
- [ ] T16 Report to parent (changed, reused, guards, untested in browser, route to open).

## Out of scope / pending
Permission-model change per Biblioteca tab (awaiting the user's approval, separate); image/sheet change history (not recorded by the backend); dedicated-mode `library_audit_events` feed; publication_events table; indexes for faster cross-product scans (needs a migration).

## Progress / evidence
(empty)

## Status: PAUSED (2026-10-24)
The user (directly, in chat) said Listas no longer exist and all permissions must be managed by panels, and asked to close the access/permission structure first. The guard design above assumed `listas:read` and `prices:read` (listRevisions-style) and must be redone after the permission map is agreed. No backend or frontend code of phase 3 was written. See `decision_listas_eliminadas_permisos_por_paneles` (memory) and Engram topic `odd/biblioteca-permisos-paneles/decisions`.

## Next step
1. Deliver a plain-language permission map per panel (tabs -> what each allows -> what the server really enforces -> gaps) and let the user decide.
2. Then rewrite the T13 guard stack without `listas:*` and resume T13 backend writer.
