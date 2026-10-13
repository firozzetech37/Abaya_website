-- CreateEnum
CREATE TYPE "DownloadStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "downloadEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "downloadPriceInPaise" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "downloadId" UUID,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DesignDownload" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "designId" UUID NOT NULL,
    "design" JSONB NOT NULL,
    "imagePaths" TEXT[],
    "priceInPaise" INTEGER NOT NULL,
    "status" "DownloadStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "licenceAcceptedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignDownload_userId_status_idx" ON "DesignDownload"("userId", "status");

-- CreateIndex
CREATE INDEX "DesignDownload_designId_idx" ON "DesignDownload"("designId");

-- CreateIndex
CREATE INDEX "DesignDownload_status_paidAt_idx" ON "DesignDownload"("status", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_downloadId_idx" ON "Payment"("downloadId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_downloadId_fkey" FOREIGN KEY ("downloadId") REFERENCES "DesignDownload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignDownload" ADD CONSTRAINT "DesignDownload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A payment is for exactly one thing: an order or a download.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_one_subject_check" CHECK (("orderId" IS NULL) <> ("downloadId" IS NULL));
