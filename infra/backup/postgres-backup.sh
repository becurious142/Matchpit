#!/bin/bash
set -e

# Configuration
BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/matchpit_db_$TIMESTAMP.sql.gz"
S3_BUCKET="s3://matchpit-backups/postgres/"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "Starting Postgres pg_dump..."
pg_dump $DATABASE_URL | gzip > "$BACKUP_FILE"

echo "Backup created at $BACKUP_FILE"

# If configured with S3, upload to separate storage account
if command -v aws &> /dev/null; then
    echo "Uploading to S3..."
    aws s3 cp "$BACKUP_FILE" "$S3_BUCKET"
    echo "Upload complete."
fi

# Retention: Keep only last 7 days locally
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -delete
echo "Old local backups pruned."
