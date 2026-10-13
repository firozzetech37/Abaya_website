-- Tailors are added in Staff & roles by email; a phone number is optional.
ALTER TABLE "Maker" ALTER COLUMN "phone" DROP NOT NULL;
