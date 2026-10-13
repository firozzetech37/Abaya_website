-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "aiPreviewInspiration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiPreviewPath" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "aiPreviewInspiration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiPreviewPath" TEXT;

