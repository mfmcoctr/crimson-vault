import React, { useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Coins,
  Download,
  FolderOpen,
  Image as ImageIcon,
  KeyRound,
  RotateCcw,
  Save,
  Shield,
  Sliders,
  Upload,
} from 'lucide-react';
import { api } from '../api';
import type { AppSettings, BackgroundFit, BackgroundMode, CurrencyCode } from '../types';
import { useToast } from '../components/Toast';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onSettingsReplaced: (next: AppSettings) => void;
  onVaultRestored: () => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  onSettingsReplaced,
  onVaultRestored,
}) => {
  const { notify } = useToast();
  const bgInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Local editable rates
  const [rates, setRates] = useState(settings.exchangeRates);
  const [defaultCurrency, setDefaultCurrency] = useState<CurrencyCode>(settings.defaultCurrency);

  // Local folder slideshow controls
  const [folderPathInput, setFolderPathInput] = useState(settings.backgroundFolderPath || '');
  const [testingFolder, setTestingFolder] = useState(false);
  const [folderCheckResult, setFolderCheckResult] = useState<{ count: number; resolvedPath: string } | null>(null);

  // Change master password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  // Encrypted backup export/import
  const [exportPass, setExportPass] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPass, setImportPass] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);

  const handleSaveCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings({
      defaultCurrency,
      exchangeRates: {
        TRY: 1,
        USD: Number(rates.USD) || 36.5,
        EUR: Number(rates.EUR) || 39.5,
        GBP: Number(rates.GBP) || 46.2,
      },
    });
    notify('Para birimi ve döviz kurları güncellendi.');
  };

  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const next = await api.uploadCustomBackground(file);
      onSettingsReplaced(next);
      notify('Özel arka plan görseliniz uygulandı!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Görsel yüklenemedi.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleResetBg = async () => {
    const next = await api.resetBackground();
    onSettingsReplaced(next);
    notify('Varsayılan dark fantasy görseline dönüldü.');
  };

  const handleApplyFolderSlideshow = async () => {
    if (!folderPathInput.trim()) {
      notify('Lütfen görsellerin bulunduğu yerel klasör yolunu girin.', 'error');
      return;
    }
    setTestingFolder(true);
    setFolderCheckResult(null);
    try {
      const check = await api.testBackgroundFolder(folderPathInput.trim(), settings.slideshowIncludeSubfolders);
      setFolderCheckResult({ count: check.count, resolvedPath: check.resolvedPath });
      if (check.count === 0) {
        notify('Klasör bulundu ancak içinde desteklenen görsel (.jpg/.png/.webp/.gif/.avif) bulunamadı.', 'info');
        return;
      }
      await onUpdateSettings({
        backgroundMode: 'folder',
        backgroundFolderPath: check.resolvedPath,
      });
      setFolderPathInput(check.resolvedPath);
      notify(`Klasör slayt gösterisi aktif! ${check.count} görsel bulundu.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Klasör doğrulanamadı.', 'error');
    } finally {
      setTestingFolder(false);
    }
  };

  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      notify('Yeni ana parola en az 6 karakter olmalıdır.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify('Yeni parolalar eşleşmiyor.', 'error');
      return;
    }
    setChangingPass(true);
    try {
      await api.changeMasterPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('Ana parolanız başarıyla değiştirildi ve kasa anahtarı yeniden sarıldı.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Parola değiştirilemedi.', 'error');
    } finally {
      setChangingPass(false);
    }
  };

  const handleExportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (exportPass.length < 6) {
      notify('Yedek parolası en az 6 karakter olmalıdır.', 'error');
      return;
    }
    setExporting(true);
    try {
      const blob = await api.exportBackup(exportPass);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personvault-yedek-${new Date().toISOString().slice(0, 10)}.pvault`;
      a.click();
      URL.revokeObjectURL(url);
      setExportPass('');
      notify('Şifreli tam kasa yedeği (.pvault) indirildi.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Yedek alınamadı.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !importPass) {
      notify('Lütfen yedek dosyasını seçip parolasını girin.', 'error');
      return;
    }
    if (
      importMode === 'replace' &&
      !window.confirm('DİKKAT: "Tüm Kasayı Değiştir" mevcut kayıtlarınızı yedekle değiştirecektir. Devam edilsin mi?')
    ) {
      return;
    }
    setImporting(true);
    try {
      const res = await api.importBackup(importFile, importPass, importMode);
      setImportFile(null);
      setImportPass('');
      await onVaultRestored();
      notify(
        `Yedek geri yüklendi! (${res.restored.passwords} şifre, ${res.restored.subscriptions} abonelik, ${res.restored.clients} müşteri)`,
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Yedek geri yüklenemedi.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleTestNotification = async () => {
    if (!('Notification' in window)) {
      notify('Bu tarayıcı bildirim API desteklemiyor.', 'error');
      return;
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('PersonVault Test Bildirimi', {
        body: 'Doğum günleri ve abonelik hatırlatmaları bu şekilde görünecektir.',
      });
      notify('Test bildirimi gönderildi.');
    } else {
      notify('Tarayıcı bildirim izni reddedildi.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">Ayarlar, Görünüm & Şifreli Yedekleme</h1>
        <p className="text-sm text-[#C8B5BC] mt-0.5">
          Dark fantasy arka plan görünürlüğünü, döviz kurlarını, kasa güvenliğini ve şifreli yedeklerinizi yönetin.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appearance & Background Controls */}
        <div className="pv-glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Sliders className="w-5 h-5 text-rose-400" />
            <span>Görünüm, Arka Plan & Klasör Slayt Gösterisi</span>
          </div>

          {/* 3-way Background Mode Switcher */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/45 border border-white/10 text-xs">
            {[
              { id: 'default' as BackgroundMode, label: 'Varsayılan' },
              { id: 'custom' as BackgroundMode, label: 'Tek Görsel' },
              { id: 'folder' as BackgroundMode, label: 'Klasör Slaytı' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onUpdateSettings({ backgroundMode: m.id })}
                className={`py-2 rounded-lg font-medium transition-all cursor-pointer ${
                  settings.backgroundMode === m.id
                    ? 'bg-[#9F1239] text-white shadow'
                    : 'text-[#C8B5BC] hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Folder Slideshow Configuration */}
          {settings.backgroundMode === 'folder' && (
            <div className="rounded-xl bg-black/40 border border-rose-500/25 p-4 space-y-3.5">
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1.5 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-rose-400" />
                  Yerel Görsel Klasör Yolu
                </label>
                <div className="flex gap-2">
                  <input
                    value={folderPathInput}
                    onChange={(e) => setFolderPathInput(e.target.value)}
                    placeholder="Örn: D:\Resimler\ArkaPlanlar"
                    className="pv-input text-xs font-mono-code flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleApplyFolderSlideshow}
                    disabled={testingFolder}
                    className="pv-btn-primary text-xs shrink-0"
                  >
                    {testingFolder ? 'Taranıyor...' : 'Doğrula & Uygula'}
                  </button>
                </div>
                {folderCheckResult && (
                  <div className="text-[11px] text-emerald-300 mt-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {folderCheckResult.count} görsel hazır ({folderCheckResult.resolvedPath})
                    </span>
                  </div>
                )}
              </div>

              {/* Slideshow Interval */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#D7C7CC]">Otomatik Geçiş Süresi</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={3}
                      max={3600}
                      value={settings.slideshowIntervalSeconds}
                      onChange={(e) =>
                        onUpdateSettings({ slideshowIntervalSeconds: Math.max(3, Number(e.target.value) || 30) })
                      }
                      className="w-16 px-2 py-0.5 rounded-lg bg-black/60 border border-white/15 text-right font-mono-code text-white text-xs"
                    />
                    <span className="text-[#B8A2AA]">sn</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={5}
                  max={300}
                  step={5}
                  value={Math.min(300, settings.slideshowIntervalSeconds)}
                  onChange={(e) => onUpdateSettings({ slideshowIntervalSeconds: Number(e.target.value) })}
                  className="w-full pv-slider"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { s: 5, l: '5 sn' },
                    { s: 15, l: '15 sn' },
                    { s: 30, l: '30 sn' },
                    { s: 60, l: '1 dk' },
                    { s: 180, l: '3 dk' },
                    { s: 300, l: '5 dk' },
                  ].map((p) => (
                    <button
                      key={p.s}
                      type="button"
                      onClick={() => onUpdateSettings({ slideshowIntervalSeconds: p.s })}
                      className={`px-2 py-0.5 rounded-md text-[11px] cursor-pointer ${
                        settings.slideshowIntervalSeconds === p.s
                          ? 'bg-[#9F1239] text-white'
                          : 'bg-white/8 text-[#D7C7CC] hover:bg-white/15'
                      }`}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.slideshowShuffle}
                    onChange={(e) => onUpdateSettings({ slideshowShuffle: e.target.checked })}
                    className="accent-[#BE123C]"
                  />
                  <span className="text-white">Karışık Sıra (Shuffle)</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.slideshowIncludeSubfolders}
                    onChange={(e) => onUpdateSettings({ slideshowIncludeSubfolders: e.target.checked })}
                    className="accent-[#BE123C]"
                  />
                  <span className="text-white">Alt Klasörleri Dahil Et</span>
                </label>
              </div>

              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1">Görsel Sığdırma Modu</label>
                <select
                  value={settings.backgroundFit}
                  onChange={(e) => onUpdateSettings({ backgroundFit: e.target.value as BackgroundFit })}
                  className="pv-select w-full text-xs"
                >
                  <option value="cover">Tam Ekran Doldur (Cover)</option>
                  <option value="contain">Kırpmadan Tam Göster + Bulanık Kenarlık (Dikey Görseller İçin İdeal)</option>
                </select>
              </div>

              <p className="text-[11px] text-[#A8929A]">
                Gizlilik notu: Klasördeki slayt görselleri yalnızca kasa kilidiniz açıldıktan sonra yüklenir; üst çubuktan slaytı duraklatabilir veya ileri/geri geçebilirsiniz.
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#D7C7CC]">Arka Plan Görünürlüğü (Opaklık)</span>
                <span className="font-mono-code text-white">{Math.round(settings.backgroundOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.02}
                value={settings.backgroundOpacity}
                onChange={(e) => onUpdateSettings({ backgroundOpacity: Number(e.target.value) })}
                className="w-full pv-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#D7C7CC]">Arka Plan Bulanıklığı (Blur)</span>
                <span className="font-mono-code text-white">{settings.backgroundBlur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={18}
                step={1}
                value={settings.backgroundBlur}
                onChange={(e) => onUpdateSettings({ backgroundBlur: Number(e.target.value) })}
                className="w-full pv-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#D7C7CC]">Cam Kart Opaklığı (Okunabilirlik)</span>
                <span className="font-mono-code text-white">{Math.round(settings.cardOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.45}
                max={0.94}
                step={0.02}
                value={settings.cardOpacity}
                onChange={(e) => onUpdateSettings({ cardOpacity: Number(e.target.value) })}
                className="w-full pv-slider"
              />
            </div>

            {settings.backgroundMode !== 'folder' && (
              <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2.5">
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUploadBg}
                  className="hidden"
                />
                <button type="button" onClick={() => bgInputRef.current?.click()} className="pv-btn-primary text-xs">
                  <ImageIcon className="w-4 h-4" />
                  Tek Özel Görsel Yükle
                </button>
                {settings.hasCustomBackground && (
                  <button type="button" onClick={handleResetBg} className="pv-btn-secondary text-xs">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Varsayılan Dark Fantasy Görseline Dön
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Currency & Exchange Rates */}
        <form onSubmit={handleSaveCurrency} className="pv-glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Coins className="w-5 h-5 text-rose-400" />
            <span>Para Birimi & Döviz Kurları</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Varsayılan Özet Para Birimi</label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value as CurrencyCode)}
                className="pv-select w-full"
              >
                <option value="TRY">Türk Lirası (TRY ₺)</option>
                <option value="USD">Amerikan Doları (USD $)</option>
                <option value="EUR">Euro (EUR €)</option>
                <option value="GBP">İngiliz Sterlini (GBP £)</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1">1 USD = ? TRY</label>
                <input
                  type="number"
                  step="0.01"
                  value={rates.USD}
                  onChange={(e) => setRates({ ...rates, USD: Number(e.target.value) })}
                  className="pv-input font-mono-code"
                />
              </div>
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1">1 EUR = ? TRY</label>
                <input
                  type="number"
                  step="0.01"
                  value={rates.EUR}
                  onChange={(e) => setRates({ ...rates, EUR: Number(e.target.value) })}
                  className="pv-input font-mono-code"
                />
              </div>
              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1">1 GBP = ? TRY</label>
                <input
                  type="number"
                  step="0.01"
                  value={rates.GBP}
                  onChange={(e) => setRates({ ...rates, GBP: Number(e.target.value) })}
                  className="pv-input font-mono-code"
                />
              </div>
            </div>

            <p className="text-[11px] text-[#A8929A]">
              Uygulama tamamen çevrimdışı yerel çalıştığı için abonelik maliyet toplamı burada girdiğiniz kurlarla hesaplanır.
            </p>

            <div className="flex justify-end">
              <button type="submit" className="pv-btn-primary text-xs">
                <Save className="w-4 h-4" />
                Kurları Kaydet
              </button>
            </div>
          </div>
        </form>

        {/* Security Preferences & Change Master Password */}
        <div className="pv-glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Shield className="w-5 h-5 text-rose-400" />
            <span>Güvenlik & Oturum Tercihleri</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Pano Otomatik Temizleme</label>
              <select
                value={settings.clipboardClearSeconds}
                onChange={(e) => onUpdateSettings({ clipboardClearSeconds: Number(e.target.value) })}
                className="pv-select w-full"
              >
                <option value={0}>Kapalı</option>
                <option value={15}>15 saniye sonra</option>
                <option value={30}>30 saniye sonra</option>
                <option value={60}>60 saniye sonra</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Otomatik Kilitlenme</label>
              <select
                value={settings.autoLockMinutes}
                onChange={(e) => onUpdateSettings({ autoLockMinutes: Number(e.target.value) })}
                className="pv-select w-full"
              >
                <option value={0}>Kapalı (Uygulama açıkken kilitleme)</option>
                <option value={5}>5 dakika hareketsizlik</option>
                <option value={15}>15 dakika hareketsizlik</option>
                <option value={30}>30 dakika hareketsizlik</option>
                <option value={60}>60 dakika hareketsizlik</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[#D7C7CC]">Masaüstü / Tarayıcı Hatırlatma Bildirimleri</span>
            <button type="button" onClick={handleTestNotification} className="pv-btn-secondary text-xs py-1.5">
              <Bell className="w-3.5 h-3.5 text-rose-300" />
              Test Bildirimi Gönder
            </button>
          </div>

          <form onSubmit={handleChangeMasterPassword} className="pt-4 border-t border-white/10 space-y-3">
            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-rose-400" />
              Ana Parolayı Değiştir
            </div>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Mevcut ana parola"
              className="pv-input text-xs"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni ana parola (min 6)"
                className="pv-input text-xs"
                required
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yeni ana parola (tekrar)"
                className="pv-input text-xs"
                required
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={changingPass} className="pv-btn-secondary text-xs">
                {changingPass ? 'Güncelleniyor...' : 'Ana Parolayı Güncelle'}
              </button>
            </div>
          </form>
        </div>

        {/* Encrypted Backup Export & Import (.pvault) */}
        <div className="pv-glass-crimson rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Download className="w-5 h-5 text-rose-300" />
            <span>Şifreli Kasa Yedeği (Export / Import)</span>
          </div>

          {/* Export */}
          <form onSubmit={handleExportBackup} className="space-y-3">
            <div className="text-xs font-medium text-rose-100">
              Tam Yedek Al (.pvault — AES-256-GCM şifreli)
            </div>
            <p className="text-xs text-[#D7C7CC]">
              Tüm şifreler, abonelikler, notlar, takvim kayıtları, müşteri kasaları ve şifreli dosyalar tek bir şifreli yedek dosyasına paketlenir.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={exportPass}
                onChange={(e) => setExportPass(e.target.value)}
                placeholder="Yedek şifreleme parolası (min 6 karakter)"
                className="pv-input text-xs flex-1"
                required
              />
              <button type="submit" disabled={exporting} className="pv-btn-primary text-xs shrink-0">
                <Download className="w-4 h-4" />
                {exporting ? 'Hazırlanıyor...' : 'Yedeği İndir'}
              </button>
            </div>
          </form>

          {/* Import */}
          <form onSubmit={handleImportBackup} className="pt-4 border-t border-white/15 space-y-3">
            <div className="text-xs font-medium text-rose-100">Şifreli Yedekten Geri Yükle</div>
            <input
              ref={backupInputRef}
              type="file"
              accept=".pvault,.json"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => backupInputRef.current?.click()}
                className="pv-btn-secondary text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                {importFile ? importFile.name : '.pvault Dosyası Seç'}
              </button>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
                className="pv-select text-xs py-1.5"
              >
                <option value="merge">Mevcut verilerle birleştir</option>
                <option value="replace">Tüm kasayı yedekle değiştir</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={importPass}
                onChange={(e) => setImportPass(e.target.value)}
                placeholder="Yedek dosyasının parolası"
                className="pv-input text-xs flex-1"
              />
              <button
                type="submit"
                disabled={importing || !importFile}
                className="pv-btn-primary text-xs shrink-0"
              >
                {importing ? 'Çözülüyor...' : 'Geri Yükle'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

