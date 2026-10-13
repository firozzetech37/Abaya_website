-- A design photo can show one of the design's colours; customers see that colour's photos when they pick it.
ALTER TABLE "DesignImage" ADD COLUMN "colourValueId" UUID;

CREATE INDEX "DesignImage_colourValueId_idx" ON "DesignImage"("colourValueId");

ALTER TABLE "DesignImage" ADD CONSTRAINT "DesignImage_colourValueId_fkey" FOREIGN KEY ("colourValueId") REFERENCES "OptionValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
