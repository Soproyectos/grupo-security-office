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
- [x] T2 Version the deploy config. `docker-compose.prod.yml` matches the live VPS (pg18, named uploads volume, required vars, soproyectos namespace). `deploy/vps/` holds the override without hardcoded images or build, the nginx templates, the TLS scripts, the maintenance page and `docker-compose.build.yml` for the local fallback. Check: `docker compose config` with a dummy env lists db/api/frontend only, and the nginx templates are byte-identical to `/etc/nginx/sites-available`.
- [x] T3 `deploy/vps/deploy.sh`: pull, pre-migration dump, migrate, up, health wait, rollback. Check: `bash -n` and shellcheck.
- [x] T4 `cd.yml`: workflow_run after CI and workflow_dispatch, GHCR namespace, file sync and SSH deploy. Check: actionlint and YAML parse.
- [x] T5 Bootstrap script, daily backup timer and runbook. Check: `bash -n` and shellcheck, plus `systemd-analyze verify` if available.

## Acceptance criteria

- A push to `main` with green CI builds and pushes `ghcr.io/soproyectos/grupo-security-office/{api,frontend}:<sha8>`, deploys to the VPS with migrations and passes the smoke test against `vars.DEPLOY_URL`.
- A failed health check rolls the images back to the previous tag and fails the job.
- The local build fallback is documented and works without GitHub.
- A daily gs-db dump with retention exists once the bootstrap has been run.

## Progress

- 2026-10-20: exploration done (cd/ci/compose/Dockerfile mapped, bugs confirmed). Next: T1.
- 2026-10-20 T1 done, commit 71056de. `docker build -t gs-api:verify src/backend` succeeded (4m09s, legacy builder). In-image check passed: `dist/src/main.js` present, `require("bcrypt")` loads, prisma 5.22.0 CLI present, `/app/uploads` owner `nestjs`; image config shows `User=nestjs`, `Cmd=[node dist/src/main.js]`, HEALTHCHECK on 127.0.0.1:3000/api/health. Test image removed.
- 2026-10-20 T2 done, commit ab743ec. `docker compose --env-file <dummy> -p verify -f docker-compose.prod.yml -f deploy/vps/docker-compose.override.yml config --services` lists exactly api, db, frontend (the bundled nginx stays out via the `docker-proxy` profile); the same plus `docker-compose.build.yml` resolves (`gs-api:local`, `gs-frontend:local`, `pull_policy: build`, source-dir contexts); api/frontend ports publish only on 127.0.0.1 (3001, 8080); without MFA_ENCRYPTION_KEY compose fails with the required-variable error. `diff` of nginx-dev.conf and nginx-ip.conf against `/etc/nginx/sites-available/grupo-security-{dev,ip}.conf` is empty; every copied script/config and the two certbot systemd units are byte-identical (`cmp`) to the live files. Dummy env deleted.
- 2026-10-20 T3 done, commit 388b72d. `bash -n deploy/vps/deploy.sh` OK; shellcheck v0.10.0 clean (one justified `SC2016` disable: `$POSTGRES_*` must expand inside the db container). Not run against the live stack. Extra behavioral check against a throwaway `docker` test double (scratchpad, deleted): first deploy without previous tag, normal redeploy with previous tag, unhealthy new tag rolls back to the previous tag and exits 1 (`.deployed-tag` untouched), `migrate deploy` failure leaves containers untouched, failed `pg_restore -l` verification aborts before migrating and leaves no partial dump, pull failure changes nothing, invalid or missing tag is rejected, pre-deploy rotation keeps the newest N, a second concurrent run is rejected by the directory flock, `up` failure with no previous tag exits 1 without rollback. Flags `--wait`, `--wait-timeout`, `--no-recreate`, `run -T` confirmed in `docker compose` 2.40.3.
- 2026-10-20 T4 done, commit 2e44008. `actionlint` 1.7.7 (docker) is clean on `cd.yml` and `ci.yml`; on the whole workflows dir it only reports two pre-existing, unrelated "untrusted input" warnings in `telegram-notify-agents.yml`. PyYAML parse of `cd.yml` OK (jobs build/deploy/notify; triggers workflow_run/workflow_dispatch). `appleboy/scp-action@v0.1.7` (released 2024-01-01) and `appleboy/ssh-action@v1.2.0` input names verified against their `action.yml` at those tags. Not exercised on GitHub (cannot run Actions locally).
- 2026-10-20 T5 done, commit 7494abe. `bash -n` OK and shellcheck v0.10.0 clean on `bootstrap-vps.sh`, `gs-db-backup.sh` and `deploy.sh` (justified SC2016 disables only). `systemd-analyze verify deploy/vps/systemd/gs-db-backup.service`: only the expected "Command /opt/grupo-security/deploy/vps/gs-db-backup.sh is not executable: No such file or directory" (the file lands in /opt via bootstrap seeding or the first CD sync); the timer calendar `*-*-* 03:30:00` parses. Extra behavioral checks: `gs-db-backup.sh` run against a throwaway postgres:18-alpine container (real pg_dump + pg_restore -l verification, 14-day retention removes only old `gs-db-*.dump`, failures for missing container / bad retention / unwritable dir exit 1). `bootstrap-vps.sh` run twice as root inside a throwaway ubuntu:24.04 container with a stub systemctl (creates group/user/key/dirs/units, second run idempotent, refuses non-root, private key and malformed input); a control run proved that a non-owner group member cannot extract the CD tar over dev-owned directories (`Cannot utime`), while `deploy` can after the bootstrap chown. The documented dump-verify, scratch-DB rehearsal and drop/create restore commands were rehearsed on a throwaway postgres container. The live stack, /opt, /etc and systemd were not modified; the bootstrap has NOT been run on the host (needs sudo).
- 2026-10-20 All tasks T1-T5 done on branch `claude/vpn-configuration-analysis-dfd8d4` (commits 71056de, ab743ec, 388b72d, 2e44008, 7494abe). Pending, owned by the user: run `sudo deploy/vps/bootstrap-vps.sh <pubkey>`, create the `production` environment secrets/variables, first CD run, then delivery strategy (chain) before any PR. Not verified end to end: the GitHub workflow runs and the bootstrap on the real host.
- 2026-10-20: host bootstrap applied by the user (`bootstrap-vps.sh` with `~/.ssh/gs-deploy-key.pub`). Verified: SSH login as deploy works, deploy can read .env and write /opt and the backups dirs, gs-db-backup.timer is enabled, and a manual backup as deploy succeeded (415985 bytes, verified). Next: GitHub production environment.
- 2026-10-20: GitHub `production` environment set up by the user (branch rule main; secrets DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY; variable DEPLOY_URL). Not verifiable from here because gh is not installed. Delivery: a single PR (user decision; the commits are already work units, and most lines are byte-identical copies plus the runbook). Commit author `Soporte Grupo Security` confirmed by the user.
