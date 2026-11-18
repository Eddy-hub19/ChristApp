-- «Складні досягнення» «Отари» (смарагди): стан серії/маси/особливих скінів і видані нагороди (лише додавання).
ALTER TYPE "EmeraldReason" ADD VALUE 'ACHIEVEMENT_STREAK_EMERALD';
ALTER TYPE "EmeraldReason" ADD VALUE 'ACHIEVEMENT_EMERALD';

CREATE TABLE "FlockAchievementState" (
    "userId" TEXT NOT NULL,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "streakCycle" INTEGER NOT NULL DEFAULT 0,
    "streakLastDay" TEXT,
    "playDay" TEXT,
    "playSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxMass" INTEGER NOT NULL DEFAULT 0,
    "specialsDone" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlockAchievementState_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "FlockAchievementClaim" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlockAchievementClaim_pkey" PRIMARY KEY ("userId","key")
);

ALTER TABLE "FlockAchievementState" ADD CONSTRAINT "FlockAchievementState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlockAchievementClaim" ADD CONSTRAINT "FlockAchievementClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
