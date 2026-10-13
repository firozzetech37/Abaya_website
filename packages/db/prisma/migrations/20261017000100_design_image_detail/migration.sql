-- Close-up detail shots (fabric, embroidery, hem) for the craftsmanship gallery
ALTER TABLE "DesignImage" ADD COLUMN "isDetail" BOOLEAN NOT NULL DEFAULT false;
