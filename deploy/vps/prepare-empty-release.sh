#!/usr/bin/env bash
# Cut over from the current database to the already-migrated empty catalog.
# This script never creates the database, deploys an API, or removes a database.
# Run only on the VPS, after the reviewed candidate and bootstrap directory exist.

set -Eeuo pipefail
export LC_ALL=C

readonly DEPLOY_DIR="${GS_DEPLOY_DIR:-/opt/grupo-security}"
readonly BACKUP_ROOT="${GS_BACKUP_DIR:-/var/backups/grupo-security}"
readonly BACKUP_DIR="$BACKUP_ROOT/empty-catalog-20261105"
readonly BOOTSTRAP_DIR="$DEPLOY_DIR/approved-bootstrap-20261105"
readonly SOURCE_DB="grupo_security"
readonly CANDIDATE_DB="gs_empty_20261105_release"
readonly ARCHIVE_DB="gs_archive_20261105_preempty"
readonly IMAGE_TAG="96670843"
readonly REQUIRED_MIGRATIONS=(
  20261028120000_product_internal_notes
  20261029150000_library_subcategories
  20261029150100_library_spec_dictionary
  20261029150200_library_product_sources
  20261029150300_library_spec_value_state
  20261029150400_library_classification_optional
)
readonly FORBIDDEN_MIGRATION="20261104090000_remove_legacy_storefront_banners"
readonly TAXONOMY_SHA256="04c69e3102f6459b2b1aa143fb2f6437db868c53e90917e47e30abba827d5cd5"

PHASE="preflight"
API_STOPPED=0
SWAP_COMMITTED=0

log() { printf '%s [empty-release] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
err() { printf '%s [empty-release] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { err "$1"; exit 1; }

readonly COMPOSE=(docker compose -p grupo-security
  -f docker-compose.prod.yml
  -f deploy/vps/docker-compose.override.yml)

psql_db() {
  local db=$1
  shift
  "${COMPOSE[@]}" exec -T db sh -c \
    'db=$1; shift; exec psql -v ON_ERROR_STOP=1 -XAtq -U "$POSTGRES_USER" -d "$db" "$@"' \
    sh "$db" "$@"
}

backup_database() {
  local database=$1 label=$2 stamp destination partial bytes sha256
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  destination="$BACKUP_DIR/${stamp}-${label}.dump"
  partial="$destination.partial"
  [[ ! -e $destination && ! -e $partial ]] || die "backup path already exists; no file was overwritten"
  log "Backing up database $database to $destination"
  if ! "${COMPOSE[@]}" exec -T db sh -c \
    'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$1"' sh "$database" >"$partial" 2>/dev/null; then
    die "database backup failed; any partial dump was retained"
  fi
  if ! "${COMPOSE[@]}" exec -T db pg_restore -l <"$partial" >/dev/null 2>&1; then
    die "database backup verification failed; the dump was retained for diagnosis"
  fi
  mv -- "$partial" "$destination"
  bytes=$(wc -c <"$destination" | tr -d '[:space:]')
  sha256=$(sha256sum "$destination" | awk '{print $1}')
  log "Verified backup: ${bytes} bytes; SHA-256 ${sha256}"
}

database_layout() {
  psql_db postgres -c \
    "SELECT CASE
       WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'grupo_security' AND datallowconn)
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'gs_empty_20261105_release' AND datallowconn)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'gs_archive_20261105_preempty') THEN 'original'
       WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'grupo_security' AND datallowconn)
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'gs_archive_20261105_preempty' AND NOT datallowconn)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'gs_empty_20261105_release') THEN 'swapped'
       ELSE 'unknown' END"
}

restart_original_api_if_safe() {
  local layout status
  layout=$(database_layout 2>/dev/null) || layout=unknown
  if [[ $layout != original ]]; then
    err "Database names are not in the original layout; the API remains stopped for manual recovery"
    return 1
  fi
  status=$(docker inspect --format '{{.State.Status}}' gs-api 2>/dev/null) || status=unknown
  case $status in
    exited|created)
      if "${COMPOSE[@]}" start api >/dev/null 2>&1; then
        log "The original database is intact; the previous API container was restarted"
      else
        err "The original database is intact, but the previous API could not be restarted"
        return 1
      fi
      ;;
    running)
      log "The previous API is already running against the original database"
      ;;
    *)
      err "Database layout is original but API state is uncertain; manual intervention is required"
      return 1
      ;;
  esac
}

