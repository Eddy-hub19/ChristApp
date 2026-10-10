# Prisma migrations: empty-database fix

## Problem

`prisma migrate deploy` on an **empty** database failed on the very first migration:

```
Applying migration `20260215120000_user_last_seen_vip`
ERROR: relation "User" does not exist
```

Cause: `20260215120000_user_last_seen_vip` (`ALTER TABLE "User" ADD COLUMN lastSeenAt, isVip`) was
created with a back-dated timestamp, so it sorts **before** `20260218063306_init`, the migration
that creates "User". Prisma applies migrations in name order. On production the order was
different (init on 2026-03-04, `user_last_seen_vip` only on 2026-04-14), so production never hit it.

A second problem: the history does not reproduce `schema.prisma` (a few objects were changed by hand
or via `db push` on production), so even with the order fixed an empty database would drift.

## Fix (no applied migration was edited, renamed or removed)

Four guarded migrations were added. They only do something on an empty database
(a marker table `_empty_db_bootstrap` exists); on production / any database that already has
"User" they are no-ops and change neither schema nor data.

| migration | sorts | does (empty DB only) |
| --- | --- | --- |
| `20260101000000_empty_db_bootstrap` | before everything | creates marker + stand-in "User" so the early ALTER can run |
| `20260217000000_empty_db_release_user_table` | after `user_last_seen_vip`, before `init` | drops the stand-in "User" |
| `20260218063307_empty_db_restore_user_columns` | right after `init` | re-adds `lastSeenAt`, `isVip` (later dropped by `drop_user_is_vip`, as on prod) |
| `20261009000000_empty_db_reconcile_schema` | last | replays hand-made prod changes (Message FK CASCADE, nullable nickname, `lastReadAt` defaults, `RefreshSession` index) and drops the marker |

Verified: empty database -> `migrate deploy` succeeds and `migrate diff` against `schema.prisma` is empty;
a schema-only copy of production -> `migrate deploy` applies the four migrations as no-ops
(schema and data dumps identical before/after). CI job "Prisma migrations (empty database)" guards this.

## Known differences between production and `schema.prisma` (not changed here)

* `WatchRoomMember.lastReadAt` default: production `CURRENT_TIMESTAMP`, schema.prisma `to_timestamp(0)`.
* Index `RefreshSession(isRevoked, revokedAt)` exists in schema.prisma but not in production.

A fresh database follows `schema.prisma`, so it has the index and the epoch default. To align production,
add a normal (unguarded) migration later.

## Rules going forward

Never create a migration with a timestamp older than existing ones; always use `prisma migrate dev`.
