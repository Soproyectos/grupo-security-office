#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
SCRIPT_UNDER_TEST=${DEPLOY_SCRIPT_UNDER_TEST:-$ROOT_DIR/deploy/vps/deploy.sh}
TMP_ROOT=$(mktemp -d -t gs-deploy-rollback.XXXXXX)

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }

new_case() {
  CASE_NAME=$1
  CASE_DIR="$TMP_ROOT/$CASE_NAME"
  DEPLOY_DIR="$CASE_DIR/deploy"
  BIN_DIR="$CASE_DIR/bin"
  LOG_FILE="$CASE_DIR/docker.log"
  STATE_DIR="$CASE_DIR/state"
  mkdir -p "$DEPLOY_DIR/deploy/vps" "$DEPLOY_DIR/data" "$CASE_DIR/backups/pre-deploy" "$BIN_DIR" "$STATE_DIR"
  cp "$SCRIPT_UNDER_TEST" "$CASE_DIR/deploy.sh"
  : >"$DEPLOY_DIR/docker-compose.prod.yml"
  : >"$DEPLOY_DIR/deploy/vps/docker-compose.override.yml"
  : >"$DEPLOY_DIR/.env"
  printf 'oldtag\n' >"$DEPLOY_DIR/.deployed-tag"
  cat >"$BIN_DIR/flock" <<'STUB'
#!/usr/bin/env bash
printf 'flock|%s\n' "$*" >>"$HARNESS_LOG"
exit 0
STUB
  cat >"$BIN_DIR/docker" <<'STUB'
#!/usr/bin/env bash
set -eu
printf 'docker|%s|tag=%s\n' "$*" "${IMAGE_TAG:-}" >>"$HARNESS_LOG"
if [[ ${1:-} == inspect ]]; then
  format=${3:-}
  target=${4:-}
  if [[ $format == *Config.Image* ]]; then
    if [[ ${HARNESS_SCENARIO:-} == no_previous ]]; then
      printf 'local/api:local-build\n'
    else
      printf 'ghcr.io/grupo-security-office/api:oldtag\n'
    fi
    exit 0
  fi
  active_tag=$(<"$HARNESS_STATE/active-tag")
  if [[ $active_tag == candidate && ${HARNESS_SCENARIO:-} != normal && ${HARNESS_SCENARIO:-} != migrate_failure ]]; then
    printf 'unhealthy\n'
  else
    printf 'healthy\n'
  fi
  exit 0
fi
if [[ ${1:-} == image && ${2:-} == prune && ${3:-} == -f ]]; then exit 0; fi
[[ ${1:-} == compose ]] || { printf 'unexpected docker command\n' >&2; exit 97; }
args=$(printf '%s ' "$@")
if [[ $args == *' pull api frontend '* ]]; then exit 0; fi
if [[ $args == *' run --rm --no-deps -T api node_modules/.bin/prisma migrate deploy '* ]]; then
  [[ ${HARNESS_SCENARIO:-} != migrate_failure ]] || exit 31
  exit 0
fi
if [[ $args == *' stop -t 30 api '* ]]; then
  [[ ${HARNESS_SCENARIO:-} != stop_failure ]] || exit 32
  printf 'stopped\n' >"$HARNESS_STATE/api-stopped"
  exit 0
fi
if [[ $args == *' exec -T db sh -c '* && $args == *'pg_dump '* ]]; then
  printf 'mock-dump\n'
  exit 0
fi
if [[ $args == *' exec -T db pg_restore -l '* ]]; then exit 0; fi
if [[ $args == *' exec -T db sh -c '* && $args == *'SELECT EXISTS '* ]]; then
  [[ -f $HARNESS_STATE/api-stopped ]] || { printf 'query occurred before API stop\n' >&2; exit 33; }
  case ${HARNESS_SCENARIO:-} in
    query_failure) exit 34 ;;
    bad_output) printf 'f\nextra\n' ;;
    has_nulls) printf 't\n' ;;
    *) printf 'f\n' ;;
  esac
  exit 0
fi
if [[ $args == *' up -d --no-recreate --wait --wait-timeout 120 db '* ]]; then exit 0; fi
if [[ $args == *' up -d --no-deps api frontend '* ]]; then
  if [[ ${IMAGE_TAG:-} == newtag ]]; then
    printf 'candidate\n' >"$HARNESS_STATE/active-tag"
    [[ ${HARNESS_SCENARIO:-} != up_failure ]] || exit 35
  elif [[ ${IMAGE_TAG:-} == oldtag ]]; then
    [[ -f $HARNESS_STATE/api-stopped ]] || { printf 'old API started before stop\n' >&2; exit 36; }
    printf 'previous\n' >"$HARNESS_STATE/active-tag"
  else
    printf 'unexpected up image tag\n' >&2
    exit 98
  fi
  exit 0
fi
printf 'unhandled docker command: %s\n' "$args" >&2
exit 99
STUB
  cat >"$BIN_DIR/sleep" <<'STUB'
#!/usr/bin/env bash
printf 'sleep|%s\n' "$*" >>"$HARNESS_LOG"
exit 0
STUB
  chmod +x "$BIN_DIR/docker" "$BIN_DIR/flock" "$BIN_DIR/sleep"
  export CASE_NAME CASE_DIR DEPLOY_DIR BIN_DIR LOG_FILE STATE_DIR
}

