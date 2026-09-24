-- «Кіношка з Ісусом»: кімнати спільного перегляду YouTube, учасники/запрошення та чат кімнати.

-- CreateEnum
CREATE TYPE "WatchMemberStatus" AS ENUM ('INVITED', 'JOINED');

-- CreateTable
CREATE TABLE "WatchRoom" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "videoId" VARCHAR(11) NOT NULL,
    "videoTitle" VARCHAR(200),
    "isPlaying" BOOLEAN NOT NULL DEFAULT false,
    "positionSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stateUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hostId" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchRoomMember" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WatchMemberStatus" NOT NULL DEFAULT 'INVITED',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "WatchRoomMember_pkey" PRIMARY KEY ("roomId","userId")
);

-- CreateTable
CREATE TABLE "WatchMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchRoom_inviteToken_key" ON "WatchRoom"("inviteToken");

-- CreateIndex
CREATE INDEX "WatchRoom_hostId_idx" ON "WatchRoom"("hostId");

-- CreateIndex
CREATE INDEX "WatchRoomMember_userId_status_idx" ON "WatchRoomMember"("userId", "status");

-- CreateIndex
CREATE INDEX "WatchMessage_roomId_createdAt_idx" ON "WatchMessage"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "WatchRoom" ADD CONSTRAINT "WatchRoom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchRoomMember" ADD CONSTRAINT "WatchRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "WatchRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchRoomMember" ADD CONSTRAINT "WatchRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchMessage" ADD CONSTRAINT "WatchMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "WatchRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchMessage" ADD CONSTRAINT "WatchMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

