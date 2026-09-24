#!/usr/bin/env bash
# Dump the Cha Ghor database to a compressed, timestamped file.
#
# ============================================================================
# WHY THIS IS NOT OPTIONAL
# ============================================================================
# Every wage, loan, advance and settlement lives in one Postgres container on
# one machine. `docker compose down -v` removes the volume. A disk fault, a
# wrong DELETE, a laptop that does not come back -- and there is no version of
# the estate's payroll history left anywhere.
#
# No amount of application-level integrity work compensates for that. The
# CHECK constraints and the audit trail protect data that still exists.
#
# ============================================================================
# USAGE
# ============================================================================
#   ./scripts/backup-db.sh                  # -> backups/chaghor-YYYYmmdd-HHMMSS.sql.gz
#   BACKUP_DIR=/Volumes/usb ./scripts/backup-db.sh
#
# Restore (DESTRUCTIVE -- it drops and recreates every table):
#   gunzip -c backups/chaghor-20260830-013000.sql.gz \
#     | docker exec -i chaghor-postgres psql -U chaghor -d chaghor
#
# Automate it -- a backup script nobody runs is not a backup. On macOS/Linux:
#   crontab -e
#   0 22 * * *  cd /path/to/chaghor && ./scripts/backup-db.sh >> /tmp/chaghor-backup.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
CONTAINER="${DB_CONTAINER:-chaghor-postgres}"
DB_NAME="${DB_NAME:-chaghor}"
DB_USER="${DB_USERNAME:-chaghor}"
KEEP="${BACKUP_KEEP:-14}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/chaghor-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container '$CONTAINER' is not running. Start it with:" >&2
  echo "  cd docker && docker compose up -d" >&2
  exit 1
fi

echo "Dumping $DB_NAME from $CONTAINER ..."

# --clean --if-exists so the dump can be restored over an existing database
# without hand-dropping it first. Piped straight to gzip so the uncompressed
# copy never touches disk.
#
# WRITTEN TO A TEMP NAME FIRST. A backup interrupted halfway that still carries
# the real filename is worse than no backup: it looks valid in a directory
# listing and fails only when it is needed. It is renamed only on success.
TMP="$OUT.partial"
if docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
      --clean --if-exists --no-owner --no-privileges 2>/dev/null | gzip -9 > "$TMP"; then
  mv "$TMP" "$OUT"
else
  rm -f "$TMP"
  echo "pg_dump FAILED - no backup was written." >&2
  exit 1
fi

# A dump that restores to an empty database is the classic silent failure, so
# check the file is plausible rather than merely present.
SIZE=$(wc -c < "$OUT" | tr -d ' ')
if [ "$SIZE" -lt 1024 ]; then
  echo "Backup is only ${SIZE} bytes - that is almost certainly empty. Keeping it" >&2
  echo "for inspection, but DO NOT rely on it." >&2
  exit 1
fi

echo "Written: $OUT  ($(du -h "$OUT" | cut -f1))"

# Prune old dumps, newest kept. Runs last so a pruning bug can never delete
# anything before today's backup has been confirmed good.
if [ "$KEEP" -gt 0 ]; then
  COUNT=$(ls -1 "$BACKUP_DIR"/chaghor-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COUNT" -gt "$KEEP" ]; then
    ls -1t "$BACKUP_DIR"/chaghor-*.sql.gz | tail -n +$((KEEP + 1)) | while read -r old; do
      echo "  pruning $(basename "$old")"
      rm -f "$old"
    done
  fi
fi

echo "Done. $(ls -1 "$BACKUP_DIR"/chaghor-*.sql.gz 2>/dev/null | wc -l | tr -d ' ') backup(s) retained."
