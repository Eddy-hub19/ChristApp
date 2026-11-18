-- Смарагди (друга валюта «Отари»), щоденні завдання й причина DAILY_QUEST у журналі рубінів (лише додавання).
ALTER TYPE "RubyReason" ADD VALUE 'DAILY_QUEST';

CREATE TYPE "EmeraldReason" AS ENUM ('DAILY_QUEST_EMERALD', 'ARTIFACT_PURCHASE_EMERALD', 'SKIN_PURCHASE_EMERALD', 'ARENA_TIGER_DROP', 'ARENA_COLISEUM_SKIN_FALLBACK', 'ADMIN_ADJUST');

ALTER TABLE "FlockProfile" ADD COLUMN "emeralds" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "EmeraldTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "EmeraldReason" NOT NULL,
    "note" TEXT,
    "skinId" INTEGER,
    "artifactId" INTEGER,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmeraldTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmeraldTransaction_userId_createdAt_idx" ON "EmeraldTransaction"("userId", "createdAt" DESC);
CREATE INDEX "EmeraldTransaction_userId_reason_createdAt_idx" ON "EmeraldTransaction"("userId", "reason", "createdAt");

ALTER TABLE "EmeraldTransaction" ADD CONSTRAINT "EmeraldTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FlockDailyQuest" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "questId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlockDailyQuest_pkey" PRIMARY KEY ("userId","day","slot")
);

CREATE INDEX "FlockDailyQuest_day_idx" ON "FlockDailyQuest"("day");

ALTER TABLE "FlockDailyQuest" ADD CONSTRAINT "FlockDailyQuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
