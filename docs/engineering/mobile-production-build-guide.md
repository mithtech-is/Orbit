# Mobile Production Build Guide

The mobile app is an Expo (managed) project. Production builds use EAS Build (Expo's cloud builder). The free tier gives 30 builds/month per Expo account — enough for a pilot.

## Prerequisites

- Free Expo account: https://expo.dev/signup
- For iOS: Apple Developer Program enrolment ($99/yr — Apple's price, not us)
- For Android: any Android device or emulator. No Google Play account required to ship internally.

## One-time setup

```powershell
cd apps/mobile-field-sales
pnpm install                                     # picks up workspace deps
pnpm exec expo whoami                            # confirms you have Expo CLI; signs in if not
pnpm exec eas login                              # sign in to EAS
pnpm exec eas init                               # creates an EAS project + EAS_PROJECT_ID
```

After `eas init`, commit the changes it makes to `app.config.ts` (it writes the project id back).

## Daily dev loop

```powershell
cd apps/mobile-field-sales
pnpm dev          # → expo start --dev-client
```

You need a **dev client** installed on a device to load JS from Metro. Build it once with:

```powershell
pnpm build:android      # or build:ios
```

EAS prints a URL when the build completes. Install the APK with `adb install routepilot.apk` (Android) or via TestFlight (iOS).

## Production build

```powershell
# Android (APK or AAB — pick in eas.json profile)
pnpm exec eas build --platform android --profile production

# iOS (requires Apple Developer cert via EAS credentials)
pnpm exec eas build --platform ios --profile production
```

The `production` profile in `eas.json` is pre-configured; default channel is `production`.

## Required environment variables

These must be set in `eas.json` `env:` blocks for each profile, or via `eas secret:create`:

| Var | Purpose |
|---|---|
| `MOBILE_API_BASE_URL` | HTTPS URL of the production backend (e.g. `https://api.routepilot.example.com`) |
| `MOBILE_WS_URL` | `wss://` URL of the production WS gateway |

**Do not ship a build pointing at `localhost`.**

## Permission testing checklist

Once the dev client is installed, walk through:

| Step | Expected |
|---|---|
| First launch → Sign in | Login screen accepts work-email credentials |
| Tap "Allow location" (foreground) | OS prompt shows the `NSLocationWhenInUseUsageDescription` from `app.config.ts` |
| Record consent toggle | Tracking banner switches to "Work session active" |
| Start session | Background permission prompt shows with `NSLocationAlwaysAndWhenInUseUsageDescription` |
| Walk 50 m | Pings appear in the backend `location_ping` table |
| Background the app | Pings continue (foreground service notification visible on Android) |
| Stop session | Tracking banner returns to "Location sharing off" |
| Toggle airplane mode + check in at outlet | Mutation queued offline; banner "1 change waiting to sync" |
| Restore connectivity | Sync flush triggers automatically (AppState change → flushNow) |

## Known limitations

- **iOS background location** requires a paid Apple Developer account. Expo's free EAS tier can build but cannot distribute via TestFlight without credentials.
- **Foreground notification on Android 14+** — the app requests `FOREGROUND_SERVICE_LOCATION` per `app.config.ts`. If your device doesn't show the persistent tracking notification, the OS may have killed the service after 1 hour — confirm with `adb logcat | grep expo-location`.
- **OTA updates** — Expo Updates can ship JS-only changes without a new EAS build, but native changes (permission strings, plugins) always require a rebuild.

## CI build (optional)

`.github/workflows/ci.yml` runs `pnpm --filter @orbit/mobile-field-sales typecheck` on every PR. To also build the APK from CI:

```yaml
- name: EAS build (Android)
  if: github.ref == 'refs/heads/main'
  run: |
    pnpm exec eas build --platform android --profile production --non-interactive
  env:
    EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

Generate `EXPO_TOKEN` via `eas user:create-token` and add as a GitHub secret.

## Audit-trail

The first time a build succeeds, paste the EAS build URL in `docs/engineering/implementation-progress.md` so we have proof a binary exists.
