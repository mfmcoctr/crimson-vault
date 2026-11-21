import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Coins,
  Copy,
  Download,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  Sliders,
  Smartphone,
  Upload,
  Wifi,
} from 'lucide-react';
import { api } from '../api';
import type { AppLanguage, AppSettings, BackgroundFit, BackgroundMode, CurrencyCode, MobileAccessInfo } from '../types';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

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
  const { t } = useI18n();
  const { notify, copySecret } = useToast();
  const bgInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Mobile / Tailscale live info
  const [mobileInfo, setMobileInfo] = useState<MobileAccessInfo | null>(null);
  const [loadingMobile, setLoadingMobile] = useState(false);
  const [enablingServe, setEnablingServe] = useState(false);

  const loadMobileInfo = async () => {
    setLoadingMobile(true);
    try {
      setMobileInfo(await api.getMobileAccessInfo());
    } catch {
      // ignore
    } finally {
      setLoadingMobile(false);
    }
  };

  useEffect(() => {
    loadMobileInfo();
  }, []);

  const handleLanguagePersist = async (nextLang: AppLanguage) => {
    await onUpdateSettings({ language: nextLang });
    notify(t('set.langUpdated'));
  };

  const handleEnableTailscaleServe = async () => {
    setEnablingServe(true);
    try {
      const updated = await api.enableTailscaleServe();
      setMobileInfo(updated);
      if (updated.serveActive && updated.tailscaleHttpsUrl) {
        notify(t('set.tsTunnelOpened', { url: updated.tailscaleHttpsUrl }));
      } else {
        notify(t('set.tsServeRan'), 'info');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t('set.tsServeFailed'), 'error');
    } finally {
      setEnablingServe(false);
    }
  };

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
    notify(t('set.currencySaved'));
  };

  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const next = await api.uploadCustomBackground(file);
      onSettingsReplaced(next);
      notify(t('set.bgUploaded'));
    } catch (err) {
      notify(err instanceof Error ? err.message : t('set.bgUploadError'), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleResetBg = async () => {
    const next = await api.resetBackground();
    onSettingsReplaced(next);
    notify(t('set.bgReset'));
  };

  const handleApplyFolderSlideshow = async () => {
    if (!folderPathInput.trim()) {
      notify(t('set.folderRequired'), 'error');
      return;
    }
    setTestingFolder(true);
    setFolderCheckResult(null);
    try {
      const check = await api.testBackgroundFolder(folderPathInput.trim(), settings.slideshowIncludeSubfolders);
      setFolderCheckResult({ count: check.count, resolvedPath: check.resolvedPath });
      if (check.count === 0) {
        notify(t('set.folderEmpty'), 'info');
        return;
      }
      await onUpdateSettings({
        backgroundMode: 'folder',
        backgroundFolderPath: check.resolvedPath,
      });
      setFolderPathInput(check.resolvedPath);
      notify(t('set.folderActive', { count: check.count }));
    } catch (err) {
      notify(err instanceof Error ? err.message : t('set.folderError'), 'error');
    } finally {
      setTestingFolder(false);
    }
  };

  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      notify(t('set.passMinError'), 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify(t('set.passMismatch'), 'error');
      return;
    }
    setChangingPass(true);
    try {
      await api.changeMasterPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify(t('set.passChanged'));
    } catch (err) {
      notify(err instanceof Error ? err.message : t('set.passChangeError'), 'error');
    } finally {
      setChangingPass(false);
    }
  };

  const handleExportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (exportPass.length < 6) {
      notify(t('set.backupPassMin'), 'error');
      return;
    }
    setExporting(true);
    try {
      const blob = await api.exportBackup(exportPass);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personvault-backup-${new Date().toISOString().slice(0, 10)}.pvault`;
      a.click();
      URL.revokeObjectURL(url);
      setExportPass('');
      notify(t('set.backupDownloaded'));
    } catch (err) {
      notify(err instanceof Error ? err.message : t('set.backupExportError'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !importPass) {
      notify(t('set.backupImportSelect'), 'error');
      return;
    }
    if (importMode === 'replace' && !window.confirm(t('set.backupReplaceConfirm'))) {
      return;
    }
    setImporting(true);
    try {
      const res = await api.importBackup(importFile, importPass, importMode);
      setImportFile(null);
      setImportPass('');
      await onVaultRestored();
      notify(
        t('set.backupRestored', {
          passwords: res.restored.passwords,
          subscriptions: res.restored.subscriptions,
          clients: res.restored.clients,
        }),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : t('set.backupImportError'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleTestNotification = async () => {
    if (!('Notification' in window)) {
      notify(t('set.notifNotSupported'), 'error');
      return;
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification(t('set.testNotifTitle'), {
        body: t('set.testNotifBody'),
      });
      notify(t('set.testNotifSent'));
    } else {
      notify(t('set.testNotifDenied'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">{t('set.title')}</h1>
        <p className="text-sm text-[#C8B5BC] mt-0.5">{t('set.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Language Switcher Card (Full Width) */}
        <div className="lg:col-span-2 pv-glass rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 text-base font-semibold text-white">
              <Globe className="w-5 h-5 text-rose-400" />
              <span>{t('set.langTitle')}</span>
            </div>
            <p className="text-xs text-[#C8B5BC]">{t('set.langDesc')}</p>
          </div>
          <div className="w-full md:w-[360px] shrink-0">
            <LanguageSwitcher variant="full" onSelect={handleLanguagePersist} />
          </div>
        </div>

        {/* Mobile Access & Tailscale HTTPS Pairing (Full Width Card) */}
        <div className="lg:col-span-2 pv-glass-crimson rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-base font-semibold text-white">
              <Smartphone className="w-5 h-5 text-rose-300" />
              <span>{t('set.mobileTitle')}</span>
            </div>
            <button
              type="button"
              onClick={loadMobileInfo}
              disabled={loadingMobile}
              className="pv-btn-secondary text-xs py-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMobile ? 'animate-spin' : ''}`} />
              {t('set.refreshStatus')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            <div className="md:col-span-8 space-y-3.5">
              {/* Live Tailscale status pills */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={`px-2.5 py-1 rounded-full border ${
                    mobileInfo?.tailscaleInstalled
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                      : 'bg-amber-500/20 text-amber-200 border-amber-400/35'
                  }`}
                >
                  Tailscale:{' '}
                  {mobileInfo
                    ? mobileInfo.tailscaleInstalled
                      ? t('set.tsInstalled')
                      : t('set.tsNotInstalled')
                    : t('set.tsChecking')}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full border ${
                    mobileInfo?.tailscaleRunning
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                      : 'bg-white/10 text-[#D7C7CC] border-white/15'
                  }`}
                >
                  {t('set.sessionLabel')}{' '}
                  {mobileInfo?.tailscaleRunning ? t('set.sessionConnected') : t('set.sessionWaiting')}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full border ${
                    mobileInfo?.serveActive
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35'
                      : 'bg-white/10 text-[#D7C7CC] border-white/15'
                  }`}
                >
                  {t('set.tunnelLabel')} {mobileInfo?.serveActive ? t('set.tunnelActive') : t('set.tunnelOff')}
                </span>
              </div>

              {mobileInfo?.tailscaleHttpsUrl ? (
                <div className="rounded-xl bg-black/50 border border-rose-500/35 p-3.5 space-y-2.5">
                  <div className="text-[11px] uppercase tracking-wider text-rose-200">{t('set.personalHttps')}</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono-code text-sm text-white break-all">
                      {mobileInfo.tailscaleHttpsUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copySecret(mobileInfo.tailscaleHttpsUrl, t('set.tailscaleAddrLabel'), 0)}
                      className="pv-btn-secondary text-xs py-1.5 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {t('common.copy')}
                    </button>
                  </div>
                  {!mobileInfo.serveActive && (
                    <button
                      type="button"
                      onClick={handleEnableTailscaleServe}
                      disabled={enablingServe}
                      className="pv-btn-primary text-xs"
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      {enablingServe ? t('set.openingTunnel') : t('set.enableTunnelBtn')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-black/45 border border-white/10 p-3.5 text-xs text-[#E4D5DA] space-y-2">
                  <p>{t('set.tsStep1')}</p>
                  <p>{t('set.tsStep2')}</p>
                  <p>{t('set.tsStep3')}</p>
                </div>
              )}

              <div className="text-[11px] text-[#D7C7CC] leading-relaxed">{t('set.pwaHint')}</div>
            </div>

            {/* Scannable QR Code */}
            <div className="md:col-span-4 flex flex-col items-center justify-center">
              {mobileInfo?.qrSvg ? (
                <div className="p-3 rounded-2xl bg-black/60 border border-rose-500/35 shadow-xl flex flex-col items-center gap-2">
                  <div
                    className="w-40 h-40 [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: mobileInfo.qrSvg }}
                  />
                  <span className="text-[11px] text-rose-200 text-center">
                    {mobileInfo.tailscaleHttpsUrl ? t('set.qrTailscale') : t('set.qrLan')}
                  </span>
                </div>
              ) : (
                <div className="w-40 h-40 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-xs text-[#9C868E]">
                  {t('set.qrPreparing')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Appearance & Background Controls */}
        <div className="pv-glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Sliders className="w-5 h-5 text-rose-400" />
            <span>{t('set.appearanceTitle')}</span>
          </div>

          {/* 3-way Background Mode Switcher */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/45 border border-white/10 text-xs">
            {[
              { id: 'default' as BackgroundMode, label: t('set.bgDefault') },
              { id: 'custom' as BackgroundMode, label: t('set.bgCustom') },
              { id: 'folder' as BackgroundMode, label: t('set.bgFolder') },
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
                  {t('set.folderPathLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    value={folderPathInput}
                    onChange={(e) => setFolderPathInput(e.target.value)}
                    placeholder={t('set.folderPathPlaceholder')}
                    className="pv-input text-xs font-mono-code flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleApplyFolderSlideshow}
                    disabled={testingFolder}
                    className="pv-btn-primary text-xs shrink-0"
                  >
                    {testingFolder ? t('set.scanning') : t('set.verifyApply')}
                  </button>
                </div>
                {folderCheckResult && (
                  <div className="text-[11px] text-emerald-300 mt-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t('set.folderReady', { count: folderCheckResult.count, path: folderCheckResult.resolvedPath })}
                    </span>
                  </div>
                )}
              </div>

              {/* Slideshow Interval */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#D7C7CC]">{t('set.slideInterval')}</span>
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
                    <span className="text-[#B8A2AA]">{t('set.secShort')}</span>
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
                    { s: 5, l: `5 ${t('set.secShort')}` },
                    { s: 15, l: `15 ${t('set.secShort')}` },
                    { s: 30, l: `30 ${t('set.secShort')}` },
                    { s: 60, l: `1 ${t('set.minShort')}` },
                    { s: 180, l: `3 ${t('set.minShort')}` },
                    { s: 300, l: `5 ${t('set.minShort')}` },
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
                  <span className="text-white">{t('set.shuffle')}</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.slideshowIncludeSubfolders}
                    onChange={(e) => onUpdateSettings({ slideshowIncludeSubfolders: e.target.checked })}
                    className="accent-[#BE123C]"
                  />
                  <span className="text-white">{t('set.subfolders')}</span>
                </label>
              </div>

              <div>
                <label className="block text-xs text-[#D7C7CC] mb-1">{t('set.bgFitLabel')}</label>
                <select
                  value={settings.backgroundFit}
                  onChange={(e) => onUpdateSettings({ backgroundFit: e.target.value as BackgroundFit })}
                  className="pv-select w-full text-xs"
                >
                  <option value="cover">{t('set.bgFitCover')}</option>
                  <option value="contain">{t('set.bgFitContain')}</option>
                </select>
              </div>

              <p className="text-[11px] text-[#A8929A]">{t('set.folderPrivacyNote')}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#D7C7CC]">{t('set.bgOpacity')}</span>
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
                <span className="text-[#D7C7CC]">{t('set.bgBlur')}</span>
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
                <span className="text-[#D7C7CC]">{t('set.cardOpacity')}</span>
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
                  {t('set.uploadSingleBg')}
                </button>
                {settings.hasCustomBackground && (
                  <button type="button" onClick={handleResetBg} className="pv-btn-secondary text-xs">
                    <RotateCcw className="w-3.5 h-3.5" />
                    {t('set.resetBg')}
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
            <span>{t('set.currencyTitle')}</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('set.defaultCurrency')}</label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value as CurrencyCode)}
                className="pv-select w-full"
              >
                <option value="TRY">{t('set.currTry')}</option>
                <option value="USD">{t('set.currUsd')}</option>
                <option value="EUR">{t('set.currEur')}</option>
                <option value="GBP">{t('set.currGbp')}</option>
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

            <p className="text-[11px] text-[#A8929A]">{t('set.offlineRateNote')}</p>

            <div className="flex justify-end">
              <button type="submit" className="pv-btn-primary text-xs">
                <Save className="w-4 h-4" />
                {t('set.saveRates')}
              </button>
            </div>
          </div>
        </form>

        {/* Security Preferences & Change Master Password */}
        <div className="pv-glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Shield className="w-5 h-5 text-rose-400" />
            <span>{t('set.securityTitle')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('set.clipboardClear')}</label>
              <select
                value={settings.clipboardClearSeconds}
                onChange={(e) => onUpdateSettings({ clipboardClearSeconds: Number(e.target.value) })}
                className="pv-select w-full"
              >
                <option value={0}>{t('set.off')}</option>
                <option value={15}>{t('set.afterSec', { n: 15 })}</option>
                <option value={30}>{t('set.afterSec', { n: 30 })}</option>
                <option value={60}>{t('set.afterSec', { n: 60 })}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('set.autoLock')}</label>
              <select
                value={settings.autoLockMinutes}
                onChange={(e) => onUpdateSettings({ autoLockMinutes: Number(e.target.value) })}
                className="pv-select w-full"
              >
                <option value={0}>{t('set.autoLockOff')}</option>
                <option value={5}>{t('set.afterMinInactivity', { n: 5 })}</option>
                <option value={15}>{t('set.afterMinInactivity', { n: 15 })}</option>
                <option value={30}>{t('set.afterMinInactivity', { n: 30 })}</option>
                <option value={60}>{t('set.afterMinInactivity', { n: 60 })}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[#D7C7CC]">{t('set.desktopNotif')}</span>
            <button type="button" onClick={handleTestNotification} className="pv-btn-secondary text-xs py-1.5">
              <Bell className="w-3.5 h-3.5 text-rose-300" />
              {t('set.sendTestNotif')}
            </button>
          </div>

          <form onSubmit={handleChangeMasterPassword} className="pt-4 border-t border-white/10 space-y-3">
            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-rose-400" />
              {t('set.changeMasterPass')}
            </div>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('set.currentMasterPass')}
              className="pv-input text-xs"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('set.newMasterPass')}
                className="pv-input text-xs"
                required
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('set.confirmNewMasterPass')}
                className="pv-input text-xs"
                required
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={changingPass} className="pv-btn-secondary text-xs">
                {changingPass ? t('set.updating') : t('set.updateMasterPass')}
              </button>
            </div>
          </form>
        </div>

        {/* Encrypted Backup Export & Import (.pvault) */}
        <div className="pv-glass-crimson rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-base font-semibold text-white">
            <Download className="w-5 h-5 text-rose-300" />
            <span>{t('set.backupTitle')}</span>
          </div>

          {/* Export */}
          <form onSubmit={handleExportBackup} className="space-y-3">
            <div className="text-xs font-medium text-rose-100">{t('set.exportSubtitle')}</div>
            <p className="text-xs text-[#D7C7CC]">{t('set.exportDesc')}</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={exportPass}
                onChange={(e) => setExportPass(e.target.value)}
                placeholder={t('set.exportPassPlaceholder')}
                className="pv-input text-xs flex-1"
                required
              />
              <button type="submit" disabled={exporting} className="pv-btn-primary text-xs shrink-0">
                <Download className="w-4 h-4" />
                {exporting ? t('cli.preparing') : t('set.downloadBackup')}
              </button>
            </div>
          </form>

          {/* Import */}
          <form onSubmit={handleImportBackup} className="pt-4 border-t border-white/15 space-y-3">
            <div className="text-xs font-medium text-rose-100">{t('set.importTitle')}</div>
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
                {importFile ? importFile.name : t('set.choosePvault')}
              </button>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
                className="pv-select text-xs py-1.5"
              >
                <option value="merge">{t('set.mergeMode')}</option>
                <option value="replace">{t('set.replaceMode')}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={importPass}
                onChange={(e) => setImportPass(e.target.value)}
                placeholder={t('set.importPassPlaceholder')}
                className="pv-input text-xs flex-1"
              />
              <button type="submit" disabled={importing || !importFile} className="pv-btn-primary text-xs shrink-0">
                {importing ? t('cli.decryptingArchive') : t('set.restoreBtn')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
