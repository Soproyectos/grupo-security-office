# Panels + price import recovery

## Objective
Rebuild a compiling, tested base from copy B (the takeover snapshot) for the panels and price import work, so that the purchasing panel can be built on top of it afterwards.

## Problem
The unpushed work was recovered from two incompatible snapshots:
- A (`gs-tanda-recovered`): older "admin-access" model (`accessRule`, `ACCESS_ACTIONS`, `hasAction`, admin-access guard, action audit interceptor, `StorefrontBanner`).
- B (`takeover-extracted/src`): newer access model (grants / `resolveAccess` / `AccessAssignments`), price import with revisions, apply and provider profiles, packages in `access-catalog`.
- `B/current/` (23 files) is NOT newer: it removes APIs used by the rest of B and deletes three packages. It is excluded.
- A previous integration branch mixed both and failed: backend tsc 96 errors, jest 31/116 suites failed, vitest 27 failures.

## Scope (this task only)
Rebuild from B, restore the three packages and the `StorefrontBanner` model, remove leftovers of A, make it compile and pass tests.

## Out of scope
New features: mixed lists, unknown-SKU draft panel, >30% alert, per-product history, purchasing package.

## Constraints
- Production-candidate VPS: never touch gs-api, gs-frontend, gs-db, host nginx, ports 80/443/3001/8080/5432/19999, /opt/grupo-security, /etc, systemd, Netdata. No sudo.
- Databases only in throwaway containers (127.0.0.1:54400-54420, postgres:18-alpine); never create a container named `gs-tanda-db`.
- No push. Conventional Commits, no AI attribution.
- ~400 authored changed lines per task is an advisory heuristic only.

## Delivery
Single branch `feat/panels-price-import-base`, no push. Strategy: ask-on-risk. RDD: unavailable (gentle-ai not installed). TDD: off (restoration task; no project/session TDD config); functional checks only. Engram mirror: pending (Engram tools unavailable in this session).

## Tasks (route: delegated writer)
- [ ] T1 Base: overlay B/src on 5449ecb2 (no `current/`), then keep only non-conflicting assets from A.
- [ ] T2 Merge current origin/main with the documented conflict policy.
- [ ] T3 Restore `StorefrontBanner` in schema.prisma, check migration drift, verify the 3 packages and prices:* / listas:* actions.
- [ ] T4 Green: backend/frontend tsc 0, lint 0 errors, jest and vitest failing only for pre-existing or environment reasons.
- [ ] T5 Security notes on the merge resolutions (document only, no behavior change).

## Acceptance criteria
- Backend `tsc --noEmit` and frontend `tsc -b`: 0 errors.
- Lint: 0 errors on both.
- jest and vitest: failures only if pre-existing on origin/main or environment dependent, each listed with evidence.
- Migrations consistent with schema.prisma (or drift reported).

## Progress
(none yet)
