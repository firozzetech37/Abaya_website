-- Customer web previews get a version in their URL, so a rebuilt image is never served from a cache.
ALTER TABLE "DesignImage" ADD COLUMN "previewVersion" INTEGER NOT NULL DEFAULT 0;
