# PersonVault — Crimson Sanctum

[English](README.md) | **Deutsch** | [Türkçe](README.tr.md)

Ein lokal betriebener persönlicher & Kunden-Tresor, der alle sensiblen Daten in einer mit **AES-256-GCM + scrypt** verschlüsselten SQLite-Datenbank (`data/personvault.db`) speichert.

## Funktionen

- **Mehrsprachige Oberfläche (`TR` / `EN` / `DE`):** Sofortiger Sprachwechsel auf dem Sperrbildschirm, in der oberen Leiste und in den Einstellungen – inklusive lokalisierter Datums-/Währungsformate und mehrsprachiger Passphrasen.
- **Passwort-Tresor:** AES-256-GCM verschlüsselte Zugangsdaten, benutzerdefinierte Geheimfelder, Sicherheitsprüfung für schwache/doppelte Passwörter, kryptografischer Zufalls- & Passphrasen-Generator sowie automatische Zwischenablagen-Löschung.
- **Abo-Verwaltung:** Mehrwährungs-Support (`TRY`/`USD`/`EUR`/`GBP`), anpassbare Wechselkurse, monatliche & jährliche Kostenübersicht, Kategorie-Aufteilung und 1-Klick-Verlängerung.
- **Sichere Markdown-Notizen:** Geteilte Live-Vorschau, Tags, Anpinnen und `Strg+S`-Schnellspeichern.
- **Smarter Kalender & Erinnerungen:** Automatische Altersberechnung bei Geburtstagen, jährliche/monatliche Wiederholungen, Countdown, Abo-Verlängerungen im Kalender sowie Browser-Benachrichtigungen.
- **Kunden-Tresore & ZIP-/Archiv-Import:**
  - Isolierter Tresor je Web-Kunde (Zugangsdaten, Notizen/`.env`, AES-256-GCM verschlüsselte Dateien).
  - Liest passwortgeschützte (ZipCrypto & AES-256) und normale `.zip`-Archive, Chrome/Bitwarden/1Password `.csv`/`.json`, `.env`, `.txt`/`.md` und `.pem`/`.ppk`/`.crt`/`.key` direkt im Speicher mit Vorschau aus.
  - Export einzelner Kunden-Tresore als passwortgeschütztes AES-256-ZIP.
- **Live-Märkte, Gold, Österreich-Spritpreise & Regionalnews:** Krypto-Watchlist, Gold-/Silber-Spotpreise, EZB-Wechselkurse, offizielle E-Control Spritpreise (Hallein / Salzburg), regionale Top-10-News und Preisalarm-Tracker.
- **Universelle Suche (`Strg+K`) & Verschlüsseltes Voll-Backup (`.pvault`):** Blitzschnelle Suche im gesamten Tresor und passwortgeschützter Backup-Export/-Import.
- **Crimson Sanctum Dark-Fantasy-Design:** Milchglas-Karten mit anpassbarer Deckkraft/Unschärfe, eigenem Hintergrundbild oder lokaler Ordner-Diashow.

## Starten

### Ein-Klick (Windows)
Doppelklick auf `start.bat` — die App wird automatisch gebaut, der lokale Server startet auf `http://127.0.0.1:4848` und öffnet sich im Browser.

### Über das Terminal
```bash
npm install
npm run build
npm start
```

Entwicklungsmodus (Hot-Reload):
```bash
npm run dev
```

## Mobile PWA-Synchronisation (WLAN + 4G/5G über Tailscale HTTPS)

PersonVault unterstützt Vollbild-**PWA (Zum Startbildschirm hinzufügen)** und gleichzeitige Sitzungen auf PC & Smartphone:

1. Unter Windows [tailscale-setup.bat](tailscale-setup.bat) ausführen (richtet Tailscale und `tailscale serve --bg http://127.0.0.1:4848` automatisch ein).
2. Die kostenlose **Tailscale**-App auf iOS / Android installieren und mit demselben Konto anmelden.
3. In **Einstellungen & Backup → Mobiler Zugriff & Tailscale HTTPS** den QR-Code scannen und **„Zum Startbildschirm hinzufügen“** wählen.
4. Zuhause im WLAN und unterwegs über 4G/5G in Echtzeit sicher auf den eigenen Tresor zugreifen.
