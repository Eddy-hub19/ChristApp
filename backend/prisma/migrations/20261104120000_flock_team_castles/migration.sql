-- Режим «Замки»: нова причина в журналі рубінів і таблиця нагород за матчі (лише додавання).
ALTER TYPE "RubyReason" ADD VALUE 'TEAM_WIN';

CREATE TABLE "FlockTeamReward" (
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botOnly" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlockTeamReward_pkey" PRIMARY KEY ("matchId","userId")
);

CREATE INDEX "FlockTeamReward_userId_createdAt_idx" ON "FlockTeamReward"("userId", "createdAt");

ALTER TABLE "FlockTeamReward" ADD CONSTRAINT "FlockTeamReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