run_deploy() {
  local scenario=$1 expected_status=$2
  set +e
  PATH="$BIN_DIR:$PATH" HARNESS_LOG="$LOG_FILE" HARNESS_STATE="$STATE_DIR" HARNESS_SCENARIO="$scenario" \
    GS_DEPLOY_DIR="$DEPLOY_DIR" GS_BACKUP_DIR="$CASE_DIR/backups" GS_HEALTH_TIMEOUT=2 \
    bash "$CASE_DIR/deploy.sh" newtag >"$CASE_DIR/stdout.log" 2>"$CASE_DIR/stderr.log"
  actual_status=$?
  set -e
  [[ $actual_status == "$expected_status" ]] || {
    cat "$CASE_DIR/stdout.log" "$CASE_DIR/stderr.log" >&2
    fail "$CASE_NAME expected exit $expected_status, got $actual_status"
  }
  if grep -Eqi 'unexpected docker command|unhandled docker command' "$CASE_DIR/stderr.log"; then
    cat "$CASE_DIR/stdout.log" "$CASE_DIR/stderr.log" >&2
    fail "$CASE_NAME invoked an unrecognized Docker command"
  fi
}

line_of() { grep -nF "$1" "$LOG_FILE" | head -n 1 | cut -d: -f1; }
line_of_tagged() { grep -nF "$1|tag=$2" "$LOG_FILE" | head -n 1 | cut -d: -f1; }
assert_before() {
  local first second
  first=$(line_of "$1") || fail "$CASE_NAME missing log entry: $1"
  second=$(line_of "$2") || fail "$CASE_NAME missing log entry: $2"
  ((first < second)) || fail "$CASE_NAME expected '$1' before '$2'"
}
assert_query_before_old_up() {
  local query old_up
  query=$(line_of 'SELECT EXISTS') || fail "$CASE_NAME missing compatibility query"
  old_up=$(line_of_tagged 'up -d --no-deps api frontend' oldtag) || fail "$CASE_NAME missing old-image startup"
  ((query < old_up)) || fail "$CASE_NAME expected compatibility query before old-image startup"
}
assert_no() { ! grep -qF "$1" "$LOG_FILE" || fail "$CASE_NAME unexpected log entry: $1"; }
assert_old_tag_retained() { [[ $(<"$DEPLOY_DIR/.deployed-tag") == oldtag ]] || fail "$CASE_NAME changed deployed tag"; }
assert_no_restore() {
  if grep -F 'pg_restore' "$LOG_FILE" | grep -vF 'pg_restore -l'; then
    fail "$CASE_NAME invoked a database restore"
  fi
}

new_case safe_rollback
run_deploy health_failure 1
assert_before 'stop -t 30 api' 'SELECT EXISTS'
assert_query_before_old_up
grep -qF 'up -d --no-deps api frontend|tag=oldtag' "$LOG_FILE" || fail 'compatible rollback did not start old images'
[[ $(<"$STATE_DIR/active-tag") == previous ]] || fail 'compatible rollback did not restore previous image state'
assert_old_tag_retained
assert_no_restore
pass 'f result stops candidate, checks compatibility, restores previous images, and retains database/tag'

new_case partial_up_failure
run_deploy up_failure 1
assert_before 'stop -t 30 api' 'SELECT EXISTS'
assert_query_before_old_up
[[ $(<"$STATE_DIR/active-tag") == previous ]] || fail 'partial up failure did not safely restore previous images'
assert_old_tag_retained
assert_no_restore
pass 'partial api/frontend recreation failure also passes through the compatibility gate'

for scenario in has_nulls query_failure bad_output; do
  new_case "blocked_$scenario"
  run_deploy "$scenario" 1
  assert_before 'stop -t 30 api' 'SELECT EXISTS'
  assert_no 'up -d --no-deps api frontend|tag=oldtag'
  [[ -f $STATE_DIR/api-stopped ]] || fail "$scenario did not leave candidate api stopped"
  [[ $(<"$STATE_DIR/active-tag") == candidate ]] || fail "$scenario changed image state"
  assert_old_tag_retained
  assert_no_restore
  pass "$scenario blocks old images, leaves candidate api stopped, and preserves database/tag"
done

new_case stop_failure
run_deploy stop_failure 1
assert_no 'SELECT EXISTS'
assert_no 'up -d --no-deps api frontend|tag=oldtag'
assert_old_tag_retained
pass 'stop failure skips compatibility query and previous images'

new_case migration_failure
run_deploy migrate_failure 1
assert_no 'stop -t 30 api'
assert_no 'SELECT EXISTS'
assert_no 'up -d --no-deps api frontend|tag=oldtag'
assert_old_tag_retained
pass 'migration failure does not enter rollback gate'

new_case no_previous_tag
rm -f "$DEPLOY_DIR/.deployed-tag"
run_deploy no_previous 1
assert_no 'stop -t 30 api'
assert_no 'SELECT EXISTS'
assert_no 'up -d --no-deps api frontend|tag=oldtag'
[[ $(<"$STATE_DIR/active-tag") == candidate ]] || fail 'no-previous-tag case unexpectedly changed candidate state'
pass 'missing previous tag skips compatibility gate and leaves containers unchanged by rollback'

new_case normal_deploy
run_deploy normal 0
[[ $(<"$DEPLOY_DIR/.deployed-tag") == newtag ]] || fail 'normal deploy did not record new tag'
assert_no 'stop -t 30 api'
assert_no 'SELECT EXISTS'
pass 'normal deploy records new tag without running rollback gate'

printf 'All deploy rollback harness scenarios passed.\n'
printf 'Harness artifacts retained at %s\n' "$TMP_ROOT"
