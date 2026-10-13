-- Stitching station: the tailor's checklist, measurement self-check and time per stitching.
CREATE TABLE "StitchingRecord" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "checklist" JSONB NOT NULL,
    "measurements" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "photoPath" TEXT NOT NULL,
    "makerId" UUID,
    "stitchedById" UUID,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StitchingRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StitchingRecord_orderItemId_attempt_key" ON "StitchingRecord"("orderItemId", "attempt");

ALTER TABLE "StitchingRecord" ADD CONSTRAINT "StitchingRecord_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StitchingRecord" ADD CONSTRAINT "StitchingRecord_stitchedById_fkey"
    FOREIGN KEY ("stitchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
