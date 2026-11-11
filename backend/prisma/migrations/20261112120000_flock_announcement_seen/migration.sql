-- Оголошення «Отари» при вході: остання переглянута версія (лише додавання колонки).
ALTER TABLE "FlockProfile" ADD COLUMN "announcementSeen" INTEGER NOT NULL DEFAULT 0;
