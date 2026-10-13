-- Website AI previews: two careful steps, an accuracy check by Gemini vision and one retry.
-- AlterTable
ALTER TABLE "CustomerPreview" ADD COLUMN     "checkNotes" TEXT,
ADD COLUMN     "checks" JSONB,
ADD COLUMN     "inaccurate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "step" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "steps" TEXT[],
ADD COLUMN     "workingPath" TEXT;

