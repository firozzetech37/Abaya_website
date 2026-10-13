-- CreateTable
CREATE TABLE "OrderingWaitlist" (
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderingWaitlist_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "OrderingWaitlist_createdAt_idx" ON "OrderingWaitlist"("createdAt");

-- AddForeignKey
ALTER TABLE "OrderingWaitlist" ADD CONSTRAINT "OrderingWaitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

