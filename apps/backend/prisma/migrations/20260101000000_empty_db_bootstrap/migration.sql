-- Fix for `prisma migrate deploy` on an EMPTY database (see backend/prisma/MIGRATIONS.md).
--
-- 20260215120000_user_last_seen_vip was created with a back-dated timestamp: it sorts BEFORE
-- 20260218063306_init, yet it ALTERs "User". On production the init migration had already been
-- applied (and 20260215120000 was applied later, 2026-04-14), so only an empty database breaks:
-- Prisma applies migrations in name order and fails with `relation "User" does not exist`.
--
-- Applied migrations must not be edited or renamed, so instead this migration (which sorts first)
-- gives that ALTER a table to work on, ONLY when "User" does not exist yet. It leaves a marker table
-- that the next migrations of this series (…_empty_db_*) use to stay no-ops everywhere else.
-- On production / any database that already has "User" this migration changes nothing.
DO $$
BEGIN
  IF to_regclass('public."User"') IS NULL THEN
    CREATE TABLE "_empty_db_bootstrap" ();
    CREATE TABLE "User" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "username" TEXT NOT NULL,
      "password" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "User_pkey" PRIMARY KEY ("id")
    );
  END IF;
END
$$;
