-- Christ Radio: queue tracks, single-row station state and on-air history. Additive: three new tables.


-- CreateTable
CREATE TABLE "RadioTrack" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "artist" VARCHAR(120) NOT NULL DEFAULT '',
    "audioUrl" TEXT NOT NULL,
    "coverUrl" TEXT,
    "durationSec" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadioTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadioState" (
    "id" TEXT NOT NULL,
    "currentTrackId" TEXT,
    "startedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadioState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadioPlay" (
    "id" TEXT NOT NULL,
    "trackId" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "artist" VARCHAR(120) NOT NULL DEFAULT '',
    "coverUrl" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadioPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RadioTrack_position_idx" ON "RadioTrack"("position");

-- CreateIndex
CREATE INDEX "RadioPlay_startedAt_idx" ON "RadioPlay"("startedAt");

