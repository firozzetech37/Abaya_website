# @abaya/admin — Operations console

Next.js 15 admin panel (`pnpm --filter @abaya/admin dev`, port 3001). All data goes
through `apps/api`; this app never talks to Supabase.

## Login (Clerk)

Set in the root `.env`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
(secret is only used server-side by `clerkMiddleware`). Without them the app still
builds and `/login` shows "Login is not configured".

Enable in the Clerk dashboard (User & authentication):
- **Email address** with **Email verification code** (the primary staff sign-in).
- **Google** (optional; shown automatically on `/login` when enabled).
- **Multi-factor → Authenticator application (TOTP)** and **Backup codes**, so staff
  can enrol on `/account/security`.
- Sign-up must stay allowed: `/login` uses Clerk's combined sign-in-or-up flow, so a
  new staff email gets a Clerk account on first sign-in. Staff access itself comes
  only from roles in OUR database (a super admin assigns them on "Staff & roles").
- Paths: sign-in URL `/login`; after sign-in `/`.

How it fits together:
- `middleware.ts` protects every route except `/login/*` (skipped when keys are missing).
- `lib/auth.tsx` bridges Clerk into the app and registers `getToken()` with
  `lib/api-client.ts`, which sends `Authorization: Bearer <Clerk session token>`.
- The console layout calls `GET /v1/me`; non-staff see "No staff access".
- Two-factor: Clerk asks for the code inside `<SignIn/>` when the user has MFA.
  If the API answers `403 MFA_REQUIRED` (production, `STAFF_MFA_REQUIRED`), staff are
  sent to `/account/security` to add an authenticator app, then sign in again.
  In development MFA is not required and there is no prompt.
