-- Відповіді на повідомлення (основні чати та Киношка). Лише додає колонки; FK немає навмисно —
-- якщо оригінал видалено, відповідь лишається й показує "повідомлення видалено".

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;

-- AlterTable
ALTER TABLE "WatchMessage" ADD COLUMN "replyToId" TEXT;

-- AlterTable
ALTER TABLE "WatchMessage" ADD COLUMN "editedAt" TIMESTAMP(3);
