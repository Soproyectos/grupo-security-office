# Hostinger PostgreSQL Container Cutover

> **Status: on hold (2026-10-02).** The user confirmed production uses Supabase for now. Do not execute this cutover unless that decision changes. Active path: `odd/tasks/supabase-hostinger-tls.md`.

## Objective

Make the Hostinger production stack able to run the web application's PostgreSQL database in its existing Docker Compose `db` service instead of Neon, without exposing credentials or performing a remote cutover from this workspace.

## Problem

The production Compose file already declares PostgreSQL, but the API still receives `DATABASE_URL` from the Hostinger environment. If that value points to Neon, the local container is unused and the Neon quota remains a runtime dependency.

## Authorized scope

- Update production database configuration guidance and a safe operational runbook.
- Keep Neon fallback code until the containerized PostgreSQL path is verified.
- Validate the stack locally with PostgreSQL 16 in Docker when the environment permits.
- Do not access Hostinger, change remote environment variables, migrate production data, commit, push, or deploy without explicit authorization for each operation.

## Constraints

- No secrets, real credentials, or production data in Git.
- Preserve unrelated working-tree changes.
- The Hostinger cutover requires a verified backup, import, validation, and rollback plan.
- Stored product files may live in PostgreSQL and must be included in any data migration.

## Tasks

- [x] T1 — Add a production-safe PostgreSQL container configuration/runbook that points the API at the internal `db` service through an explicitly supplied `DATABASE_URL`, and include the Prisma CLI in the production image for controlled migrations.
- [x] T2 — Document backup, restore, migration, cutover, rollback, and validation steps for Hostinger; clearly mark remote-only actions.
- [x] T3 — Run focused static/Compose validation and record exact results; no remote deployment.

## Route and evidence

- Route: delegated direct single-writer implementation after repository mapping; the parent performed the focused manifest correction and verification readback.
- Current branch: `feat/storefront-public-pricing`.
- Work-unit commit: pending explicit user authorization; repository policy forbids creating commits without it.

## Acceptance criteria

- The API can be configured to use `postgresql://...@db:5432/...` without a Neon-specific adapter.
- Production guidance never stores credentials in tracked files and does not silently build a URL from unescaped credentials.
- The runbook prevents an unsafe cutover without a verified backup and rollback path.
- Compose configuration remains valid and unrelated worktree changes are untouched.

## Progress

- T1: complete — `docker-compose.prod.yml` now requires an explicit `DATABASE_URL`; `README.md` no longer implies that Neon is required; `prisma` is a production dependency so the production image can run `prisma migrate deploy`.
- T2: complete — `docs/procedimientos/postgres-hostinger.md` documents configuration, verified-backup gate, startup, `prisma migrate deploy`, validation, rollback, and out-of-scope boundaries.
- T3: complete — package manifests parse successfully; production Compose rejects a missing `DATABASE_URL` with the intended fail-fast message; Compose config succeeds with non-secret dummy values; `git diff --check` passes. No containers were started and no remote deployment was performed.

## Implementation evidence

- Changed only for this feature: `docker-compose.prod.yml`, `README.md`, `src/backend/package.json`, `src/backend/package-lock.json`, `docs/procedimientos/postgres-hostinger.md`, and this task document. Other pre-existing working-tree changes were preserved.
- `DATABASE_URL` uses Compose required-variable syntax and is not constructed from separate unescaped credentials.
- `prisma` is a production dependency so the production image contains the CLI required by the documented `prisma migrate deploy` step.
- The runbook preserves the existing Neon/native Prisma fallback and requires PostgreSQL-stored product files to be included in migration/backup validation.
- No Hostinger access, remote cutover, production data export/import, deployment, or data migration was performed.
- No commit was created because repository policy requires explicit commit authorization.

## Next step

Run the authorized local/static verification later and append only observed results; remote cutover and data migration remain separate, explicitly authorized operations.
