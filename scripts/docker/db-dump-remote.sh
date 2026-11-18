#!/bin/sh
set -eu

source_url="${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL to the direct (non-pooler) connection string}"
case "$source_url" in
  *-pooler*) echo "use the direct connection string (host without -pooler)" >&2; exit 1 ;;
esac

mkdir -p backups
target="backups/remote-$(date +%Y%m%d-%H%M%S).dump"

docker run --rm -e SOURCE_DATABASE_URL="$source_url" postgres:18-alpine \
  sh -c 'pg_dump -Fc --no-owner --no-acl "$SOURCE_DATABASE_URL"' > "$target"

docker run --rm -i postgres:18-alpine pg_restore -l < "$target" > /dev/null
echo "$target ($(wc -c < "$target" | tr -d ' ') bytes, readable)"
