# candid-app

React Native client for **Candid** (working codename) — a private, invite-only app that
captures candid group moments during an event. This repo is the mobile half of the project;
the API lives in the sibling `candid-api` repo. The full product brief and architecture
docs are in `/docs/`.

## Current state — Phase 1 complete

Per `/docs/04-build-phases.md`:

- **Phase 0** ✅ — Expo dev client + typed API client + health screen reaching the deployed `/health`.
- **Phase 1** ✅ — Magic-link sign-in via Supabase, session persisted in `expo-secure-store`, auth-gated route groups, device timezone PATCHed to `/profile/me` on every sign-in + cold start.
- **Phase 2** ⏭ — Groups & membership (create, invite, join, member list). Schema already in place backend-side.
- Phases 3–6: capture, prompts/push, feed, hardening.

### What ships today

- Sign-in screen at `/(auth)/sign-in` → `signInWithOtp({email, emailRedirectTo: Linking.createURL('/')})` → user taps email link → app handles the deep link, extracts tokens from the URL hash, calls `setSession`.
- Authed landing at `/(app)` shows the user's profile via `GET /profile/me`. Sign-out button calls `supabase.auth.signOut()`.
- Custom `useSession()` hook (`src/auth/SessionProvider.tsx`) subscribes to `supabase.auth.onAuthStateChange`. Exposes `{ status: 'loading' | 'authenticated' | 'unauthenticated', session, signOut }`.
- `authedRequest()` in `src/api/client.ts` automatically attaches `Authorization: Bearer …` from the current session.
- `/health` remains a public route at `app/health.tsx` for API reachability checks.

## Prerequisites

- **Node 20 LTS** + **npm 10**
- **EAS CLI**: `npm i -g eas-cli`
- **Android**: Android Studio with an AVD emulator, or a physical device with USB debugging enabled
- **iOS** (macOS only): Xcode + iOS Simulator

## First-time setup

```bash
npm install
cp .env.example .env
```

Fill `.env` with:

```
EXPO_PUBLIC_API_URL=https://candid-api-7o72.onrender.com
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

The anon key is fine in the bundle. **Never** put the service-role key or any backend secret in `.env`.

## Run locally

```bash
npx expo start --dev-client
```

Requires a dev-client APK installed on the device first (see next sections).

Dev-client URL prefix is `candid://`. The Supabase **Authentication → URL Configuration → Redirect URLs** allowlist must include whatever `Linking.createURL('/')` resolves to in your build (typically `candid:///`). Without that the magic-link redirect won't make it back into the app.

## Build the Android dev client (free, no Apple account needed)

```bash
eas login                                          # first time only
eas init                                           # first time only — creates the EAS project
eas build --profile development --platform android
```

When the build finishes, EAS will give you a URL to download the APK. Install it on the
device/emulator (drag-and-drop onto an emulator window, or `adb install ./dev-client.apk`).
Then run `npx expo start --dev-client` and open the URL the bundler prints inside the dev
client app.

> No rebuild is needed when changing JS-only — Metro hot-reloads. Rebuild only when adding a new native module (e.g. `expo-image-picker`, `react-native-vision-camera`).

## Build the iOS Simulator dev client (free, no Apple account needed)

Requires a Mac with Xcode.

```bash
eas build --profile development --platform ios
```

The build produces a `.tar.gz` containing a `.app` bundle. Extract it, then drag the
`.app` onto a running Simulator window to install. Launch from the Simulator's home
screen, then run `npx expo start --dev-client` from your machine.

> Real iOS device support is deferred until an Apple Developer account is provisioned.

## Scripts

| Script                 | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm start`            | `expo start --dev-client`                          |
| `npm run android`      | `expo run:android` (after dev client is installed) |
| `npm run ios`          | `expo run:ios`                                     |
| `npm run lint`         | ESLint, `--max-warnings 0`                         |
| `npm run format`       | Prettier `--write`                                 |
| `npm run format:check` | Prettier `--check`                                 |
| `npm run typecheck`    | `tsc --noEmit`                                     |

## Project layout

Mirrors `/docs/03-technical-architecture.md` §7:

```
app/
  _layout.tsx          root: SafeAreaProvider + SessionProvider + QueryProvider
  index.tsx            session-aware redirector
  health.tsx           public health screen
  (auth)/
    _layout.tsx        bounces to (app) if authed
    sign-in.tsx        email entry → signInWithOtp
  (app)/
    _layout.tsx        bounces to (auth)/sign-in if not authed; mounts useTimezoneSync
    index.tsx          landing — GET /profile/me + sign-out

src/
  api/                 typed client (request, authedRequest), profile, health
  auth/                Supabase client, SessionProvider, useDeepLinkAuth, useTimezoneSync
  features/
    onboarding/        stub (Phase 3)
    prompt/            stub (Phase 4)
    capture/           stub (Phase 3/6)
    feed/              stub (Phase 5)
  notifications/       stub (Phase 4)
  providers/           React Query provider
  stores/              stub — Zustand lands Phase 3+
  theme/  utils/  types/   stubs
```

## Conventions

- TypeScript strict
- Prettier: single quotes, semicolons, trailing commas, 100-col width
- Path alias `@/*` → `src/*`
- **Bundle hygiene**: only the Supabase anon key + other `EXPO_PUBLIC_*` values may be
  bundled. **Never** ship a service-role key, R2 secret, or Firebase admin credential.

## Placeholders to revisit

- iOS `bundleIdentifier`: `app.candid.mobile`
- Android `package`: `app.candid`

These are placeholders pending the final product name. Renaming them later creates a
new app identity on the stores — settle the name **before** the first TestFlight or Play
Console submission.
