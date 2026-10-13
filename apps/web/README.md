# @abaya/web — customer website

Next.js 15 (App Router). Run with `pnpm --filter @abaya/web dev` (http://localhost:3000). Env vars are read
from the monorepo root `.env` (see `.env.example`): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`.

## Login (Clerk)

- `/login` renders Clerk's prebuilt `<SignIn withSignUp />` (one combined sign-in / sign-up flow), styled in
  `lib/clerk-appearance.ts`. `?redirect_url=/path` sends the customer back afterwards (only same-site paths).
- `middleware.ts` (`clerkMiddleware`) redirects logged-out visitors from `/account`, `/checkout` and `/orders`
  to `/login`. All other pages are public; catalogue pages never depend on auth.
- API calls send `Authorization: Bearer <Clerk session token>` (`lib/auth.tsx` registers the token getter).
  The API creates our `User` row on the first call; roles live in our database.
- Without keys the site still builds and browses; login shows "Login is not configured".

### Clerk dashboard settings

1. **User & authentication → Email**: enable *Email address* as an identifier, sign-in with
   **Email verification code** (turn off passwords if you want code-only), and *Verify at sign-up* with
   **Email verification code**.
2. **SSO connections**: enable **Google** (use your own Google OAuth credentials in production).
3. **Paths** (or leave defaults — the app passes them): sign-in URL and sign-up URL = `/login`,
   after sign-out = `/`.
4. **Domains / allowed origins**: add the production site URL.

Customers do not need 2FA; staff MFA is enforced only in the admin app/API.
