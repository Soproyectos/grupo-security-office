#!/usr/bin/env bash
# Deploy the Grupo Security web stack on the VPS from pre-built GHCR images.
#
# Usage: deploy.sh <image-tag>
#
# Runs ON the VPS, from any directory. Steps:
#   1. pull the api and frontend images for <image-tag>
#   2. take a verified pg_dump of gs-db (pre-migration safety net)
#   3. apply Prisma migrations with the new api image
#   4. recreate api and frontend and wait until both are healthy
#   5. on health failure, put the previous image tag back and exit 1
#
# Database migrations are forward-only: a rollback restores the previous
# images but NOT the schema. Restore the pre-deploy dump if that is needed.
#
# Environment overrides:
#   GS_DEPLOY_DIR       deploy directory            (default /opt/grupo-security)
#   GS_BACKUP_DIR       backup root                 (default /var/backups/grupo-security)
#   GS_PREDEPLOY_KEEP   pre-deploy dumps to keep    (default 10)
#   GS_HEALTH_TIMEOUT   seconds to wait for health  (default 180)

set -euo pipefail
export LC_ALL=C

readonly DEPLOY_DIR="${GS_DEPLOY_DIR:-/opt/grupo-security}"
readonly BACKUP_DIR="${GS_BACKUP_DIR:-/var/backups/grupo-security}"
readonly PREDEPLOY_KEEP="${GS_PREDEPLOY_KEEP:-10}"
readonly HEALTH_TIMEOUT="${GS_HEALTH_TIMEOUT:-180}"
readonly API_CONTAINER="gs-api"
readonly FRONTEND_CONTAINER="gs-frontend"
readonly TAG_FILE=".deployed-tag"

log() { printf '%s [deploy] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
err() { printf '%s [deploy] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() {
  err "$*"
  exit 1
}

valid_tag() { [[ $1 =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; }

# Prints healthy | unhealthy | starting | <container state> | missing.
container_health() {
  docker inspect --format \
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$1" 2>/dev/null || echo missing
}

# Succeeds once api and frontend are both healthy; fails fast on "unhealthy".
wait_healthy() {
  local deadline=$((SECONDS + $1)) name status all_healthy
  while ((SECONDS < deadline)); do
    all_healthy=1
    for name in "$API_CONTAINER" "$FRONTEND_CONTAINER"; do
      status=$(container_health "$name")
      case $status in
        healthy) ;;
        unhealthy)
          err "$name reports unhealthy"
          return 1
          ;;
        *) all_healthy=0 ;;
      esac
    done
    if ((all_healthy)); then
      return 0
    fi
    sleep 5
  done
  err "timed out after $1s waiting for $API_CONTAINER and $FRONTEND_CONTAINER to become healthy"
  return 1
}

# Previous tag: last successful deploy, else the tag of the running GHCR api image.
resolve_previous_tag() {
  local tag="" ref=""
  if [[ -r $TAG_FILE ]]; then
    tag=$(<"$TAG_FILE")
  fi
  if ! valid_tag "$tag"; then
    tag=""
  fi
  if [[ -z $tag ]]; then
    ref=$(docker inspect --format '{{.Config.Image}}' "$API_CONTAINER" 2>/dev/null || true)
    case $ref in
      */grupo-security-office/api:*) tag=${ref##*:} ;;
    esac
  fi
  printf '%s' "$tag"
}

