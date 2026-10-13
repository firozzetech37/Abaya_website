-- Website top-bar announcements, managed in the admin
CREATE TABLE "Announcement" (
  "id" UUID NOT NULL,
  "textEn" TEXT NOT NULL,
  "textAr" TEXT NOT NULL,
  "linkPath" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Announcement_isActive_sortOrder_idx" ON "Announcement"("isActive", "sortOrder");
