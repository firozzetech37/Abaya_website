-- Step 15: AI image analysis (duplicate detection + tag suggestions).
CREATE TYPE "AiImageKind" AS ENUM ('DESIGN_IMAGE', 'REFERENCE');
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'DONE', 'FAILED');
CREATE TYPE "AiSuggestionStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED');

CREATE TABLE "AiImage" (
    "id" UUID NOT NULL,
    "kind" "AiImageKind" NOT NULL,
    "subjectId" UUID NOT NULL,
    "designId" UUID,
    "source" JSONB NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,
    "model" TEXT,
    "embedding" REAL[],
    "phash" TEXT,
    "suggestedTags" JSONB,
    "suggestedStyle" "AbayaStyle",
    "styleScore" DOUBLE PRECISION,
    "suggestedAltText" TEXT,
    "suggestionStatus" "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "analysedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiImage_kind_subjectId_key" ON "AiImage"("kind", "subjectId");
CREATE INDEX "AiImage_status_nextAttemptAt_idx" ON "AiImage"("status", "nextAttemptAt");
CREATE INDEX "AiImage_designId_idx" ON "AiImage"("designId");
CREATE INDEX "AiImage_updatedAt_idx" ON "AiImage"("updatedAt");
