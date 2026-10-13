# ADR 0004 — Clerk for login; Supabase stays for data and files

- Status: accepted
- Date: 2026-09-27
- Supersedes: the "Supabase Auth" part of ADR 0002

## Context
Supabase Auth needed a custom SMTP sender and hand-edited email templates before a
single login code could be sent, and phone OTP for tailors needed a separate SMS
provider setup. The team wants login that works out of the box on web, admin and
both Expo apps, with staff MFA and ready-made screens.

## Decision
- **Clerk** handles sign-in for every client: email code and Google (customers),
  phone SMS code (tailors), Apple on iOS, TOTP MFA for staff.
- The API verifies Clerk session tokens (`@clerk/backend`), rejects browser tokens
  from origins that are not ours (`azp`), reads MFA from the `fva` claim, and on
  first sight creates our `User` with email/phone from Clerk.
- `User.authUserId` holds the Clerk user id (text). **Roles stay in our database**
  and are enforced by API guards, exactly as before. Clerk metadata is not used
  for authorization.
- Account deletion (DPDP) also deletes the Clerk user.
- **Supabase remains** the Postgres database (Prisma) and file storage (signed
  URLs). Clients never talk to Supabase at all now.

## Consequences
- No SMTP/SMS setup needed in development; production needs a verified sending
  domain in Clerk. SMS to India and MFA may depend on the Clerk plan.
- Login data (email, phone) is stored by Clerk (US region) — record this in the
  privacy notice and data map.
- One more vendor; if we leave Clerk, only `common/auth` (token verifier, profile
  lookup) and the clients' login screens change.
