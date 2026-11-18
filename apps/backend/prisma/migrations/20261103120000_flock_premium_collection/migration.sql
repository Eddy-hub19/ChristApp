-- Разова нагорода за колекцію преміум-скінів: нова причина в журналі рубінів і позначка в профілі (лише додавання).
ALTER TYPE "RubyReason" ADD VALUE 'PREMIUM_COLLECTION';
ALTER TABLE "FlockProfile" ADD COLUMN "premiumCollectionAt" TIMESTAMP(3);
