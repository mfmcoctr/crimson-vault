# PersonVault — Crimson Sanctum

[English](README.md) | [Deutsch](README.de.md) | **Türkçe**

Yerel olarak çalışan, tüm hassas verilerinizi **AES-256-GCM + scrypt** ile şifrelenmiş yerel bir SQLite veritabanında (`data/personvault.db`) saklayan kişisel ve müşteri kasası uygulaması.

## Özellikler

- **Çoklu Dil Desteği (`TR` / `EN` / `DE`):** Kilit ekranında, üst çubukta ve Ayarlar'da tek tıkla Türkçe, İngilizce ve Almanca geçişi — tarih/para birimi biçimlendirmesi ve dile özel parola cümlesi (passphrase) desteği.
- **Şifre Kasası:** AES-256-GCM şifreli parola saklama, özel alanlar, zayıf/tekrarlanan şifre güvenlik analizi, rastgele & kelime bazlı (Passphrase) güçlü şifre üretici, tek tıkla kopyalama ve otomatik pano temizleme.
- **Abonelik Takibi:** TRY/USD/EUR/GBP çoklu para birimi, Ayarlar'dan düzenlenebilir döviz kurlarıyla aylık/yıllık toplam maliyet özeti, kategori dağılımı ve tek tıkla dönem ilerletme.
- **Güvenli Markdown Notlar:** Bölünmüş canlı önizleme, etiketler, sabitleme, `Ctrl+S` hızlı kaydetme.
- **Akıllı Takvim & Hatırlatmalar:** Doğum günlerinde otomatik yaş hesabı, yıllık/aylık tekrar, yaklaşan günler geri sayımı, takvim üzerinde abonelik yenilemeleri ve uygulama içi + tarayıcı bildirimleri.
- **Müşteri Kasaları & Toplu ZIP / Arşiv İçe Aktarma:**
  - Her web sitesi müşterisi için izole kasa (Erişim Bilgileri, Notlar/`.env`, AES-256-GCM Şifreli Dosyalar).
  - Parola korumalı (ZipCrypto & AES-256) ve standart `.zip` arşivlerini, Chrome/Bitwarden/1Password `.csv`/`.json` listelerini, `.env`, `.txt`/`.md`, `.pem`/`.ppk`/`.crt`/`.key` dosyalarını bellekte ayrıştırır, önizleme sunar ve hedef müşteri kasasına şifreleyerek kaydeder.
  - Müşteri kasasını parola korumalı AES-256 ZIP olarak dışa aktarma.
- **Canlı Piyasalar, Altın, Avusturya Yakıt & Yerel Haberler:** Kripto takip listesi, altın/gümüş spot fiyatları, ECB döviz senkronizasyonu, resmi E-Control Hallein/Salzburg yakıt fiyatları, Top 10 bölge haberleri ve ürün/indirim takibi.
- **Evrensel Arama (`Ctrl+K`) & Tam Şifreli Yedekleme (`.pvault`):** Tüm kasa içinde anında arama ve parola korumalı tam kasa yedek alma/geri yükleme.
- **Koyu Kırmızı & Beyaz Dark Fantasy Tasarım:** Göz yormayan buzlu cam kartlar, Ayarlar'dan canlı ayarlanabilen arka plan opaklığı/bulanıklığı, özel arka plan görseli ve yerel klasör slayt gösterisi.

## Çalıştırma

### Tek Tıkla (Windows)
`start.bat` dosyasına çift tıklayın — uygulama otomatik olarak derlenir, yerel sunucu `http://127.0.0.1:4848` adresinde başlar ve tarayıcıda açılır.

### Terminalden
```bash
npm install
npm run build
npm start
```
Geliştirme modu (hot-reload):
```bash
npm run dev
```

## Mobil Kullanım (Evde + Dışarıda Senkron PWA — Tailscale HTTPS)

PersonVault tam ekran **PWA (Ana Ekrana Ekle)** ve çoklu cihaz oturumu (PC + Telefon aynı anda açık) destekler:

1. Windows'ta [tailscale-setup.bat](tailscale-setup.bat) dosyasını çalıştırın (Tailscale'i kurar, oturum açtırır ve `tailscale serve --bg http://127.0.0.1:4848` ile otomatik HTTPS tünelini etkinleştirir).
2. Telefonunuza da ücretsiz **Tailscale** uygulamasını (iOS / Android) kurup aynı hesapla giriş yapın.
3. Uygulamada **Ayarlar & Yedek → Mobil Erişim & Tailscale HTTPS** bölümündeki QR kodu telefonunuzla okutup tarayıcıdan **"Ana Ekrana Ekle"** deyin.
4. Evde Wi-Fi'da ve dışarıda 4G/5G'de aynı şifreli kasaya gerçek zamanlı erişin.
