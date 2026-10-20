#!/usr/bin/env bash
# Daily logical backup of the gs-db PostgreSQL container.
#
# Writes a custom-format pg_dump to $GS_BACKUP_DIR/daily/gs-db-<UTC timestamp>.dump,
# verifies it with pg_restore -l and removes daily dumps older than the
# retention window. Exits non-zero on any failure (and then removes nothing),
# so a failing run is visible in `systemctl status gs-db-backup.service`.
#
# Run by gs-db-backup.timer as user "deploy" (group gsops). Safe to run by hand.
#
# Environment overrides:
#   GS_BACKUP_DIR             backup root                 (default /var/backups/grupo-security)
#   GS_BACKUP_RETENTION_DAYS  days to keep daily dumps    (default 14)
#   GS_DB_CONTAINER           database container name     (default gs-db)

set -euo pipefail
export LC_ALL=C

readonly BACKUP_DIR="${GS_BACKUP_DIR:-/var/backups/grupo-security}"
readonly RETENTION_DAYS="${GS_BACKUP_RETENTION_DAYS:-14}"
readonly DB_CONTAINER="${GS_DB_CONTAINER:-gs-db}"
readonly DAILY_DIR="$BACKUP_DIR/daily"

log() { printf '%s [db-backup] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() {
  printf '%s [db-backup] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2
  exit 1
}

[[ $RETENTION_DAYS =~ ^[0-9]+$ ]] || die "GS_BACKUP_RETENTION_DAYS must be a whole number, got '$RETENTION_DAYS'"
command -v docker >/dev/null || die "docker is not installed or not in PATH"
[[ -d $DAILY_DIR && -w $DAILY_DIR ]] ||
  die "$DAILY_DIR is missing or not writable (run deploy/vps/bootstrap-vps.sh first)"
[[ $(docker inspect --format '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true) == true ]] ||
  die "container $DB_CONTAINER is not running"

umask 007
dump_file="$DAILY_DIR/gs-db-$(date -u +%Y%m%dT%H%M%SZ).dump"
partial_file="$dump_file.partial"
trap 'rm -f -- "$partial_file"' EXIT

log "Dumping $DB_CONTAINER to $dump_file"
# Credentials come from the container's own environment, never from this shell
# (the single quotes are intentional: $POSTGRES_* must expand inside the container).
# shellcheck disable=SC2016
docker exec "$DB_CONTAINER" sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$partial_file" ||
  die "pg_dump failed"
docker exec -i "$DB_CONTAINER" pg_restore -l <"$partial_file" >/dev/null ||
  die "the dump failed verification (pg_restore -l)"
mv -f -- "$partial_file" "$dump_file"
log "Dump verified ($(wc -c <"$dump_file") bytes)"

# Retention runs only after a successful dump, so a broken backup never
# deletes the last good ones.
now=$(date +%s)
removed=0
shopt -s nullglob
for old in "$DAILY_DIR"/gs-db-*.dump; do
  if [[ $old != "$dump_file" ]] && (((now - $(stat -c %Y "$old")) > RETENTION_DAYS * 86400)); then
    rm -f -- "$old"
    removed=$((removed + 1))
  fi
done
shopt -u nullglob
log "Retention: removed $removed dump(s) older than $RETENTION_DAYS days"
log "Backup finished"
