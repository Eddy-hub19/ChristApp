-- Только добавляет: тип сообщения SYSTEM и два флага настроек звонков (по умолчанию включены).
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'SYSTEM';

ALTER TABLE "User"
  ADD COLUMN "callsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "callRingtone" BOOLEAN NOT NULL DEFAULT true;
