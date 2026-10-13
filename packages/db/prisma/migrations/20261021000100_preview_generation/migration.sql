-- Which version of the web-preview code made each design photo's public copy
-- (1 = invisible watermark). Older copies are remade once when the API starts.
ALTER TABLE "DesignImage" ADD COLUMN "previewGeneration" INTEGER NOT NULL DEFAULT 0;
