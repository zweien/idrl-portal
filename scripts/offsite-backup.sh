#!/usr/bin/env bash
#
# Off-site backup sync. The app's built-in backups live in prisma/backups/ on
# the SAME disk as the live DB, so a disk failure takes both. This script
# mirrors the backups directory to a separate location (a remote host, an
# attached volume, an S3/rclone mount point) configured via $BACKUP_OFFSITE_TARGET.
#
# Run it from cron (e.g. hourly, after the app's daily backup job), or manually:
#   BACKUP_OFFSITE_TARGET=user@host:/srv/idrl-backups ./scripts/offsite-backup.sh
#   BACKUP_OFFSITE_TARGET=/mnt/external/idrl-backups ./scripts/offsite-backup.sh
#
# rsync is incremental, so re-runs only transfer new/changed snapshots. The
# source is prisma/backups/ (resolved relative to the repo root).
#
# Requires: rsync, ssh (for remote targets). No app secrets are read; the
# target path is the only input. Exits non-zero if the target is unset or
# rsync fails, so a cron wrapper can alert on failure.
set -euo pipefail

if [ -z "${BACKUP_OFFSITE_TARGET:-}" ]; then
  echo "BACKUP_OFFSITE_TARGET is not set. Configure it to a remote host:path," >&2
  echo "an attached volume, or an rclone/S3 mount point. Example:" >&2
  echo '  BACKUP_OFFSITE_TARGET=user@host:/srv/idrl-backups ./scripts/offsite-backup.sh' >&2
  exit 2
fi

# Resolve the repo root (this script lives in scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$REPO_ROOT/prisma/backups/"

if [ ! -d "$SRC" ]; then
  echo "backups dir $SRC does not exist yet — nothing to sync." >&2
  exit 0
fi

echo "syncing $SRC -> $BACKUP_OFFSITE_TARGET"
# --delete keeps the mirror in lockstep with the source (pruned local backups
# are removed remotely too). -a archive, -z compress in transit.
rsync -az --delete "$SRC" "$BACKUP_OFFSITE_TARGET/"
echo "off-site sync complete."
