#!/usr/bin/env bash
# One-time VPS bootstrap for CI/CD deploys and database backups.
#
# Usage (as root, once; safe to re-run):
#   sudo deploy/vps/bootstrap-vps.sh <path-to-deploy-public-key-file>
#
# What it does:
#   - creates the group "gsops" and the login user "deploy" (docker + gsops groups)
#   - adds the operator user (default: the sudo caller, else "dev") to "gsops"
#   - installs the deploy public key for "deploy" (~/.ssh/authorized_keys)
#   - makes /opt/grupo-security writable by the group "gsops" (setgid), owned by
#     "deploy" so the CD file sync can replace it; .env keeps its owner and
#     becomes mode 640 (readable by the group)
#   - creates /var/backups/grupo-security/{daily,pre-deploy} (root:gsops, 2770)
#   - installs and enables the gs-db-backup systemd timer
#
# What it never touches: sshd_config, the firewall, Netdata, nginx, running
# containers, /opt/grupo-security/.env contents and /opt/grupo-security/backups.
#
# Environment overrides:
#   GS_DEPLOY_DIR   deploy directory   (default /opt/grupo-security)
#   GS_BACKUP_DIR   backup root        (default /var/backups/grupo-security)
#   GS_OPS_USER     operator user to add to gsops (default: $SUDO_USER, else dev)

set -euo pipefail
export LC_ALL=C

readonly DEPLOY_DIR="${GS_DEPLOY_DIR:-/opt/grupo-security}"
readonly BACKUP_DIR="${GS_BACKUP_DIR:-/var/backups/grupo-security}"
readonly DEPLOY_USER="deploy"
readonly OPS_GROUP="gsops"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

done_items=()
kept_items=()
did() { done_items+=("$*"); }
kept() { kept_items+=("$*"); }
log() { printf '[bootstrap] %s\n' "$*"; }
die() {
  printf '[bootstrap] ERROR: %s\n' "$*" >&2
  exit 1
}

# Succeeds when <user> is a member of <group> (no pipes: safe under pipefail).
in_group() { [[ " $(id -nG "$1") " == *" $2 "* ]]; }

# ---- Preconditions ----------------------------------------------------------

if ((EUID != 0)); then
  die "run this script as root: sudo $0 <public-key-file>"
