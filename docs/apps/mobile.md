# Customer app — `apps/mobile`

Expo (latest SDK), Expo Router, NativeWind, TanStack Query, `@supabase/supabase-js`
with `expo-secure-store` for the session, `react-native-razorpay` for payments
(needs a development build — Expo Go cannot load it; see build plan step 8).
One codebase → Android + iOS.

## Tabs and screens

```
(tabs)
├─ index            Home: collections, new designs, how it works
├─ shop             Grid with filters (style, collection, price)
├─ bag              Cart
└─ account          Orders, measurements, addresses, wishlist, privacy, logout

stack screens
├─ design/[slug]        Gallery + Redesign sheet (same logic as web)
├─ measurements/new     Guided measurement form (one field per step, with diagram)
├─ checkout             Address → review → Razorpay
├─ orders/[orderNumber] Stage timeline + stage photos + tracking
└─ login                Phone OTP / email OTP / Google / Apple
```

## Rules

- Same API client and Zod schemas as web (`@abaya/contracts`); price from
  `calculatePrice()` locally, confirmed by the server quote.
- On iOS, offering Google login requires Sign in with Apple as well.
- Camera/photo permission text must explain why (measurement photos, Phase 2).
- Account deletion must be reachable inside the app (store rule + DPDP).
- Push notifications (Phase 2): Expo push token saved via `/v1/me/devices`.
- Deep links: `abaya://design/<slug>`, `abaya://orders/<orderNumber>`.
- Test on a real Android phone first (most users), then iOS via TestFlight.

## Folder layout

```
apps/mobile/
├─ app/                  # Expo Router routes above
├─ components/           # DesignCard, RedesignSheet, OptionChips, PriceBar, StageTimeline
├─ lib/                  # api-client.ts, supabase.ts, queries/
├─ content/strings.ts
└─ app.config.ts         # name, bundle ids, scheme, EAS project id
```

## Look and feel (same as the website)

- Type: Inter (text) and Cormorant Garamond (display), bundled with `@expo-google-fonts`
  (only the 8 weights used). `components/text.tsx` picks the font file from the className
  weight (`font-semibold`, `font-display`, `italic`), so every screen uses the website's type.
- Colours: the shared deep green plus `gold-*` and `sand-*` (tailwind.config.js, lib/theme.ts).
- Ornaments (`components/ornament.tsx`): eight-pointed star, girih lattice, star divider that
  draws in, glowing star — Arabic-inspired, as on the website.
- Arches: design cards, collection tiles, avatars, list icons and stage photos use arch shapes
  with a thin gold outline.
- Motion (Reanimated): the curtain loader at launch (`components/curtain-loader.tsx`, the same
  idea as the website's entrance), spring presses with haptics (`PressableScale`, `Button`),
  staggered fade-ins, the home "arch carousel", a breathing gold ring on the current order
  stage, a shine sweep on main buttons. Reduced-motion phones get a quick fade instead.
- Buttons: `primary` (green gradient + gold rim), `gold`, `secondary`, `ghost`, `danger`,
  `light`; `trailingIcon` and `shine` for main calls to action.
- Floating green-and-gold tab bar (`components/tab-bar.tsx`); tab screens leave 130 px at the
  bottom for it.
