-- Чат кімнати "Киношка": реакції на повідомлення, "прочитано" (lastReadAt) та мʼют сповіщень per-member.

-- AlterTable
ALTER TABLE "WatchRoomMember" ADD COLUMN "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "notificationsMuted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WatchMessageReaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchMessageReaction_messageId_createdAt_idx" ON "WatchMessageReaction"("messageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchMessageReaction_userId_messageId_type_key" ON "WatchMessageReaction"("userId", "messageId", "type");

-- AddForeignKey
ALTER TABLE "WatchMessageReaction" ADD CONSTRAINT "WatchMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchMessageReaction" ADD CONSTRAINT "WatchMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WatchMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
