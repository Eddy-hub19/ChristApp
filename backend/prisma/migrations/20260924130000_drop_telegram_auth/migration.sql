-- Авторизацію через Telegram прибрано з застосунку повністю.
-- На момент міграції жоден акаунт не був прив'язаний до Telegram і не мав порожнього пароля.

DROP INDEX IF EXISTS "User_telegramId_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "telegramId";

-- Поле було зроблено nullable лише заради Telegram-акаунтів без пароля.
ALTER TABLE "User" ALTER COLUMN "password" SET NOT NULL;
