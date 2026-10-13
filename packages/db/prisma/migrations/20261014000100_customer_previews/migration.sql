-- Customer AI previews and try-ons on the website (docs/apps/web.md "AI preview and try-on").
-- CreateEnum
CREATE TYPE "CustomerPreviewKind" AS ENUM ('PREVIEW', 'TRYON');

-- CreateEnum
CREATE TYPE "CustomerPreviewStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "CustomerPreview" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "CustomerPreviewKind" NOT NULL,
    "designId" UUID NOT NULL,
    "previewKey" TEXT,
    "selectedOptionValueIds" UUID[],
    "choices" TEXT[],
    "sourcePath" TEXT NOT NULL,
    "personPath" TEXT,
    "basePreviewId" UUID,
    "prompt" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "providerJobId" TEXT,
    "status" "CustomerPreviewStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "resultPath" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPreview_userId_kind_createdAt_idx" ON "CustomerPreview"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerPreview_previewKey_idx" ON "CustomerPreview"("previewKey");

-- CreateIndex
CREATE INDEX "CustomerPreview_status_nextCheckAt_idx" ON "CustomerPreview"("status", "nextCheckAt");

-- CreateIndex
CREATE INDEX "CustomerPreview_createdAt_idx" ON "CustomerPreview"("createdAt");

-- CreateIndex
CREATE INDEX "CustomerPreview_expiresAt_idx" ON "CustomerPreview"("expiresAt");

-- AddForeignKey
ALTER TABLE "CustomerPreview" ADD CONSTRAINT "CustomerPreview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

