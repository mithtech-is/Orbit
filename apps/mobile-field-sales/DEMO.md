# Orbit field app — client demo guide

For when you need to show Orbit to a client on a real Android phone over the
internet (not just on the same Wi-Fi as the laptop).

## What you have

- **`apps/mobile-field-sales/Orbit-demo.apk`** — installable release APK
  (84 MB, signed with Android debug key, target SDK 36 / min SDK 24).
  *Gitignored* — rebuild it locally rather than trying to fetch it from GitHub.
- **`start-tunnel.bat`** / **`start-tunnel.command`** — opens a public
  Cloudflare URL (`https://<random>.trycloudflare.com`) that forwards to the
  laptop's `:9090`. URL changes each time the tunnel starts; the in-app
  **"Advanced → server URL"** field accepts whatever the current URL is.

## Pre-demo (do once)

1. **Install Orbit-demo.apk on the demo phone.**
   - Plug the phone into the laptop (USB cable, "File transfer" mode).
   - Drag `apps/mobile-field-sales/Orbit-demo.apk` to the phone's storage.
   - On the phone, tap the APK → grant "Install from this source" if asked.

   *Or:* email it / put it on a USB drive / share via Drive — the file is
   self-contained.

2. **Run the stack once** (`start.bat` / `start.command`) to make sure
   everything's seeded and healthy.

3. **Run `start-tunnel.bat` / `start-tunnel.command`** and copy the printed
   `https://...trycloudflare.com` URL. Open the app, log in once with that
   URL so you've validated the path end-to-end. (The app remembers the URL
   across launches.)

## At the demo

1. Open `start.bat` on the laptop. Wait for "ORBIT is running!".
2. Open `start-tunnel.bat`. Copy the printed URL.
3. On the demo phone:
   - Open Orbit.
   - On the login screen, tap **"Advanced — server URL"**.
   - Paste the URL.
   - Sign in: `rep1@acme-fieldsales.test` / `admin123` / org `mithtech`.
4. On the laptop's browser, log into the dashboard:
   `admin@fieldsales.local` / `admin123` / org `mithtech`.

The phone talks to the laptop's backend through Cloudflare — works from
any network with internet (mobile data, client Wi-Fi, hotel Wi-Fi…).

## Demo logins (org `mithtech`, password `admin123`)

| Role | Email | Where |
|---|---|---|
| Org Admin | `admin@fieldsales.local` | Web dashboard |
| Sales Manager | `manager@acme-fieldsales.test` | Web dashboard (live team map) |
| Operations | `ops@acme-fieldsales.test` | Web dashboard |
| **Field Rep** | `rep1@acme-fieldsales.test` (or `rep2`) | **Phone app** |

The phone app only accepts field reps; admins/managers/ops are dashboard-only.

## If the phone shows "Can't reach Orbit"

The app's auto-detection plus the baked URL fall back to localhost, so this
message always means **"the URL in 'Advanced → server URL' isn't responding".**
In order of likelihood:

1. The tunnel window closed (laptop side) → restart `start-tunnel.bat`,
   re-paste the new URL into the app.
2. The laptop's Orbit stack isn't running → run `start.bat`.
3. The URL in the app is stale (from a previous tunnel session) → re-paste.

## Rebuilding the APK

When the app code changes:

```powershell
cd apps\mobile-field-sales\android
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew assembleRelease
copy app\build\outputs\apk\release\app-release.apk ..\Orbit-demo.apk
```

First build is ~10 min (CMake compiles C++ for all 4 ABIs); incremental
builds are 1–2 min. The APK is `apps/mobile-field-sales/Orbit-demo.apk`
when done.
