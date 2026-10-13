-- Studio: design source and originality, AI generations (docs/apps/studio.md).
-- CreateEnum
CREATE TYPE "DesignSource" AS ENUM ('UPLOAD', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "aiGeneration" JSONB,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "inspirationUrl" TEXT,
ADD COLUMN     "originalityConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "source" "DesignSource" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DesignGeneration" (
    "id" UUID NOT NULL,
    "designerId" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "sketchPath" TEXT,
    "inspirationUrl" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "leasedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DesignGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "favourite" BOOLEAN NOT NULL DEFAULT false,
    "designId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignGeneration_designerId_createdAt_idx" ON "DesignGeneration"("designerId", "createdAt");

-- CreateIndex
CREATE INDEX "DesignGeneration_status_createdAt_idx" ON "DesignGeneration"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedImage_generationId_sortOrder_idx" ON "GeneratedImage"("generationId", "sortOrder");

-- AddForeignKey
ALTER TABLE "DesignGeneration" ADD CONSTRAINT "DesignGeneration_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "DesignGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