# Keeps the newest PREDEPLOY_KEEP dumps; names start with a UTC timestamp.
rotate_predeploy_dumps() {
  local dumps=() excess
  shopt -s nullglob
  dumps=("$predeploy_dir"/*.dump)
  shopt -u nullglob
  excess=$((${#dumps[@]} - PREDEPLOY_KEEP))
  if ((excess > 0)); then
    log "Rotating pre-deploy dumps: removing $excess old file(s), keeping $PREDEPLOY_KEEP"
    rm -f -- "${dumps[@]:0:excess}"
  fi
}

rollback_and_exit() {
  err "$1"
  if [[ -n $rollback_tag ]]; then
    log "Rolling back api and frontend to image tag $rollback_tag"
    if IMAGE_TAG=$rollback_tag "${COMPOSE[@]}" up -d --no-deps api frontend && wait_healthy 120; then
      log "Rollback finished: api and frontend are healthy on $rollback_tag"
    else
      err "Rollback to $rollback_tag did not become healthy; manual intervention is required"
    fi
  else
    err "No previous image tag is known, so nothing was rolled back; containers are left as they are"
  fi
  err "Database migrations were NOT rolled back; the schema may already be at the new version"
  err "Pre-deploy dump (restore it only if the schema must go back): $dump_file"
  exit 1
}

# ---- Arguments and environment ----------------------------------------------

if (($# != 1)); then
  die "usage: $0 <image-tag>"
fi
new_tag=$1
valid_tag "$new_tag" || die "invalid image tag: '$new_tag'"

command -v docker >/dev/null || die "docker is not installed or not in PATH"
cd "$DEPLOY_DIR" || die "cannot enter deploy directory $DEPLOY_DIR"
[[ -f docker-compose.prod.yml ]] || die "docker-compose.prod.yml not found in $DEPLOY_DIR"
[[ -f deploy/vps/docker-compose.override.yml ]] || die "deploy/vps/docker-compose.override.yml not found in $DEPLOY_DIR"
[[ -r .env ]] || die ".env is missing or not readable in $DEPLOY_DIR"

# Persistent exchange directory for audited manifests, dry-run reports and
# identity backups. The import job runs with the host deploy uid/gid, so files
# remain manageable without making this directory world-writable.
mkdir -p "$DEPLOY_DIR/data/imports"
chmod 2770 "$DEPLOY_DIR/data/imports"

# Single run at a time. The lock is held on the directory itself, so it needs
# only read access (no lock file that another user could own).
exec 9<"$DEPLOY_DIR"
flock -n 9 || die "another deploy is already running"

readonly COMPOSE=(docker compose -p grupo-security
  -f docker-compose.prod.yml
  -f deploy/vps/docker-compose.override.yml)

predeploy_dir="$BACKUP_DIR/pre-deploy"
mkdir -p "$predeploy_dir" 2>/dev/null || true
[[ -d $predeploy_dir && -w $predeploy_dir ]] ||
  die "backup directory $predeploy_dir is missing or not writable (run bootstrap-vps.sh first)"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
dump_file="$predeploy_dir/$timestamp-$new_tag.dump"
partial_file="$predeploy_dir/.$timestamp-$new_tag.dump.partial"
trap 'rm -f -- "$partial_file"' EXIT

previous_tag=$(resolve_previous_tag)
rollback_tag=""
if [[ -z $previous_tag ]]; then
  log "No previous GHCR image tag found (first deploy or locally built images): rollback is unavailable"
elif [[ $previous_tag == "$new_tag" ]]; then
  log "Previous tag equals the requested tag ($new_tag): redeploying the same images"
else
  rollback_tag=$previous_tag
  log "Previous image tag: $previous_tag"
fi
log "Deploying image tag: $new_tag"

export IMAGE_TAG=$new_tag

# ---- 1. Pull ----------------------------------------------------------------

log "Pulling api and frontend images"
"${COMPOSE[@]}" pull api frontend ||
  die "image pull failed (check GHCR login, package access and that tag $new_tag exists); nothing was changed"

# ---- 2. Pre-migration dump --------------------------------------------------

log "Making sure the database container is running"
"${COMPOSE[@]}" up -d --no-recreate --wait --wait-timeout 120 db ||
  die "database container did not become healthy; nothing was changed"

log "Dumping the database before migrating: $dump_file"
umask 007
# Credentials come from the container's own environment, never from this shell
# (the single quotes are intentional: $POSTGRES_* must expand inside the container).
# shellcheck disable=SC2016
"${COMPOSE[@]}" exec -T db sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$partial_file" ||
  die "pg_dump failed; aborting before any migration"
"${COMPOSE[@]}" exec -T db pg_restore -l <"$partial_file" >/dev/null ||
  die "the pre-deploy dump failed verification (pg_restore -l); aborting before any migration"
mv -f -- "$partial_file" "$dump_file"
log "Dump verified ($(wc -c <"$dump_file") bytes)"
rotate_predeploy_dumps

# ---- 3. Migrate -------------------------------------------------------------

log "Applying Prisma migrations with the new api image"
if ! "${COMPOSE[@]}" run --rm --no-deps -T api node_modules/.bin/prisma migrate deploy; then
  err "prisma migrate deploy failed; the running api and frontend were not touched"
  err "Pre-deploy dump: $dump_file"
  exit 1
fi

# ---- 4. Switch containers and wait for health ---------------------------------

log "Recreating api and frontend"
"${COMPOSE[@]}" up -d --no-deps api frontend ||
  rollback_and_exit "docker compose up failed for tag $new_tag"

log "Waiting up to ${HEALTH_TIMEOUT}s for $API_CONTAINER and $FRONTEND_CONTAINER to be healthy"
wait_healthy "$HEALTH_TIMEOUT" ||
  rollback_and_exit "tag $new_tag did not become healthy"

# ---- 5. Record and clean up ---------------------------------------------------

printf '%s\n' "$new_tag" >"$TAG_FILE.tmp"
mv -f -- "$TAG_FILE.tmp" "$TAG_FILE"
log "Recorded deployed tag $new_tag in $DEPLOY_DIR/$TAG_FILE"

docker image prune -f >/dev/null || err "docker image prune failed (ignored)"

log "Deploy finished: tag $new_tag is live and healthy"
docker inspect --format '{{.Name}} -> {{.Config.Image}} ({{.State.Status}})' \
  "$API_CONTAINER" "$FRONTEND_CONTAINER"
