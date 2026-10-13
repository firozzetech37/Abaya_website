-- AI Catalog jobs started from a design's Images tab remember that design
ALTER TABLE "CatalogJob" ADD COLUMN "designId" UUID;
CREATE INDEX "CatalogJob_designId_createdAt_idx" ON "CatalogJob"("designId", "createdAt");
