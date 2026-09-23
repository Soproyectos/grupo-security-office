# Feature: CatÃ¡logo Comercial (public storefront)

## Objective
Implement the Claude Design handoff (`docs/design/catalogo-comercial/`) as a public storefront: Home, client login and "Solicitar acceso", plus the backend to receive access requests.

## Decisions
- Routes live under `/tienda/*` (`/tienda`, `/tienda/login`, `/tienda/solicitar-acceso`). Internal routes (`/`, `/login`) stay untouched.
- Client login is UI-only for now: no client accounts exist. It must NOT call the staff auth endpoint. Submit shows an informative "portal coming soon" message.
- Access requests are stored as leads for internal review; no account is created automatically.

## Security constraints
- Public endpoint `POST /api/public/access-requests`: no auth, strict DTO validation (whitelist, forbidNonWhitelisted, max lengths, email format, NIT format), rate limited per IP, honeypot field, generic response (no enumeration of existing NIT/email), no PII in logs.
- Listing/reviewing requests requires staff auth + permission.
- Storefront pages never expose negotiated prices; product data is static placeholder until a public catalog API exists.
- Public layout must not mount the admin auth store redirect (401 interceptor must not kick public visitors to `/login`).

## Tasks
- [x] T1 (commits a11ae38, 11faa44; parent review fixed route split, spoofable XFF, trust proxy, unvalidated PATCH, silent DB errors, permission seed; `npm test -- access-requests` 10/10 re-run by parent) Backend: Prisma `AccessRequest` model + migration, NestJS `access-requests` module (public create with throttling/honeypot, protected list/update status), tests. Route: delegated (writer trigger: 2+ files).
- [x] T2 (commit 5098baa; parent re-ran `npm test` 41/41 and `npm run build` OK; visual check of /tienda and /tienda/solicitar-acceso) Frontend: storefront tokens, public layout, Home, ClientLogin, SolicitarAcceso (RHF + Zod) wired to T1 endpoint, routes in `App.tsx`, tests. Route: delegated.
- [x] T3 (backend tests/tsc/build/lint reported by writer, access-requests tests re-run by parent; frontend tests/build re-run by parent). Pending: apply migration + seed on real DB, staff UI to review requests, real client auth (October portal) Verification: backend tests, frontend `vitest run`, `build`, `lint`.

## TDD
Mode: off (no project/session TDD configuration found). Ordinary functional checks apply.

## Progress
- Branch `feat/catalogo-comercial` created. Design handoff copied to `docs/design/catalogo-comercial/`.

