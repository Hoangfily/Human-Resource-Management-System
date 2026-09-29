#!/usr/bin/env sh
set -eu

: "${POSTGRES_DB:?Set POSTGRES_DB}"
: "${POSTGRES_USER:?Set POSTGRES_USER}"
: "${PGHOST:=localhost}"
: "${BACKUP_DIR:=./backups}"

mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --no-acl --file="$BACKUP_DIR/${POSTGRES_DB}-$(date +%Y%m%d-%H%M%S).dump" \
  --host="$PGHOST" --username="$POSTGRES_USER" "$POSTGRES_DB"