-- Login moved from Supabase Auth to Clerk. Clerk user ids ("user_2abc…") are not UUIDs,
-- so authUserId becomes plain text. Existing rows keep their value.
ALTER TABLE "User" ALTER COLUMN "authUserId" SET DATA TYPE TEXT;
