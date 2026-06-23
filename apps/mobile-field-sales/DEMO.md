# Orbit field app — client demo guide

For when you need to show Orbit to a client on a real Android phone over the
internet (not just on the same Wi-Fi as the laptop).

## What you have

- **`apps/mobile-field-sales/Orbit-demo.apk`** — installable release APK
  (~85 MB, signed with Android debug key, target SDK 36 / min SDK 24).
  *Gitignored* — rebuild it locally rather than trying to fetch it from GitHub.
  **It has the permanent URL `https://orbit.mith.tech` baked in** — no pasting.
- **`start-orbit-tunnel.bat`** / **`.command`** — brings the permanent URL
  `https://orbit.mith.tech` online (named Cloudflare tunnel → laptop `:9090`).
  The URL **never changes**, so the phone needs zero configuration. See
  `infra/cloudflared/README.md` for how the tunnel was set up.

> There's also an older `start-tunnel.bat` that opens a *random*
> `trycloudflare.com` URL — that's the fallback for when the named tunnel
> isn't available. Prefer `start-orbit-tunnel.bat`.

## Pre-demo (do once)

1. **Install Orbit-demo.apk on the demo phone.**
   - Plug the phone into the laptop (USB cable, "File transfer" mode).
   - Drag `apps/mobile-field-sales/Orbit-demo.apk` to the phone's storage.
   - On the phone, tap the APK → grant "Install from this source" if asked.
   - **Uninstall any older Orbit first** so stale saved settings don't linger.

   *Or:* email it / put it on a USB drive / share via Drive — the file is
   self-contained.

2. **Run the stack once** (`start.bat` / `start.command`) to make sure
   everything's seeded and healthy.

3. **Run `start-orbit-tunnel.bat`** and confirm `https://orbit.mith.tech/health`
   loads in any browser. Open the app and sign in once to validate end-to-end.

## At the demo

1. Open `start.bat` on the laptop. Wait for "ORBIT is running!".
2. Open `start-orbit-tunnel.bat`. Keep the window open.
3. On the demo phone — just open Orbit and sign in. **Nothing to configure**;
   the app already points at `https://orbit.mith.tech`.
   - `rep1@acme-fieldsales.test` / `admin123` / org `mithtech`.
4. On the laptop's browser, log into the dashboard:
   `admin@fieldsales.local` / `admin123` / org `mithtech`.

Works from **any network** — mobile data, the client's Wi-Fi, anywhere with
internet. No hotspot, no IP, no pasting.

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
