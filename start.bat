@echo off
chcp 65001 >nul
title PersonVault — Yerel Sifreli Kasa
cd /d "%~dp0"

if not exist "node_modules" (
  echo [PersonVault] Bagimliliklar yukleniyor...
  call npm install
)

if not exist "dist\index.html" (
  echo [PersonVault] Arayuz derleniyor...
  call npm run build
)

echo.
echo  PersonVault baslatiliyor: http://127.0.0.1:4848
if exist "C:\Program Files\Tailscale\tailscale.exe" (
  "C:\Program Files\Tailscale\tailscale.exe" serve status 2>nul | findstr /i "https://"
)
echo  Kapatmak icin bu pencereyi kapatabilirsiniz.
echo.
start "" "http://127.0.0.1:4848"
call npm start
