-- AlterTable
ALTER TABLE "Message" ADD COLUMN "clientMessageId" TEXT;

-- CreateIndex (NULL-и в Postgres не конфліктують: унікальність лише для повідомлень із clientMessageId)
CREATE UNIQUE INDEX "Message_senderId_clientMessageId_key" ON "Message"("senderId", "clientMessageId");
