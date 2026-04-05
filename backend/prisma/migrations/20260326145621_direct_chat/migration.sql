-- CreateTable
CREATE TABLE "DirectChat" (
    "chatId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,

    PRIMARY KEY ("userAId", "userBId"),
    CONSTRAINT "DirectChat_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectChat_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectChat_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectChat_chatId_key" ON "DirectChat"("chatId");

-- CreateIndex
CREATE INDEX "DirectChat_userBId_userAId_idx" ON "DirectChat"("userBId", "userAId");
