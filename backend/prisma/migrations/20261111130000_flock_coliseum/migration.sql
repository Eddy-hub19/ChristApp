-- Карта «Арена»: причини журналу рубінів, лічильник перемог над тигром, таблиця перемог і журнал правок (лише додавання).
ALTER TYPE "RubyReason" ADD VALUE 'ARENA_COLISEUM';
ALTER TYPE "RubyReason" ADD VALUE 'ARENA_COLISEUM_SKIN';

ALTER TABLE "FlockProfile" ADD COLUMN "coliseumWins" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "FlockColiseumWin" (
    "winId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT false,
    "rubies" INTEGER NOT NULL DEFAULT 0,
    "emeralds" INTEGER NOT NULL DEFAULT 0,
    "skinId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlockColiseumWin_pkey" PRIMARY KEY ("winId","userId")
);

CREATE INDEX "FlockColiseumWin_userId_createdAt_idx" ON "FlockColiseumWin"("userId", "createdAt");

ALTER TABLE "FlockColiseumWin" ADD CONSTRAINT "FlockColiseumWin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FlockColiseumLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "winsAfter" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlockColiseumLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FlockColiseumLog_userId_createdAt_idx" ON "FlockColiseumLog"("userId", "createdAt");

ALTER TABLE "FlockColiseumLog" ADD CONSTRAINT "FlockColiseumLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
