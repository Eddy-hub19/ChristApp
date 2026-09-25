-- CreateEnum
CREATE TYPE "WatchProvider" AS ENUM ('YOUTUBE', 'VIMEO', 'DAILYMOTION', 'FILE', 'IFRAME', 'MANUAL');

-- AlterTable
-- Existing rooms are untouched: "provider" defaults to YOUTUBE (the only value used before this
-- migration) and "videoId" keeps its stored value, just with a wider column to fit non-YouTube refs.
ALTER TABLE "WatchRoom"
  ADD COLUMN "provider" "WatchProvider" NOT NULL DEFAULT 'YOUTUBE',
  ADD COLUMN "thumbnailUrl" VARCHAR(1024),
  ALTER COLUMN "videoId" TYPE VARCHAR(2048);
