# Abaya customer app (`apps/mobile`)

Expo SDK 57 · Expo Router · NativeWind v4 · TanStack Query · Clerk (`@clerk/expo`, login only) ·
react-native-razorpay. Every data call goes to `apps/api` with a fresh Clerk session token
(`getToken()` per request; tokens live ~60 s). The app never talks to Supabase.

## Screens

| Route | What |
| --- | --- |
| `(tabs)/index` | Home: hero, collections, new designs, how it works |
| `(tabs)/shop` | Grid with style / collection / price / sort filters, infinite scroll |
| `(tabs)/bag` | Cart with server prices, quantity, remove, item problems, checkout |
| `(tabs)/account` | Orders, measurements, addresses, wishlist, privacy, sign out |
| `design/[slug]` | Gallery + Redesign bottom sheet (options, size, live price, Add to bag) |
| `measurements/new` | Guided form: one measurement per step with a diagram |
| `checkout` | Address → review → Razorpay → success |
| `orders/[orderNumber]` | Per-abaya stage timeline, stage photos, tracking |
| `login`, `consent` | Email code, Google, Sign in with Apple (iOS) via Clerk; DPDP consent |
| `sso-callback` | Target of Clerk's Google redirect (`abaya://sso-callback`); just goes home |
| `privacy` | Download my data, delete my account (type DELETE) |
| `notifications` | Push permission explainer (once after first sign-in; once more after the first order if skipped) |

Deep links: `abaya://design/<slug>`, `abaya://orders/<orderNumber>`.

## Environment

The app reads these from the **root** `.env` (see `.env.example`) or your shell:

```bash
EXPO_PUBLIC_API_URL="http://192.168.1.10:4000"   # your laptop's LAN IP, NOT localhost
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."   # Clerk → API keys (publishable key only)
EAS_PROJECT_ID="..."                              # printed by `npx eas-cli init`
```

Find your laptop's LAN IP with `ipconfig getifaddr en0` (macOS) or `hostname -I` (Linux).
The phone and laptop must be on the same Wi-Fi. Without the Clerk key the app still runs
logged-out (browse, redesign, prices); `<ClerkProvider>` is not mounted and sign-in shows a
"not configured" note.

## Login (Clerk)

The login screen is our own native UI on Clerk's hooks (`useSignIn` / `useSignUp` Core 3 API,
`useSSO`, `useSignInWithApple`). The session lives in SecureStore via `@clerk/expo/token-cache`.
`lib/auth.tsx` registers `getToken()` for `lib/api-client.ts`; sign-out removes the push token
first, then calls Clerk `signOut()`. After `DELETE /v1/me` (the API also deletes the Clerk user)
the app only signs out locally.

Clerk dashboard settings (same application as web/admin):

1. **User & authentication → Email**: enable *Email address* as an identifier and
   **Email verification code** as a sign-in/sign-up method. Passwords off. Do not require
   first/last name or other fields at sign-up (the consent step is our own) — otherwise new
   accounts stop with "needs an extra step". The tailor app uses phone sign-up in the same
   Clerk application, so leave *Phone number* **optional** (not required) at sign-up.
2. **SSO connections → Google**: enable (for production add your own Google OAuth client).
3. **SSO connections → Apple**: enable. Native Sign in with Apple also needs
   **Native applications → iOS**: your Apple Team ID (App ID prefix) + bundle id `in.abaya.app`.
   The Apple button only shows on iOS devices that support it.
4. **Native applications**: turn on the Native API, and add the mobile SSO redirect
   **`abaya://sso-callback`** to the redirect allowlist (for Expo Go also the
   `exp://<ip>:8081/--/sso-callback` URL printed by `AuthSession.makeRedirectUri`).
   Clerk rejects OAuth redirects that are not allowlisted.

## Push notifications

`lib/push.ts` registers this install's Expo push token with the API
(`POST /v1/me/devices`, `app: 'CUSTOMER'`) after sign-in and consent, and on every app start while signed in.
Sign-out calls `DELETE /v1/me/devices?token=…` before the session is cleared. A short in-app
explainer (`/notifications`) comes before the OS permission prompt; "Not now" never blocks
anything. Tapping a notification opens its `data.url` (`abaya://orders/<orderNumber>` → `/orders/<orderNumber>`),
also from a cold start. Push is skipped quietly (one dev log line) on simulators, in Expo Go
on Android, or when there is no EAS project id.

