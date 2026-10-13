-- CreateTable
CREATE TABLE "CatalogPromptPreset" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPromptPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogPromptPreset_archivedAt_createdAt_idx" ON "CatalogPromptPreset"("archivedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "CatalogPromptPreset" ADD CONSTRAINT "CatalogPromptPreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

