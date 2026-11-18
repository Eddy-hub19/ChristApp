-- AlterEnum
ALTER TYPE "RubyReason" ADD VALUE 'ARTIFACT_PURCHASE';

-- AlterTable
ALTER TABLE "FlockProfile" ADD COLUMN "selectedArtifact" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RubyTransaction" ADD COLUMN "artifactId" INTEGER;

-- CreateTable
CREATE TABLE "FlockArtifactPurchase" (
    "userId" TEXT NOT NULL,
    "artifactId" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlockArtifactPurchase_pkey" PRIMARY KEY ("userId","artifactId")
);

-- AddForeignKey
ALTER TABLE "FlockArtifactPurchase" ADD CONSTRAINT "FlockArtifactPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
