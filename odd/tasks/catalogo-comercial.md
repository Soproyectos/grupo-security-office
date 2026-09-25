# Feature: Catálogo Comercial (public storefront)

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
- [x] T5 gentle-ai review of PR #54 (lineage review-999c7817c7782239): approved after one bounded correction 39ae587.
- [x] T4 (commits 050d491..12e3504; R4-003 intentionally not changed: dedup would leak enumeration timing; gentle-ai review lineage review-ecf84562e4f7de73 approved, 4 new non-blocking reliability follow-ups) Resolve the non-blocking gentle-ai findings listed in `odd/tasks/review-findings-pr54.md`, then review with gentle-ai (base = 39ae587). Route: delegated (writer trigger: 2+ files).
- [x] T6 (commits 319e85f, 0d605b4, ac005a6) Fix 4 gentle-ai review findings (R3-trust-proxy-hops-nan, R3-controller-specs-bypass-guards, R3-query-dto-validation-untested, R3-response-shape-untested). Route: delegated (writer trigger: 2+ files).
  - R3-trust-proxy-hops-nan: extracted `parseTrustProxyHops` (`src/backend/src/config/parse-trust-proxy-hops.ts`) — defaults to 1 when unset/empty, throws on non-integer/negative values; used in `main.ts`; unit tests in `parse-trust-proxy-hops.spec.ts` (6 cases). Commit 319e85f.
  - R3-controller-specs-bypass-guards + R3-query-dto-validation-untested: added `src/backend/src/modules/access-requests/access-requests.integration.spec.ts`, a real Nest app (`Test.createTestingModule` + supertest) with the same global ValidationPipe/JwtAuthGuard/PermissionsGuard/ThrottlerGuard/HttpExceptionFilter/TransformInterceptor as `main.ts`; AccessRequestsService and PrismaService mocked, JwtStrategy's PrismaService/SessionService deps mocked (JWT verification itself is real, via a real signed token). 11 tests: 401 without token (list/patch), 403 without permission (list/patch), 200 with permission (list/patch), 400 invalid UUID param, 400 status outside enum, 400 limit=101, 400 page=0, public POST succeeds without auth then 429 after exceeding the 5-per-window throttle. Commit 0d605b4.
  - R3-response-shape-untested: added `src/frontend/src/services/access-requests.service.spec.ts`, mocking only the axios instance's `post` (existing `vi.mock('./api', …)` pattern from `storefront.test.tsx`); asserts `submitAccessRequest` resolves `{ received: true }` from an already-unwrapped `response.data` and posts to `/public/access-requests` with the given payload. Commit ac005a6.
  - Verification (all re-run after the fixes): backend `npm test` 813/814 passed (1 pre-existing failure: `account-lockout.service.spec.ts` hardcoded date, not touched); backend `npx tsc --noEmit` clean; backend `npm run lint` clean. Frontend `npx vitest run` 47/47 passed (3 files); frontend `npx tsc -b` clean; frontend `npm run lint` 2 pre-existing errors in `DashboardGrants.tsx` (not touched), 9 pre-existing warnings, no new errors.

## TDD
Mode: off (no project/session TDD configuration found). Ordinary functional checks apply.

## Progress
- Branch `feat/catalogo-comercial` created. Design handoff copied to `docs/design/catalogo-comercial/`.

