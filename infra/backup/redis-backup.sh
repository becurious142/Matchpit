#!/bin/bash
set -e

# Triggers a background save in Redis
echo "Triggering Redis BGSAVE..."
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD BGSAVE

# Wait for BGSAVE to complete (simple sleep or check info persistence)
sleep 10

# Copy dump.rdb
BACKUP_DIR="/backups/redis"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Assume redis data is mapped to /data/dump.rdb
cp /data/dump.rdb "$BACKUP_DIR/dump_$TIMESTAMP.rdb"
echo "Redis backup copied to $BACKUP_DIR/dump_$TIMESTAMP.rdb"

# Upload to S3
if command -v aws &> /dev/null; then
    aws s3 cp "$BACKUP_DIR/dump_$TIMESTAMP.rdb" "s3://matchpit-backups/redis/"
fi

# Cleanup
find "$BACKUP_DIR" -type f -name "*.rdb" -mtime +3 -delete
