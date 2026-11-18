-- CreateEnum
CREATE TYPE "RubyReason" AS ENUM ('ARENA_TOP1', 'SKIN_PURCHASE', 'ADMIN_ADJUST');

-- CreateTable
CREATE TABLE "FlockProfile" (
    "userId" TEXT NOT NULL,
    "rubies" INTEGER NOT NULL DEFAULT 0,
    "bestMass" INTEGER NOT NULL DEFAULT 0,
    "eaten" INTEGER NOT NULL DEFAULT 0,
    "topMs" BIGINT NOT NULL DEFAULT 0,
    "games" INTEGER NOT NULL DEFAULT 0,
    "statsImportedAt" TIMESTAMP(3),
    "selectedSkin" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FlockProfile_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "FlockProfile_rubies_nonneg" CHECK ("rubies" >= 0)
);

-- CreateTable
CREATE TABLE "RubyTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "RubyReason" NOT NULL,
    "note" TEXT,
    "skinId" INTEGER,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RubyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlockSkinPurchase" (
    "userId" TEXT NOT NULL,
    "skinId" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlockSkinPurchase_pkey" PRIMARY KEY ("userId","skinId")
);

-- CreateIndex
CREATE INDEX "RubyTransaction_userId_createdAt_idx" ON "RubyTransaction"("userId", "createdAt" DESC);
CREATE INDEX "RubyTransaction_userId_reason_createdAt_idx" ON "RubyTransaction"("userId", "reason", "createdAt");

-- AddForeignKey
ALTER TABLE "FlockProfile" ADD CONSTRAINT "FlockProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RubyTransaction" ADD CONSTRAINT "RubyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlockSkinPurchase" ADD CONSTRAINT "FlockSkinPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
