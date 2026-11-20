-- Закріплені повідомлення чату: до 3 на чат (ліміт і права перевіряє сервер).
-- Видалення повідомлення, кімнати чи користувача каскадно знімає закріплення. Лише нова таблиця, існуючі дані не чіпаємо.
CREATE TABLE "MessagePin" (
    "id" TEXT NOT NULL,
    "roomId" UUID NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagePin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessagePin_roomId_messageId_key" ON "MessagePin"("roomId", "messageId");

CREATE INDEX "MessagePin_roomId_createdAt_idx" ON "MessagePin"("roomId", "createdAt");

ALTER TABLE "MessagePin" ADD CONSTRAINT "MessagePin_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagePin" ADD CONSTRAINT "MessagePin_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagePin" ADD CONSTRAINT "MessagePin_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
