-- CreateTable
CREATE TABLE "FlockDailyRecord" (
    "day" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxMass" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlockDailyRecord_pkey" PRIMARY KEY ("day","userId")
);

-- CreateTable
CREATE TABLE "FlockDayWinner" (
    "day" TEXT NOT NULL,
    "userId" TEXT,
    "maxMass" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlockDayWinner_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "FlockStreak" (
    "userId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "lastDay" TEXT NOT NULL,
    "pendingAward" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FlockStreak_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "FlockDailyRecord_day_maxMass_idx" ON "FlockDailyRecord"("day", "maxMass" DESC);

-- AddForeignKey
ALTER TABLE "FlockDailyRecord" ADD CONSTRAINT "FlockDailyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlockStreak" ADD CONSTRAINT "FlockStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