on_exit() {
  local status=$?
  if ((status != 0 && API_STOPPED == 1 && SWAP_COMMITTED == 0)); then
    err "Cutover did not commit; checking whether the original database can be resumed"
    restart_original_api_if_safe || err "Do not restart or deploy another image until database state is checked"
  elif ((status != 0 && SWAP_COMMITTED == 1)); then
    err "Database names are swapped; the API remains stopped for the approved deployment/recovery step"
  fi
  return "$status"
}
trap on_exit EXIT

if (($# != 1)) || [[ $1 != cutover ]]; then
  die "usage: $0 cutover"
fi
command -v docker >/dev/null || die "docker is not installed or not in PATH"
command -v flock >/dev/null || die "flock is not installed or not in PATH"
[[ -d $DEPLOY_DIR && -r $DEPLOY_DIR ]] || die "deploy directory is missing or not readable"
cd "$DEPLOY_DIR" || die "cannot enter deploy directory"
[[ -f docker-compose.prod.yml && -f deploy/vps/docker-compose.override.yml ]] || die "the production Compose files are missing"
[[ -d $BACKUP_DIR && -w $BACKUP_DIR ]] || die "the approved backup directory is missing or not writable"
[[ -d $BOOTSTRAP_DIR && -r $BOOTSTRAP_DIR && ! -L $BOOTSTRAP_DIR ]] || die "the reviewed bootstrap directory is missing"
[[ -f $BOOTSTRAP_DIR/prepare-empty-catalog.cjs && ! -L $BOOTSTRAP_DIR/prepare-empty-catalog.cjs ]] || die "the reviewed catalog runner is missing"
[[ -f $BOOTSTRAP_DIR/seed-data/library-taxonomy-9-66.json && ! -L $BOOTSTRAP_DIR/seed-data/library-taxonomy-9-66.json ]] || die "the reviewed taxonomy manifest is missing"
taxonomy_hash=$(sha256sum "$BOOTSTRAP_DIR/seed-data/library-taxonomy-9-66.json" | awk '{print $1}')
[[ $taxonomy_hash == "$TAXONOMY_SHA256" ]] || die "the reviewed taxonomy manifest hash does not match"

# Serialize this operation with deploy.sh; no lock file is created or changed.
exec 9<"$DEPLOY_DIR"
flock -n 9 || die "another deploy or database cutover is already running"

export IMAGE_TAG
log "Using fixed API image tag $IMAGE_TAG"
docker image inspect "ghcr.io/soproyectos/grupo-security-office/api:$IMAGE_TAG" >/dev/null 2>&1 || die "the approved API image is not present locally"

api_database=$("${COMPOSE[@]}" run --rm --no-deps -T --pull never api node -e \
  'try { const u = new URL(process.env.DATABASE_URL); const db = decodeURIComponent(u.pathname.replace(/^\//, "")); if (!db) process.exit(2); process.stdout.write(db) } catch { process.exit(2) }' 2>/dev/null) || die "could not verify the database name configured for the API"
[[ $api_database == "$SOURCE_DB" ]] || die "the API is not configured for the expected source database"

source_database=$(psql_db "$SOURCE_DB" -c 'SELECT current_database()' 2>/dev/null) || die "could not verify the source database"
[[ $source_database == "$SOURCE_DB" ]] || die "the source database name is not the expected production database"
candidate_exists=$(psql_db postgres -c "SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'gs_empty_20261105_release')" 2>/dev/null) || die "could not verify the prepared candidate"
[[ $candidate_exists == t ]] || die "the prepared candidate database does not exist"
layout=$(database_layout 2>/dev/null) || layout=unknown
[[ $layout == original ]] || die "database names or connection state do not match the expected pre-cutover layout"

# Check migration history and the old backup before entering maintenance.
migration_state=$(psql_db "$CANDIDATE_DB" -c \
  "SELECT CASE
     WHEN COUNT(DISTINCT migration_name) FILTER (WHERE migration_name IN (
       '20261028120000_product_internal_notes', '20261029150000_library_subcategories',
       '20261029150100_library_spec_dictionary', '20261029150200_library_product_sources',
       '20261029150300_library_spec_value_state', '20261029150400_library_classification_optional'
     ) AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND logs IS NULL) = 6
      AND COUNT(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL OR logs IS NOT NULL) = 0
      AND NOT EXISTS (SELECT 1 FROM public.\"_prisma_migrations\" WHERE migration_name = '20261104090000_remove_legacy_storefront_banners')
     THEN 'ready' ELSE 'not_ready' END FROM public.\"_prisma_migrations\"" 2>/dev/null) || die "could not verify candidate migration history"
[[ $migration_state == ready ]] || die "the candidate migrations are incomplete, failed, or include a forbidden migration"

shopt -s nullglob
preparation_backups=("$BACKUP_DIR"/*-authorized-preparation.dump)
shopt -u nullglob
(( ${#preparation_backups[@]} > 0 )) || die "the verified pre-creation backup is missing"
for backup in "${preparation_backups[@]}"; do
  [[ -f $backup && ! -L $backup ]] || die "the pre-creation backup path is not a regular file"
  "${COMPOSE[@]}" exec -T db pg_restore -l <"$backup" >/dev/null 2>&1 || die "the pre-creation backup failed verification"
done

PHASE="cutover"
log "Stopping only the API container; the database and frontend stay running"
API_STOPPED=1
"${COMPOSE[@]}" stop -t 30 api >/dev/null || die "could not stop the API container"
api_status=$(docker inspect --format '{{.State.Status}}' gs-api 2>/dev/null) || api_status=unknown
[[ $api_status == exited ]] || die "API container is not confirmed stopped"

backup_database "$SOURCE_DB" "source-final"

log "Running the reviewed Super Admin and taxonomy transfer into the candidate"
"${COMPOSE[@]}" run --rm --no-deps -T --pull never \
  -v "$BOOTSTRAP_DIR:/app/approved-bootstrap:ro" \
  -e NODE_PATH=/app/node_modules \
  -e GS_EMPTY_CATALOG_APPROVED="$CANDIDATE_DB" \
  api node /app/approved-bootstrap/prepare-empty-catalog.cjs --target "$CANDIDATE_DB" --apply ||
  die "the reviewed transfer failed; the original database remains active and API restart will be attempted"

backup_database "$CANDIDATE_DB" "candidate-before-rename"

log "Blocking connections and renaming both databases in one transaction"
if ! psql_db postgres >/dev/null 2>&1 <<'SQL'
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '10s';
ALTER DATABASE "grupo_security" WITH ALLOW_CONNECTIONS false;
ALTER DATABASE "gs_empty_20261105_release" WITH ALLOW_CONNECTIONS false;
DO $cutover_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_stat_activity
    WHERE datname IN ('grupo_security', 'gs_empty_20261105_release')
      AND pid <> pg_backend_pid()
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_prepared_xacts
    WHERE database IN ('grupo_security', 'gs_empty_20261105_release')
  ) THEN
    RAISE EXCEPTION 'database cutover blocked by active clients or prepared transactions';
  END IF;
END
$cutover_guard$;
ALTER DATABASE "grupo_security" RENAME TO "gs_archive_20261105_preempty";
ALTER DATABASE "gs_empty_20261105_release" RENAME TO "grupo_security";
ALTER DATABASE "grupo_security" WITH ALLOW_CONNECTIONS true;
COMMIT;
SQL
then
  die "database rename transaction failed; names were rolled back if the transaction did not commit"
fi
SWAP_COMMITTED=1

log "Database cutover committed; API remains stopped"
log "Next approved step: deploy API/frontend with image tag $IMAGE_TAG and verify health"
