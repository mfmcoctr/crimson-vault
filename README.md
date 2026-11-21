# PersonVault — Crimson Sanctum

**English** | [Deutsch](README.de.md) | [Türkçe](README.tr.md)

A self-hosted, local-first personal & client vault that stores all sensitive data inside an **AES-256-GCM + scrypt** encrypted SQLite database (`data/personvault.db`).

## Features

- **Multilingual UI (`TR` / `EN` / `DE`):** Instant language switcher on the lock screen, top bar, and Settings — with localized date/currency formatting and language-specific passphrases.
- **Password Vault:** AES-256-GCM encrypted credentials, custom secret fields, weak/reused password security audit, cryptographic random & word-based passphrase generator, and auto-clearing clipboard.
- **Subscription Tracker:** Multi-currency (`TRY`/`USD`/`EUR`/`GBP`) tracking with editable exchange rates, monthly & yearly spending projections, category breakdown, and one-click billing period advance.
- **Secure Markdown Notes:** Split live preview, tags, pinning, and `Ctrl+S` quick save.
- **Smart Calendar & Reminders:** Automatic birthday age calculation, yearly/monthly recurrence, countdowns, subscription renewals on calendar, and browser notifications.
- **Client Vaults & Bulk ZIP / Archive Importer:**
  - Isolated encrypted vaults per client (Credentials, Notes/`.env`, AES-256-GCM Encrypted Files).
  - Parses password-protected (ZipCrypto & AES-256) and standard `.zip` archives, Chrome/Bitwarden/1Password `.csv`/`.json` exports, `.env`, `.txt`/`.md`, and `.pem`/`.ppk`/`.crt`/`.key` files in memory with interactive preview.
  - Export any client vault as a password-protected AES-256 ZIP.
- **Live Markets, Gold, Austria Fuel & Local News:** Live Crypto watchlist, Gold/Silver spot prices, ECB FX sync, official Austria E-Control fuel prices (Hallein / Salzburg), regional Top 10 news, and a Deal / Price Drop tracker.
- **Universal Search (`Ctrl+K`) & Full Encrypted Backup (`.pvault`):** Instant search across the entire vault and password-protected full backup export/restore.
- **Crimson Sanctum Dark Fantasy UI:** Translucent frosted-glass cards with customizable opacity/blur, custom wallpaper upload, and local folder slideshow.

## Quick Start

### One-Click (Windows)
Double-click `start.bat` — the app builds automatically, starts the local server at `http://127.0.0.1:4848`, and opens in your browser.

### From Terminal
```bash
npm install
npm run build
npm start
```

Development mode (hot-reload):
```bash
npm run dev
```

## Mobile Sync PWA (Home Wi-Fi + 4G/5G via Tailscale HTTPS)

PersonVault supports full-screen **PWA (Add to Home Screen)** and multi-device sessions (PC + Phone synced live):

1. On Windows, run [tailscale-setup.bat](tailscale-setup.bat) (installs Tailscale, signs in, and enables `tailscale serve --bg http://127.0.0.1:4848`).
2. Install the free **Tailscale** app on iOS / Android and sign in with the same account.
3. Open **Settings & Backup → Mobile Access & Tailscale HTTPS**, scan the QR code, and choose **"Add to Home Screen"**.
4. Access your encrypted vault securely from home Wi-Fi or 4G/5G in real time.
