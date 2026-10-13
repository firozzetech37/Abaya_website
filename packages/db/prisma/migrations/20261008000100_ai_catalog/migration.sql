-- CreateEnum
CREATE TYPE "CatalogJobKind" AS ENUM ('MODEL_CREATE', 'TRYON', 'EDIT', 'REFRAME', 'BACKGROUND_REMOVE');

-- CreateEnum
CREATE TYPE "CatalogJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "CatalogReview" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CatalogModelType" AS ENUM ('AI', 'PERSONAL');

-- CreateTable
CREATE TABLE "CatalogModelProfile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CatalogModelType" NOT NULL,
    "imagePath" TEXT NOT NULL,
    "description" TEXT,
    "attributes" JSONB,
    "consentAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogModelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogJob" (
    "id" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "kind" "CatalogJobKind" NOT NULL,
    "view" TEXT NOT NULL,
    "modelProfileId" UUID,
    "parentImageId" UUID,
    "retryOfImageId" UUID,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "inputs" JSONB NOT NULL,
    "editType" TEXT,
    "instruction" TEXT,
    "prompt" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "numImages" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "aspectRatio" TEXT,
    "creditsEstimated" INTEGER NOT NULL,
    "creditsUsed" INTEGER,
    "provider" TEXT NOT NULL,
    "providerJobId" TEXT,
    "status" "CatalogJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "flags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImage" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "review" "CatalogReview" NOT NULL DEFAULT 'PENDING',
    "reasons" TEXT[],
    "scores" JSONB,
    "note" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "designId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogModelProfile_archivedAt_createdAt_idx" ON "CatalogModelProfile"("archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogJob_createdById_createdAt_idx" ON "CatalogJob"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogJob_status_nextCheckAt_idx" ON "CatalogJob"("status", "nextCheckAt");

-- CreateIndex
CREATE INDEX "CatalogImage_jobId_sortOrder_idx" ON "CatalogImage"("jobId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CatalogModelProfile" ADD CONSTRAINT "CatalogModelProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogJob" ADD CONSTRAINT "CatalogJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogJob" ADD CONSTRAINT "CatalogJob_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "CatalogModelProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImage" ADD CONSTRAINT "CatalogImage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CatalogJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

