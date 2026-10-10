-- Runs after 20260215120000_user_last_seen_vip and before 20260218063306_init.
-- Empty-database path only (marker created by 20260101000000_empty_db_bootstrap):
-- drop the stand-in "User" table so that the real init migration can create it.
-- The two columns the early ALTER added are restored right after init by
-- 20260218063307_empty_db_restore_user_columns. No-op when the marker does not exist (production).
DO $$
BEGIN
  IF to_regclass('public."_empty_db_bootstrap"') IS NOT NULL THEN
    DROP TABLE "User";
  END IF;
END
$$;
