-- Runs right after 20260218063306_init. Empty-database path only (marker present):
-- re-add the columns that 20260215120000_user_last_seen_vip had added to the stand-in table,
-- so the history continues exactly as on production (isVip is dropped later by
-- 20260929233000_drop_user_is_vip). No-op without the marker.
DO $$
BEGIN
  IF to_regclass('public."_empty_db_bootstrap"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
    ALTER TABLE "User" ADD COLUMN "isVip" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;
