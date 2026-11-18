#!/bin/sh
set -eu

dump_file="${1:-$(ls -t backups/*.dump backups/*.sql backups/*.sql.gz 2> /dev/null | head -n 1)}"
[ -n "$dump_file" ] && [ -f "$dump_file" ] || { echo "no dump: put a file into backups/ or pass a path" >&2; exit 1; }
echo "restoring $dump_file"

compose="npm run --silent ${COMPOSE_SCRIPT:-docker:compose} --"

$compose up -d --wait db

psql_cmd='psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
restore_cmd='pg_restore --no-owner --no-acl --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

case "$dump_file" in
  *.sql.gz) gunzip -c "$dump_file" | $compose exec -T db sh -c "$psql_cmd" ;;
  *.sql)    $compose exec -T db sh -c "$psql_cmd" < "$dump_file" ;;
  *)        $compose exec -T db sh -c "$restore_cmd" < "$dump_file" ;;
esac

$compose run --rm --no-deps backend npm run db:migrate
