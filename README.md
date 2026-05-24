# candid-app

React Native client for **Candid** (working codename) — a private, invite-only app that
captures candid group moments during an event. This repo is the mobile half of the project;
the API lives in the sibling `candid-api` repo. The full product brief and architecture
docs are in `/docs/`.

## Phase 0 scaffold

This is the **Phase 0** scaffold per `/docs/04-build-phases.md`. It includes:

- Expo (dev client) + TypeScript strict, managed with npm
- Expo Router shell with a single **health-check screen**
- React Query provider wired
- Supabase client created (with `expo-secure-store` session adapter) but **unused** — no auth flow this phase
- Typed API client (`src/api/`) with one call: `GET ${EXPO_PUBLIC_API_URL}/health`
- EAS `development` profile: Android APK + iOS Simulator (no Apple Developer account needed)

**Not included** (see later phases in `/docs/04-build-phases.md`):
auth, magic-link onboarding, photo-booth, vision-camera capture, location, FCM push,
Zustand stores, feed, prompt UI, offline queue.

## Prerequisites

- **Node 20 LTS** + **npm 10**
- **EAS CLI**: `npm i -g eas-cli`
- **Android**: Android Studio with an AVD emulator, or a physical device with USB debugging enabled
- **iOS** (macOS only): Xcode + iOS Simulator

## First-time setup

```bash
npm install
cp .env.example .env
# Fill in EXPO_PUBLIC_API_URL with the deployed candid-api /health origin.
# For an Android emulator hitting a host-machine localhost API, use http://10.0.2.2:8000.
```

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` can be left as placeholders
in Phase 0 — the Supabase client isn't constructed until Phase 1 wires up auth.

## Run locally

```bash
npx expo start --dev-client
```

Requires a dev-client build installed on the device/emulator first (see next sections).

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

| Script               | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm start`          | `expo start --dev-client`                     |
| `npm run android`    | `expo run:android` (after dev client is installed) |
| `npm run ios`        | `expo run:ios`                                |
| `npm run lint`       | ESLint, `--max-warnings 0`                    |
| `npm run format`     | Prettier `--write`                            |
| `npm run format:check` | Prettier `--check`                          |
| `npm run typecheck`  | `tsc --noEmit`                                |

## Project layout

Mirrors `/docs/03-technical-architecture.md` §7:

```
app/                 Expo Router routes (Phase 0: just the health screen)
src/
  api/               typed client + endpoints
  auth/              Supabase client + SecureStore adapter (unused in Phase 0)
  features/
    onboarding/      stub (Phase 1/3)
    prompt/          stub (Phase 4)
    capture/         stub (Phase 3/6)
    feed/            stub (Phase 5)
  notifications/     stub (Phase 4)
  providers/         React Query provider
  stores/            stub — Zustand lands Phase 3+
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

## Phase 0 acceptance

With `EXPO_PUBLIC_API_URL` pointed at a reachable `/health` endpoint returning
`{"status":"ok"}`, the health screen should display **`status: ok`** in green on a
real Android device (and on the iOS Simulator when built on a Mac).
