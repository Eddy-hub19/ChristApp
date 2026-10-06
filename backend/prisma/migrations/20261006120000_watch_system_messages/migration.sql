-- CreateEnum
CREATE TYPE "WatchMessageType" AS ENUM ('TEXT', 'SYSTEM');

-- AlterTable
ALTER TABLE "WatchMessage" ADD COLUMN "type" "WatchMessageType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN "systemData" JSONB;