Push needs, once per app:

1. **EAS project id** — `npx eas-cli init` in this folder (with `EAS_NO_VCS=1`, since the repo
   is not a git repo), then put the id in `EAS_PROJECT_ID` in the root `.env`. It reaches the app as
   `extra.eas.projectId`, which `getExpoPushTokenAsync({ projectId })` needs.
2. **Android: FCM credentials** — create a Firebase project, add an Android app with the package
   name from `app.config.ts`, download `google-services.json` into this folder (`app.config.ts` picks it up
   automatically; keep it out of any public repo), and upload the **FCM V1 service
   account key** with `npx eas-cli credentials` (Android → Google Service Account → FCM V1).
   Rebuild the development build afterwards.
3. **iOS: APNs** — `npx eas-cli credentials` (iOS → Push Notifications) creates or uploads the
   APNs key; EAS Build then signs the app with the push entitlement.

**Push does not work in Expo Go on Android (SDK 53 and later).** Use the development build
(see below). Emulators and simulators cannot receive remote push either; use a real phone.
The Android notification channel is `default` (importance HIGH); the notification icon is tinted
with the brand colour (add a 96×96 white-on-transparent `icon` to the `expo-notifications` plugin
in `app.config.ts` when the brand asset exists).

## WhatsApp order updates

Account → Notifications → "Order updates on WhatsApp" records the `WHATSAPP_UPDATES` consent
(`POST /v1/me/consents`). Turning it on asks for / confirms a 10-digit Indian mobile and saves
it to the profile (`PATCH /v1/me`) first, because the API only sends WhatsApp to a valid number.

## Test on an Android phone

Payments use Razorpay's native module, which **Expo Go cannot load**. Expo Go works for
everything else (checkout then shows "Payments need the development build").
To test the full flow including payment, install a development build once:

### Option A — EAS development build (no Android Studio needed)

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init                      # creates the EAS project; put the id in EAS_PROJECT_ID
# The repo is not a git repo, so tell EAS to upload without VCS:
EAS_NO_VCS=1 npx eas-cli build --profile development --platform android
```

When the build finishes, open the link / scan the QR on your phone and install the APK
(allow "install unknown apps" for your browser).

### Option B — local build over USB

Needs Android Studio (SDK + platform tools) and USB debugging enabled on the phone.

```bash
cd apps/mobile
adb devices                            # your phone should be listed
npx expo run:android                   # builds and installs the dev build on the phone
```

### Then, every time

```bash
# 1. API on the laptop (reachable from the phone on port 4000)
pnpm --filter @abaya/api dev

# 2. Metro for the app (from the repo root)
pnpm --filter @abaya/mobile start
```

Open the **Abaya** dev build on the phone; it finds the Metro server on your network (or
scan the QR code shown in the terminal). Press `r` in the terminal to reload.
If the phone cannot connect, try `pnpm --filter @abaya/mobile start -- --tunnel`, and make sure
`EXPO_PUBLIC_API_URL` uses the LAN IP and the laptop firewall allows ports 4000 and 8081.

Quick look without a build: install **Expo Go** from the Play Store, run
`pnpm --filter @abaya/mobile start`, scan the QR code. Everything except payment works.

Test payment: use Razorpay test mode (test keys in the API's `.env`), UPI id `success@razorpay`.

## Checks

```bash
pnpm --filter @abaya/mobile typecheck
pnpm --filter @abaya/mobile lint
cd apps/mobile && npx expo export --platform android --output-dir /tmp/abaya-export
```

## Notes

- `metro.config.js` watches the repo root and maps `react-native-css-interop` (NativeWind's
  JSX runtime) because pnpm's isolated `node_modules` do not hoist it next to the app.
- `babel.config.js` resolves `babel-preset-expo` through `expo` for the same reason.
- The Clerk client token is kept in SecureStore (`@clerk/expo/token-cache`).
- All copy lives in `content/strings.ts`.
