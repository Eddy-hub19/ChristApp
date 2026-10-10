-- Last migration of the empty-database series. Empty-database path only (marker present).
--
-- The migration history alone does not reproduce schema.prisma: production was brought to the
-- current schema by hand / `db push` for the items below. Replay them here so that
-- `prisma migrate deploy` on an empty database yields exactly the schema in schema.prisma.
-- Production already has the first three (or must not be touched), so without the marker this is a no-op.
DO $$
BEGIN
  IF to_regclass('public."_empty_db_bootstrap"') IS NOT NULL THEN
    -- Message.sender: migrations say RESTRICT, schema.prisma says CASCADE
    ALTER TABLE "Message" DROP CONSTRAINT "Message_senderId_fkey";
    ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
      FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    -- User.nickname is optional in schema.prisma (migration made it NOT NULL)
    ALTER TABLE "User" ALTER COLUMN "nickname" DROP NOT NULL;

    -- defaults declared in schema.prisma
    ALTER TABLE "RoomReadState" ALTER COLUMN "lastReadAt" SET DEFAULT to_timestamp((0)::double precision);
    ALTER TABLE "WatchRoomMember" ALTER COLUMN "lastReadAt" SET DEFAULT to_timestamp((0)::double precision);

    -- @@index([isRevoked, revokedAt]) on RefreshSession exists in schema.prisma but in no migration
    CREATE INDEX "RefreshSession_isRevoked_revokedAt_idx" ON "RefreshSession"("isRevoked", "revokedAt");

    DROP TABLE "_empty_db_bootstrap";
  END IF;
END
$$;
