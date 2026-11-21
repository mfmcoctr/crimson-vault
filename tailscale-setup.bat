@echo off
chcp 65001 >nul
title PersonVault — Tailscale Mobil HTTPS Kurulumu
cd /d "%~dp0"

echo.
echo  =========================================================
echo    PersonVault — Tailscale Mobil HTTPS Tünel Kurulumu
echo  =========================================================
echo.

set "TS_CMD=tailscale"
where tailscale >nul 2>&1
if errorlevel 1 (
  if exist "C:\Program Files\Tailscale\tailscale.exe" (
    set "TS_CMD=C:\Program Files\Tailscale\tailscale.exe"
  ) else (
    echo [1/3] Tailscale bulunamadi, winget ile kuruluyor...
    winget install --id Tailscale.Tailscale --exact --accept-package-agreements --accept-source-agreements
    if exist "C:\Program Files\Tailscale\tailscale.exe" (
      set "TS_CMD=C:\Program Files\Tailscale\tailscale.exe"
    )
  )
)

echo [2/3] Tailscale oturumu kontrol ediliyor...
"%TS_CMD%" status >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Tarayicida acilacak Tailscale giris ekranindan giris yapin...
  "%TS_CMD%" up
)

echo.
echo [3/3] PersonVault icin otomatik HTTPS tuneli (tailscale serve) aciliyor...
"%TS_CMD%" serve --bg http://127.0.0.1:4848

echo.
echo  =========================================================
echo   Aktif Tailscale HTTPS Adresiniz:
echo  =========================================================
"%TS_CMD%" serve status
echo.
echo  Simdi telefonunuza da Tailscale uygulamasini kurup ayni
echo  hesapla giris yapin, yukaridaki https://...ts.net adresini
echo  telefon tarayicisinda acin ve "Ana Ekrana Ekle" deyin!
echo  (Ayarlar -> Mobil Erisim bolumunde QR kodunuz da hazirdir.)
echo.
pause

