# VPS deploy via GHCR

## Objective

Deploy the web project to the OVH VPS (57.131.50.38, `dev.gruposecurity.cloud`) from GitHub Actions. Actions builds the images and pushes them to GHCR. The VPS pulls them over SSH, applies Prisma migrations on every deploy and keeps a local build only as a manual fallback.

## Problem

- `.github/workflows/cd.yml` does not match the VPS. It uses only `docker-compose.prod.yml` (no VPS override), so it would start the bundled nginx on 80/443 and would not bind 127.0.0.1 ports. It also omits `MFA_ENCRYPTION_KEY` and runs no migrations. `pull` runs without `IMAGE_TAG`, and nothing waits for CI.
- The GHCR namespace is hardcoded as `zatairo`, but the repository is `Soproyectos/grupo-security-office`.
- `src/backend/Dockerfile` would crash in production. Its CMD is `dist/main` instead of `dist/src/main.js`, bcrypt is rebuilt after the prod node_modules copy, and it never creates `/app/uploads`. The VPS runs a working `backend.Dockerfile` that exists only in `/opt`.
- The VPS deploy config (`/opt/grupo-security/deploy/vps`, compose prod) is not versioned.
- gs-db has no scheduled logical backup. Only OVH's daily whole-disk backup exists.

## Why

On 2026-10-19 the VPS was chosen to replace Hostinger + Supabase. Migrations must never drift again: the 5 missing migrations broke `/api/notifications`.

## Scope

- Backend Dockerfile: adopt the proven VPS build.
- Version the VPS deploy config in the repo (`deploy/vps/`) and align `docker-compose.prod.yml` with the live VPS.
- A deploy script on the VPS: pull, pre-migration dump, `prisma migrate deploy`, up, health wait, image rollback on failure.
- `cd.yml`: run after successful CI on `main` plus a manual dispatch with a tag. Lowercase GHCR namespace, SSH deploy and smoke test.
- One-time bootstrap (deploy user, shared group, backup dir) and a daily gs-db `pg_dump` systemd timer with rotation.
- Runbook in `docs/procedimientos/`.

Out of scope: Supabase data migration, Hostinger uploads copy, production domain, Netdata and other host services.

## Constraints

- Host nginx owns 80/443. The containers bind to 127.0.0.1 only (api 3001, frontend 8080).
- The user runs commands that need sudo or credentials (GitHub secrets, deploy user, SSH keys).
- The deploy job logs in to GHCR with the job `GITHUB_TOKEN` (`packages: read`), so no long-lived PAT is stored on the VPS.
- Never touch Netdata. `nginx-dev.conf` keeps its 19999 block as it is live.
- Commit messages: Conventional Commits, no AI attribution.

## Delivery

- Strategy: `ask-on-risk`. The forecast is about 600 authored changed lines, over the 400 heuristic, so the chain strategy will be asked before any PR. Work-unit commits stay on branch `claude/vpn-configuration-analysis-dfd8d4`.
- TDD: off. There is no project or session TDD config and this is infrastructure, so it uses functional checks.
- RDD: unavailable (`gentle-ai` is not installed), so ordinary checks apply.
- Engram mirror `odd/vps-ghcr-deploy/tasks`: pending, because Engram tools are not available in this session.

## Tasks

- [x] T1 Backend Dockerfile: proven VPS build plus HEALTHCHECK. Route: delegated writer (2+ non-trivial files across tasks). Check: `docker build` succeeds, `dist/src/main.js` exists, `require('bcrypt')` works, prisma CLI is present and `/app/uploads` is owned by nestjs.
- [ ] T2 Version the deploy config. `docker-compose.prod.yml` matches the live VPS (pg18, named uploads volume, required vars, soproyectos namespace). `deploy/vps/` holds the override without hardcoded images or build, the nginx templates, the TLS scripts, the maintenance page and `docker-compose.build.yml` for the local fallback. Check: `docker compose config` with a dummy env lists db/api/frontend only, and the nginx templates are byte-identical to `/etc/nginx/sites-available`.
- [ ] T3 `deploy/vps/deploy.sh`: pull, pre-migration dump, migrate, up, health wait, rollback. Check: `bash -n` and shellcheck.
- [ ] T4 `cd.yml`: workflow_run after CI and workflow_dispatch, GHCR namespace, file sync and SSH deploy. Check: actionlint and YAML parse.
- [ ] T5 Bootstrap script, daily backup timer and runbook. Check: `bash -n` and shellcheck, plus `systemd-analyze verify` if available.

## Acceptance criteria

- A push to `main` with green CI builds and pushes `ghcr.io/soproyectos/grupo-security-office/{api,frontend}:<sha8>`, deploys to the VPS with migrations and passes the smoke test against `vars.DEPLOY_URL`.
- A failed health check rolls the images back to the previous tag and fails the job.
- The local build fallback is documented and works without GitHub.
- A daily gs-db dump with retention exists once the bootstrap has been run.

## Progress

- 2026-10-20: exploration done (cd/ci/compose/Dockerfile mapped, bugs confirmed). Next: T1.
- 2026-10-20 T1 done (commit hash recorded in the next task's commit). `docker build -t gs-api:verify src/backend` succeeded (4m09s, legacy builder). In-image check passed: `dist/src/main.js` present, `require("bcrypt")` loads, prisma 5.22.0 CLI present, `/app/uploads` owner `nestjs`; image config shows `User=nestjs`, `Cmd=[node dist/src/main.js]`, HEALTHCHECK on 127.0.0.1:3000/api/health. Test image removed.
