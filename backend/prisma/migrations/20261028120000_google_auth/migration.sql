-- Google sign-in: external identities, optional password, nickname-chosen flag.
-- Only additive for data: new table + new column with default; password becomes nullable.

ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "usernameChosen" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "providerId" VARCHAR(64) NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthIdentity_provider_providerId_key" ON "AuthIdentity"("provider", "providerId");
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
