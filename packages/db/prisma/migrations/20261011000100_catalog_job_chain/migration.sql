-- AI Catalog: reference edits applied automatically, one after another.
ALTER TABLE "CatalogJob" ADD COLUMN "afterJobId" UUID;
CREATE INDEX "CatalogJob_afterJobId_idx" ON "CatalogJob"("afterJobId");
ALTER TABLE "CatalogJob" ADD CONSTRAINT "CatalogJob_afterJobId_fkey" FOREIGN KEY ("afterJobId") REFERENCES "CatalogJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
