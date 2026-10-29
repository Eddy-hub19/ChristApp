-- «Пазли»: свои картинки пользователей и блокировка загрузки. Только новые таблицы.

CREATE TABLE "UserPuzzleImage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cloudinaryId" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "showAuthor" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPuzzleImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PuzzleUploadBlock" (
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuzzleUploadBlock_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "UserPuzzleImage_ownerId_createdAt_idx" ON "UserPuzzleImage"("ownerId", "createdAt");
CREATE INDEX "UserPuzzleImage_createdAt_idx" ON "UserPuzzleImage"("createdAt");

ALTER TABLE "UserPuzzleImage" ADD CONSTRAINT "UserPuzzleImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PuzzleUploadBlock" ADD CONSTRAINT "PuzzleUploadBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
