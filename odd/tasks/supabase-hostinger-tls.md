# Supabase Hostinger TLS

## Objective

Make the Hostinger Node.js API connect to the Supabase session pooler with a trusted project CA and hostname verification, without weakening TLS or changing remote services from this workspace.

## Problem

The API starts but login queries fail with `self-signed certificate in certificate chain`. The existing `DATABASE_SSL_CA_BASE64` setting is not consumed by the Prisma runtime, and Supabase currently takes Prisma's native PostgreSQL connector path.

## Authorized scope and constraints

- Prepare a local backend change and a deployable backend ZIP only. Do not access or modify Hostinger or Supabase remotely.
- Preserve all pre-existing local modifications; do not commit or push.
- Keep secrets and real certificates out of the repository and ZIP.
- Do not use `rejectUnauthorized: false` or a TLS-disable fallback.
- Route: delegated direct implementation because the fix spans runtime configuration, dependencies, tests, and deployment guidance.
- TDD: no explicit project TDD mode established; run focused tests and standard backend checks.

## Tasks

- [x] T1 — Add an opt-in `pg` Prisma adapter path using `DATABASE_SSL_CA_BASE64` with explicit certificate and hostname verification; retain Neon and local paths.
- [x] T2 — Add focused configuration tests and document exact Hostinger variables and certificate sourcing.
- [ ] T3 — Run focused tests, lint, typecheck, build, and package a safe backend ZIP; report any limitation honestly. Local checks ran; ZIP blocked pending exact deployed-backend baseline.

## Acceptance criteria

- The `pg` path refuses a missing or invalid CA rather than silently disabling TLS.
- The URL's `sslmode` cannot overwrite the explicit CA/verification settings in `pg`.
- Existing non-`pg` paths remain unchanged.
- ZIP includes the backend application required by Hostinger but no credentials, private env files, caches, or unrelated frontend assets.

## Progress and verification

- `npx jest src/prisma/prisma-pg-config.spec.ts --runInBand`: 12/12 passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed; Prisma Client 5.22.0 generated.
- Local no-network PrismaService construction with `DATABASE_DRIVER=pg` and a test CA: passed.
- `npx tsc --noEmit`: failed on three pre-existing assertions in `src/scripts/import-biblioteca.logic.spec.ts` (lines 45, 53, 57); no new TLS-file errors.
- `npx jest --runInBand`: 949/950 passed; one unrelated time-sensitive failure in `account-lockout.service.spec.ts` (expected date 2026-09-21, observed 2026-09-29).
- `npm audit`: seven advisories in unrelated existing packages; none for the newly added `pg` or `@prisma/adapter-pg` packages.
- No live Supabase/Hostinger query, credential, environment, schema, or deployment was attempted.
- No backend ZIP generated. No prior backend ZIP or deployment hash was found locally, and current backend worktree contains unrelated uncommitted Notion/import/schema changes. An archive from `HEAD` could roll back the live app; a ZIP of the entire worktree could deploy unrelated changes. The current deployed backend snapshot must be identified before a deployable package is safe to produce.
- Work-unit commit pending explicit authorization; project AGENTS.md forbids commits without it.

## Next step

Obtain the exact source/ZIP or commit identity of the currently deployed backend, then layer only this TLS change and repeat the build/ZIP inventory. Until then, do not deploy a package from this worktree.
