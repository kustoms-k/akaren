#!/usr/bin/env bash
# Copy the nightly backups (database snapshots + vågsedel photos) off this server, e.g. to a storage box.
# A backup on the same disk as the data protects against mistakes, not against losing the server.
# Set up once: an SSH key for the target (ssh-copy-id), then a root cron entry, e.g. 04:15 every night:
#   15 4 * * * OFFSITE=u123456@u123456.your-storagebox.de:akaren bash /opt/akaren/deploy/backup-offsite.sh >> /var/log/akaren-offsite.log 2>&1
set -euo pipefail
: "${OFFSITE:?Set OFFSITE to user@host:path}"
cd "$(dirname "$0")/.."
SRC=$(docker volume inspect -f '{{ .Mountpoint }}' akaren_app-backup 2>/dev/null || true)
[ -n "${BACKUP_PATH:-}" ] && SRC="$BACKUP_PATH"
[ -d "$SRC" ] || { echo "Backup folder not found ($SRC)"; exit 1; }
# --delete keeps the copy in step with retention: photos past the retention period disappear here too.
rsync -az --delete -e "ssh -p ${OFFSITE_PORT:-23}" "$SRC/" "$OFFSITE/"
echo "$(date -Is) offsite backup ok"
