-- Workshop stations (pattern → cutting → stitching → QC → finishing → logistics) and staff invites.
ALTER TYPE "Role" ADD VALUE 'PATTERN_TECHNICIAN';
ALTER TYPE "Role" ADD VALUE 'CUTTER';
ALTER TYPE "Role" ADD VALUE 'FINISHER';
ALTER TYPE "Role" ADD VALUE 'LOGISTICS';

ALTER TYPE "ProductionStage" ADD VALUE 'PATTERN';
ALTER TYPE "ProductionStage" ADD VALUE 'FINISHING';
ALTER TYPE "ProductionStage" ADD VALUE 'PACKED';
ALTER TYPE "ProductionStage" ADD VALUE 'ON_HOLD';

CREATE TYPE "StaffInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED');

ALTER TABLE "OrderItem"
    ADD COLUMN "claimedById" UUID,
    ADD COLUMN "claimedAt" TIMESTAMP(3),
    ADD COLUMN "heldFromStage" "ProductionStage",
    ADD COLUMN "holdReason" TEXT;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_claimedById_fkey"
    FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StaffInvite" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "roles" "Role"[],
    "status" "StaffInviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" UUID,
    "acceptedUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffInvite_email_status_idx" ON "StaffInvite"("email", "status");

ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
