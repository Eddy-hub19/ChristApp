#!/bin/sh
set -eu

mkdir -p backups
target="backups/christapp-$(date +%Y%m%d-%H%M%S).dump"

npm run --silent "${COMPOSE_SCRIPT:-docker:compose}" -- exec -T db \
  sh -c 'pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$target"

echo "$target"
