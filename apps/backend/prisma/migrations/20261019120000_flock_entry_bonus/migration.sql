-- AlterEnum
ALTER TYPE "RubyReason" ADD VALUE 'ENTRY_BONUS';

-- AlterTable
ALTER TABLE "FlockProfile" ADD COLUMN "entryBonusAt" TIMESTAMP(3);
