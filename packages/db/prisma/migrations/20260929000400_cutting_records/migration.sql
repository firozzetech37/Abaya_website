-- Cutting station: what was cut, from which roll, and how much fabric it took.
CREATE TABLE "CuttingRecord" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "fabricLot" TEXT NOT NULL,
    "colourConfirmed" BOOLEAN NOT NULL,
    "fabricUsedCm" INTEGER NOT NULL,
    "estimateCm" INTEGER,
    "wastageCm" INTEGER,
    "liningUsedCm" INTEGER,
    "pieces" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "photoPath" TEXT NOT NULL,
    "cutById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuttingRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuttingRecord_orderItemId_attempt_key" ON "CuttingRecord"("orderItemId", "attempt");

ALTER TABLE "CuttingRecord" ADD CONSTRAINT "CuttingRecord_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CuttingRecord" ADD CONSTRAINT "CuttingRecord_cutById_fkey"
    FOREIGN KEY ("cutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
