# Orbit — permanent public URL via Cloudflare named tunnel

`https://orbit.mith.tech` is a **permanent** public URL that forwards to the
local Orbit backend on `:9090`. Because it never changes, it's baked into the
Orbit Android APK once — the phone reaches the backend from **any** network
(mobile data, any Wi-Fi, a client's locked-down guest network) with **no IP
juggling, no hotspot, and no pasting a URL**.

It's a real Cloudflare tunnel: TLS terminated with a valid cert (no browser
interstitial, unlike ngrok free), no request/bandwidth caps, WebSockets pass
through automatically (`wss://orbit.mith.tech`).

## Daily use

1. Start the stack: `start.bat` (backend on `:9090`).
2. Start the tunnel: **`start-orbit-tunnel.bat`** (repo root). Keep the window open.
3. On the phone, open Orbit and sign in — the app already points at
   `https://orbit.mith.tech`. Nothing to configure.

That's it. The tunnel must be running on the laptop for the URL to be live;
closing its window takes the URL offline until you start it again.

## One-time setup (already done on this machine)

Recorded here so it's reproducible on a fresh machine. Requires `cloudflared`
installed and the `mith.tech` zone on Cloudflare (it already is).

```powershell
# 1. Authenticate cloudflared to the Cloudflare account (opens a browser,
#    pick the mith.tech zone). Writes ~/.cloudflared/cert.pem.
cloudflared tunnel login

# 2. Create the named tunnel. Writes ~/.cloudflared/<UUID>.json (SECRET).
cloudflared tunnel create orbit

# 3. Point the subdomain at the tunnel (creates a proxied CNAME in mith.tech).
cloudflared tunnel route dns orbit orbit.mith.tech

# 4. Write ~/.cloudflared/config.yml — see config.example.yml in this folder,
#    fill in YOUR tunnel UUID and the credentials-file path.

# 5. Run it.
cloudflared tunnel run orbit
```

Verify the public URL works:

```powershell
curl https://orbit.mith.tech/health      # -> {"status":"ok","service":"orbit-backend"}
```

## Notes / gotchas

- **The credentials file (`~/.cloudflared/<UUID>.json`) is a secret** — never
  commit it. Only `config.example.yml` (this folder) is committed.
- **The laptop must be awake and the tunnel process running** for the URL to be
  live. Disable laptop sleep during demos.
- **Run on demand, or install as a service.** For an always-on URL, install it
  as a Windows service so it survives reboots:
  `cloudflared service install` (run from an elevated prompt; uses
  `~/.cloudflared/config.yml`). Then it starts with Windows.
- **First-ever request after creating the hostname** can take a minute while
  Cloudflare issues the Universal SSL cert. After that it's instant.
- **The APK's baked URL** lives in `apps/mobile-field-sales/.env`
  (`EXPO_PUBLIC_MOBILE_API_BASE_URL=https://orbit.mith.tech`). The in-app
  "Advanced — server URL" field still overrides it for local dev/testing.
- **Want a second hostname** (e.g. expose the dashboard on `:3001`)? Add another
  `hostname:`/`service:` pair to the ingress in `~/.cloudflared/config.yml` and
  `cloudflared tunnel route dns orbit <name>.mith.tech`. Keep it a single-level
  subdomain — Cloudflare's free Universal SSL covers the apex + one level only.
```
