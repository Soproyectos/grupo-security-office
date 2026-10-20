#!/usr/bin/env bash
# Audited production import for the official 39-list library manifest.
# Usage: import-biblioteca.sh dry-run|apply

set -euo pipefail
export LC_ALL=C

readonly DEPLOY_DIR="${GS_DEPLOY_DIR:-/opt/grupo-security}"
readonly BACKUP_DIR="${GS_BACKUP_DIR:-/var/backups/grupo-security}"
readonly IMPORT_DIR="$DEPLOY_DIR/data/imports"
readonly MANIFEST_NAME="biblioteca-import-39-listas.json"
readonly CHECKSUM_NAME="biblioteca-import-39-listas.sha256"
readonly API_CONTAINER="gs-api"
readonly DB_CONTAINER="gs-db"
readonly EXPECTED_PRODUCTS=5038
readonly CONFIRM_TOKEN="IMPORTAR-BIBLIOTECA-2026"

log() { printf '%s [biblioteca] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() {
  printf '%s [biblioteca] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2
  exit 1
}

if (($# != 1)); then
  die "usage: $0 dry-run|apply"
fi
mode=$1
case $mode in
  dry-run | apply) ;;
  *) die "mode must be dry-run or apply" ;;
esac

command -v docker >/dev/null || die "docker is not installed"
command -v sha256sum >/dev/null || die "sha256sum is not installed"
cd "$DEPLOY_DIR" || die "cannot enter $DEPLOY_DIR"
[[ -r "$IMPORT_DIR/$MANIFEST_NAME" ]] || die "missing $IMPORT_DIR/$MANIFEST_NAME"
[[ -r "$IMPORT_DIR/$CHECKSUM_NAME" ]] || die "missing $IMPORT_DIR/$CHECKSUM_NAME"

# Serialize against deploy.sh and any other library import.
exec 9<"$DEPLOY_DIR"
flock -n 9 || die "another deploy or library import is running"

log "Verifying the versioned manifest and audit report checksums"
(cd "$IMPORT_DIR" && sha256sum -c "$CHECKSUM_NAME") || die "checksum verification failed"

[[ $(docker inspect --format '{{.State.Health.Status}}' "$API_CONTAINER" 2>/dev/null || true) == healthy ]] ||
  die "$API_CONTAINER is not healthy"
[[ $(docker inspect --format '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true) == true ]] ||
  die "$DB_CONTAINER is not running"

host_uid=$(id -u)
host_gid=$(id -g)
container_manifest="/app/biblioteca/$MANIFEST_NAME"

run_import() {
  docker exec -u "$host_uid:$host_gid" -w /app "$API_CONTAINER" \
    node dist/prisma/import-biblioteca.js \
    "--manifest=$container_manifest" \
    --artifacts-dir=/app/biblioteca \
    "$@"
}

latest_report() {
  local prefix=$1
  local files=()
  shopt -s nullglob
  files=("$IMPORT_DIR"/"$prefix"-*.json)
  shopt -u nullglob
  ((${#files[@]} > 0)) || die "no $prefix report was generated"
  printf '%s' "${files[-1]}"
}

validate_report() {
  local report=$1 expected_mode=$2
  local container_report="/app/biblioteca/${report##*/}"
  docker exec -u "$host_uid:$host_gid" "$API_CONTAINER" node -e '
    const fs = require("fs");
    const [file, expectedMode, expectedCount] = process.argv.slice(1);
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const totals = report.totals || {};
    const acted = (totals.updates || 0) + (totals.creates || 0) + (totals.skipped || 0) + (totals.errors || 0);
    if (report.mode !== expectedMode || totals.valid !== Number(expectedCount) || totals.invalid !== 0 || totals.errors !== 0 || acted !== totals.valid) {
      console.error(JSON.stringify({ mode: report.mode, totals, acted }));
      process.exit(1);
    }
    console.log(JSON.stringify({ mode: report.mode, totals, acted }));
  ' "$container_report" "$expected_mode" "$EXPECTED_PRODUCTS" || die "import report validation failed: $report"
  log "Validated report: $report"
  printf 'IMPORT_REPORT=%s\n' "$report"
}

log "Running mandatory dry-run"
run_import
dry_report=$(latest_report import-dry-run)
validate_report "$dry_report" dry-run

if [[ $mode == dry-run ]]; then
  log "Dry-run finished; database was not modified"
  exit 0
fi

preimport_dir="$BACKUP_DIR/pre-import"
mkdir -p "$preimport_dir"
chmod 2770 "$preimport_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
dump_file="$preimport_dir/biblioteca-$timestamp.dump"
partial_file="$dump_file.partial"
trap 'rm -f -- "$partial_file"' EXIT

log "Creating verified database backup: $dump_file"
# Credentials expand only inside the database container.
# shellcheck disable=SC2016
docker exec "$DB_CONTAINER" sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$partial_file" ||
  die "pg_dump failed; import was not applied"
docker exec -i "$DB_CONTAINER" pg_restore -l <"$partial_file" >/dev/null ||
  die "backup verification failed; import was not applied"
mv -f -- "$partial_file" "$dump_file"
log "Backup verified ($(wc -c <"$dump_file") bytes)"

log "Applying the official manifest"
run_import --apply "--confirm=$CONFIRM_TOKEN"
apply_report=$(latest_report import-report)
validate_report "$apply_report" apply

log "Import finished successfully"
printf 'DATABASE_BACKUP=%s\n' "$dump_file"
