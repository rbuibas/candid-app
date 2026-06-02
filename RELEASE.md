# Releasing Candid

How to cut and distribute a build of the Candid mobile app. Two lanes:

- **Android — signed APK (available now)** — direct-share to friends or upload to
  Play internal testing. This is the MVP distribution path for Kraków.
- **iOS — TestFlight (BLOCKED)** — declared but not usable until an Apple
  Developer Program account exists. There is no iOS sideload alternative; iPhone
  guests can't be onboarded until this lands.

All builds go through **EAS Build** (`eas.json` profiles). You need the EAS CLI
(`npm i -g eas-cli`) and to be logged in (`eas login`) to the project owner's
Expo account.

---

## Versioning

- **`version`** (human semver, e.g. `0.1.0`) lives in `app.config.ts`. Bump it by
  hand when you cut a meaningful release.
- **Android `versionCode` / iOS `buildNumber`** are managed **remotely** by EAS
  (`cli.appVersionSource: "remote"` in `eas.json`) and **auto-incremented** on
  every `preview`/`production` build (`autoIncrement: true`). You don't edit them
  in the config — EAS owns them so a dynamic `app.config.ts` can't drift.
  - First remote build: EAS seeds the build number (starts at 1). To set an
    explicit starting point: `eas build:version:set`.
  - Inspect current numbers: `eas build:version:get`.

> Note: we switched `appVersionSource` from `local` → `remote` in Phase 6. With a
> dynamic `app.config.ts`, `local` + `autoIncrement` can't write the bumped
> number back to the TS file, so increments wouldn't persist. `remote` is the
> reliable choice for hands-off build-number bumping.

---

## Android — signed APK (now)

EAS manages the signing keystore automatically (generated on first build, stored
in the Expo project). The resulting APK is **signed** and installable directly.

1. **Bump `version`** in `app.config.ts` if this is a real release.
2. **Build** (pick one profile):
   - Quick share lane: `eas build --profile preview --platform android`
   - Release lane: `eas build --profile production --platform android`
     Both emit a signed **APK** (`android.buildType: "apk"`). Build takes ~10–15
     min; the CLI prints a download URL when done (also in the Expo dashboard).
3. **Distribute**: share the APK download link, or download the `.apk` and send
   the file (group chat, AirDrop-to-Android, etc.). No store, no TestFlight.
4. **Install on a clean device**: the recipient enables "Install unknown apps"
   for their browser/file manager, opens the `.apk`, installs.
5. **Verify (release acceptance — scenario 11 in `phase-6-testing.md`)**: on a
   device **without** Metro / the dev server running, the app launches, signs in
   via magic link, and completes onboarding (name → photo-booth → feed) unaided.

### Play internal testing (optional, later)

Play **requires an App Bundle (AAB)**, not an APK. To use Play internal testing
instead of direct APK sharing, build with an app-bundle profile and submit:

- Change the profile's `android.buildType` to `"app-bundle"` (or add a dedicated
  profile), then `eas build --profile <that> --platform android`.
- `eas submit --platform android --profile production` (needs a Google Play
  service-account key configured in EAS).

For Kraków, **direct APK sharing is the path** — Play setup is not required.

---

## iOS — TestFlight (BLOCKED until Apple enrollment)

⚠️ **Do not attempt iOS submission yet.** It requires a paid Apple Developer
Program membership, which does not exist for this project. The `production.ios`
build profile and `submit.production` are declared so the lane is ready, but the
build/submit will fail without Apple credentials.

Once the Apple Developer account exists:

1. Add the iOS bundle identifier (`app.candid.mobile`, see `app.config.ts`) as an
   App ID in the Apple Developer portal, and create the app in App Store Connect.
2. Add an APNs auth key to Firebase (for push) and drop
   `GoogleService-Info.plist` into the project + register it in `app.config.ts`
   (iOS push is currently Android-only — see the `@react-native-firebase/app`
   note in the config).
3. Configure EAS submit credentials: `eas submit` will prompt for the Apple ID,
   App Store Connect app ID (`ascAppId`), and team — or set them under
   `submit.production.ios` in `eas.json`.
4. Build + submit:
   - `eas build --profile production --platform ios`
   - `eas submit --platform ios --profile production`
5. In App Store Connect → TestFlight, add the guests' Apple IDs as testers and
   send invites. iPhone guests install the TestFlight app and accept the invite.

Until this is done, **Kraków is Android-only** unless every guest is on Android —
decide whether that's acceptable for the guest list.

---

## Pre-flight checklist

- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` are green.
- [ ] `version` bumped in `app.config.ts` (if a real release).
- [ ] New native modules since the last dev-client build? (Phase 6 added
      `expo-network` + `@react-native-async-storage/async-storage`.) Testers on
      the **dev** build need a fresh dev-client; release builds bundle natively
      so a plain reinstall is enough.
- [ ] Smoke-tested against `phase-6-testing.md` — at minimum the offline-queue,
      locked-group, and clean-install onboarding scenarios.
