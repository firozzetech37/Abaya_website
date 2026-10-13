-- Workshop team: one assigned person per station for each abaya (docs/apps/workshop.md "Team").
-- CreateTable
CREATE TABLE "WorkshopAssignment" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "station" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "assignedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkshopAssignment_userId_idx" ON "WorkshopAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopAssignment_orderItemId_station_key" ON "WorkshopAssignment"("orderItemId", "station");

-- AddForeignKey
ALTER TABLE "WorkshopAssignment" ADD CONSTRAINT "WorkshopAssignment_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopAssignment" ADD CONSTRAINT "WorkshopAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopAssignment" ADD CONSTRAINT "WorkshopAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

