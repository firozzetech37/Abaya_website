-- Each customer's access to a website AI picture, for one hour after she got it (her "recent pictures").
-- The picture's files are deleted once no customer's access is left.


-- CreateTable
CREATE TABLE "CustomerPreviewAccess" (
    "id" UUID NOT NULL,
    "previewId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPreviewAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPreviewAccess_userId_expiresAt_idx" ON "CustomerPreviewAccess"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "CustomerPreviewAccess_previewId_expiresAt_idx" ON "CustomerPreviewAccess"("previewId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPreviewAccess_previewId_userId_key" ON "CustomerPreviewAccess"("previewId", "userId");

-- AddForeignKey
ALTER TABLE "CustomerPreviewAccess" ADD CONSTRAINT "CustomerPreviewAccess_previewId_fkey" FOREIGN KEY ("previewId") REFERENCES "CustomerPreview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPreviewAccess" ADD CONSTRAINT "CustomerPreviewAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