fi
if (($# != 1)); then
  die "usage: sudo $0 <path-to-deploy-public-key-file>"
fi
pubkey_file=$1
[[ -f $pubkey_file && -r $pubkey_file ]] || die "public key file not found or unreadable: $pubkey_file"

ops_user="${GS_OPS_USER:-${SUDO_USER:-dev}}"
if [[ $ops_user == root ]]; then
  ops_user=dev
fi

for unit in gs-db-backup.service gs-db-backup.timer; do
  [[ -f $SCRIPT_DIR/systemd/$unit ]] || die "missing $SCRIPT_DIR/systemd/$unit"
done
[[ -f $SCRIPT_DIR/gs-db-backup.sh ]] || die "missing $SCRIPT_DIR/gs-db-backup.sh"
getent group docker >/dev/null || die "the docker group does not exist; is Docker installed?"

# A public key file holds one "<type> <base64> [comment]" line. Reject anything
# else, and in particular a private key pasted by mistake.
[[ $(<"$pubkey_file") != *"PRIVATE KEY"* ]] || die "$pubkey_file looks like a PRIVATE key; pass the .pub file"
key_line=""
while IFS= read -r line || [[ -n $line ]]; do
  [[ -z ${line//[[:space:]]/} || $line == \#* ]] && continue
  [[ -z $key_line ]] || die "$pubkey_file must contain exactly one public key"
  key_line=$line
done <"$pubkey_file"
[[ -n $key_line ]] || die "$pubkey_file contains no public key"
read -r key_type key_blob _ <<<"$key_line"
case $key_type in
  ssh-ed25519 | ssh-rsa | ecdsa-sha2-nistp256 | ecdsa-sha2-nistp384 | ecdsa-sha2-nistp521 | sk-ssh-ed25519@openssh.com) ;;
  *) die "unsupported or malformed public key type: '$key_type'" ;;
esac
[[ -n ${key_blob:-} ]] || die "malformed public key (no key material)"
key_fingerprint=$(ssh-keygen -l -f "$pubkey_file" 2>/dev/null) || die "ssh-keygen could not parse $pubkey_file"

# ---- Group and users ----------------------------------------------------------

if getent group "$OPS_GROUP" >/dev/null; then
  kept "group $OPS_GROUP already exists"
else
  groupadd --system "$OPS_GROUP"
  did "created group $OPS_GROUP"
fi

if id "$DEPLOY_USER" >/dev/null 2>&1; then
  kept "user $DEPLOY_USER already exists"
else
  useradd --create-home --shell /bin/bash --comment "Grupo Security CD deploy" "$DEPLOY_USER"
  # "*" (not "!") keeps password logins impossible without marking the account
  # locked, which some sshd setups reject even for key-based logins.
  usermod --password '*' "$DEPLOY_USER"
  did "created user $DEPLOY_USER (bash shell, home, no password)"
fi

for group in docker "$OPS_GROUP"; do
  if in_group "$DEPLOY_USER" "$group"; then
    kept "$DEPLOY_USER is already in group $group"
  else
    usermod --append --groups "$group" "$DEPLOY_USER"
    did "added $DEPLOY_USER to group $group"
  fi
done

if id "$ops_user" >/dev/null 2>&1; then
  if in_group "$ops_user" "$OPS_GROUP"; then
    kept "$ops_user is already in group $OPS_GROUP"
  else
    usermod --append --groups "$OPS_GROUP" "$ops_user"
    did "added $ops_user to group $OPS_GROUP (takes effect at the next login)"
  fi
else
  log "WARNING: operator user '$ops_user' does not exist; set GS_OPS_USER and re-run to add it to $OPS_GROUP"
fi

# ---- SSH key ------------------------------------------------------------------

deploy_home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
[[ -n $deploy_home && -d $deploy_home ]] || die "home directory of $DEPLOY_USER not found"
ssh_dir="$deploy_home/.ssh"
auth_keys="$ssh_dir/authorized_keys"

install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$ssh_dir"
touch "$auth_keys"
key_present=0
while IFS= read -r line || [[ -n $line ]]; do
  if [[ $line == *" $key_blob"* ]]; then
    key_present=1
    break
  fi
done <"$auth_keys"
if ((key_present)); then
  kept "deploy key already in $auth_keys"
else
  # The key only needs a shell for scp/ssh commands; no forwarding of any kind.
  printf 'no-port-forwarding,no-agent-forwarding,no-X11-forwarding %s\n' "$key_line" >>"$auth_keys"
  did "installed deploy key in $auth_keys ($key_fingerprint)"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$auth_keys"
chmod 0600 "$auth_keys"

# ---- Deploy directory -----------------------------------------------------------

install -d -m 2770 -o "$DEPLOY_USER" -g "$OPS_GROUP" "$DEPLOY_DIR/deploy/vps"
# Seed the backup script so the timer works before the first CD file sync.
if [[ ! -e $DEPLOY_DIR/deploy/vps/gs-db-backup.sh ]]; then
  install -m 0755 -o "$DEPLOY_USER" -g "$OPS_GROUP" "$SCRIPT_DIR/gs-db-backup.sh" "$DEPLOY_DIR/deploy/vps/gs-db-backup.sh"
  did "seeded $DEPLOY_DIR/deploy/vps/gs-db-backup.sh (the CD file sync keeps it current)"
fi

chgrp "$OPS_GROUP" "$DEPLOY_DIR"
chmod 2770 "$DEPLOY_DIR"
shopt -s dotglob nullglob
for entry in "$DEPLOY_DIR"/*; do
  name=${entry##*/}
  case $name in
    .env | backups) continue ;;
  esac
  chown -R "$DEPLOY_USER:$OPS_GROUP" "$entry"
  chmod -R g+rwX "$entry"
  find "$entry" -type d -exec chmod g+s {} +
done
shopt -u dotglob nullglob
did "ensured $DEPLOY_DIR is group $OPS_GROUP, setgid, group-writable (owner $DEPLOY_USER; .env and backups/ excluded from chown)"

if [[ -f $DEPLOY_DIR/.env ]]; then
  chgrp "$OPS_GROUP" "$DEPLOY_DIR/.env"
  chmod 0640 "$DEPLOY_DIR/.env"
  did "set $DEPLOY_DIR/.env to mode 640, group $OPS_GROUP (owner unchanged)"
else
  log "WARNING: $DEPLOY_DIR/.env does not exist yet; create it (mode 640, group $OPS_GROUP) before the first deploy"
fi
if [[ -d $DEPLOY_DIR/backups ]]; then
  kept "$DEPLOY_DIR/backups left untouched (root-only legacy backups)"
fi

# ---- Backup directories ------------------------------------------------------------

for dir in "$BACKUP_DIR" "$BACKUP_DIR/daily" "$BACKUP_DIR/pre-deploy"; do
  install -d -o root -g "$OPS_GROUP" "$dir"
  chmod 2770 "$dir"
done
did "ensured $BACKUP_DIR, daily/ and pre-deploy/ exist (root:$OPS_GROUP, mode 2770)"

# ---- systemd timer --------------------------------------------------------------------

install -m 0644 -o root -g root "$SCRIPT_DIR/systemd/gs-db-backup.service" /etc/systemd/system/gs-db-backup.service
install -m 0644 -o root -g root "$SCRIPT_DIR/systemd/gs-db-backup.timer" /etc/systemd/system/gs-db-backup.timer
systemctl daemon-reload
systemctl enable --now gs-db-backup.timer
did "installed and enabled gs-db-backup.timer (daily around 03:30)"

# ---- Summary ----------------------------------------------------------------------------

echo
echo "==== Bootstrap summary ===="
echo "Changed / ensured:"
printf '  - %s\n' "${done_items[@]}"
if ((${#kept_items[@]})); then
  echo "Already in place:"
  printf '  - %s\n' "${kept_items[@]}"
fi
echo
systemctl list-timers gs-db-backup.timer --no-pager || true
echo
echo "Next steps:"
echo "  1. Log in again as $ops_user (or run 'newgrp $OPS_GROUP') so the $OPS_GROUP membership applies."
echo "  2. From a trusted machine: ssh -i <private key> $DEPLOY_USER@<this host> 'id && docker ps'"
echo "  3. Take a first backup now: sudo systemctl start gs-db-backup.service && journalctl -u gs-db-backup.service -n 20 --no-pager"
echo "  4. Add the GitHub 'production' environment secrets/variables (see docs/procedimientos/deploy-vps.md)."
