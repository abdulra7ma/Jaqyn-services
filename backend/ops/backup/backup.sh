#!/usr/bin/env sh
set -eu

: "${POSTGRES_HOST:=db}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=jaqyn}"
: "${POSTGRES_USER:=jaqyn}"
: "${BACKUP_DIR:=/backups}"
: "${MEDIA_DIR:=/app/media}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/jaqyn-$STAMP.sql"
tar -czf "$BACKUP_DIR/media-$STAMP.tar.gz" -C "$MEDIA_DIR" . 2>/dev/null || true

find "$BACKUP_DIR" -type f -mtime +14 -delete
