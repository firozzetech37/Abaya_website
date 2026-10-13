-- Pattern station: versioned patterns per order item.
CREATE TYPE "PatternStatus" AS ENUM ('DRAFT', 'CONFIRMED');

CREATE TABLE "Pattern" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PatternStatus" NOT NULL DEFAULT 'DRAFT',
    "measurements" JSONB NOT NULL,
    "pieces" JSONB NOT NULL,
    "fabricWidthCm" INTEGER,
    "fabricLengthCm" INTEGER,
    "liningLengthCm" INTEGER,
    "seamAllowanceMm" INTEGER NOT NULL DEFAULT 10,
    "notes" TEXT NOT NULL DEFAULT '',
    "files" JSONB NOT NULL,
    "createdById" UUID,
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pattern_orderItemId_version_key" ON "Pattern"("orderItemId", "version");

ALTER TABLE "Pattern" ADD CONSTRAINT "Pattern_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pattern" ADD CONSTRAINT "Pattern_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pattern" ADD CONSTRAINT "Pattern_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
