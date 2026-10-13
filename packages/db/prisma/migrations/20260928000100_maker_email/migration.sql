-- Tailors can sign in to the maker app with an email code; the admin records the email
-- on the maker and the app links the account automatically on first sign-in.
ALTER TABLE "Maker" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "Maker_email_key" ON "Maker"("email");
