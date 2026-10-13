-- When a signed-in user last used the site (updated at most every 10 minutes).
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- Website AI previews and try-ons of a customer inactive for a day are deleted: the files go and
-- the picture paths are cleared; the row stays (credits, daily limits) with the time it happened.
ALTER TABLE "CustomerPreview" ADD COLUMN "purgedAt" TIMESTAMP(3);
CREATE INDEX "CustomerPreview_userId_purgedAt_idx" ON "CustomerPreview"("userId", "purgedAt");
