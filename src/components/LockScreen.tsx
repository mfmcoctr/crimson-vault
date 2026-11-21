import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Shield, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../api';
import { evaluatePasswordStrength } from '../utils/passwordUtils';
import { useI18n } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

interface LockScreenProps {
  initialized: boolean;
  bgUrl: string;
  bgOpacity: number;
  bgBlur: number;
  onUnlocked: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  initialized,
  bgUrl,
  bgOpacity,
  bgBlur,
  onUnlocked,
}) => {
  const { lang, t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = evaluatePasswordStrength(password, lang);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!initialized) {
      if (password.length < 6) {
        setError(t('lock.minLengthError'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('lock.mismatchError'));
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!initialized) {
        await api.setupVault(password);
      } else {
        await api.unlockVault(password);
      }
      setPassword('');
      setConfirmPassword('');
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lock.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center lg:justify-start lg:pl-[9vw] p-6 bg-[#0B0507]">
      {/* Dark Fantasy Fullscreen Artwork */}
      <div
        className="fixed inset-0 bg-cover bg-right sm:bg-center transition-all duration-500 scale-105"
        style={{
          backgroundImage: `url("${bgUrl}")`,
          opacity: Math.max(bgOpacity, 0.58),
          filter: `blur(${Math.max(0, bgBlur - 1)}px)`,
        }}
      />
      {/* Eye-friendly crimson-obsidian atmospheric gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 78% 45%, rgba(159, 18, 57, 0.14) 0%, rgba(11, 5, 7, 0.72) 55%, rgba(11, 5, 7, 0.94) 100%)',
        }}
      />

      {/* Top-Right Language Switcher */}
      <div className="fixed top-5 right-5 z-20 pv-glass rounded-xl p-0.5 border border-rose-500/25 shadow-xl">
        <LanguageSwitcher variant="compact" />
      </div>

      {/* Gate Card */}
      <div className="relative z-10 w-full max-w-md pv-glass rounded-3xl p-7 sm:p-9 border border-rose-500/30 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#9F1239] via-[#7F1D1D] to-[#2B0711] border border-white/20 flex items-center justify-center shadow-[0_0_35px_-6px_rgba(225,29,72,0.75)] mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white tracking-wider">
            PERSONVAULT
          </h1>
          <p className="text-xs sm:text-sm text-[#D7C7CC] mt-1.5">
            {initialized ? t('lock.unlockSubtitle') : t('lock.setupSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#D7C7CC] mb-1.5">
              {initialized ? t('lock.masterPassword') : t('lock.newMasterPassword')}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder="••••••••••••"
                className="pv-input pl-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9C868E] hover:text-white cursor-pointer"
                aria-label={t('lock.showPassword')}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!initialized && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#D7C7CC] mb-1.5">
                  {t('lock.confirmMasterPassword')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('lock.confirmPlaceholder')}
                    className="pv-input pl-10"
                  />
                </div>
              </div>

              {password && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#B8A2AA]">{t('lock.passwordStrength')}</span>
                    <span className={strength.textColor}>{strength.label}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${strength.barColor}`}
                      style={{ width: `${strength.score}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="rounded-xl bg-rose-950/80 border border-rose-500/40 px-3.5 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="pv-btn-primary w-full py-3 text-sm font-semibold mt-2">
            {submitting ? (
              t('lock.derivingKey')
            ) : initialized ? (
              <>
                <ShieldCheck className="w-4 h-4" />
                {t('lock.unlockBtn')}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t('lock.createBtn')}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/10 flex flex-col gap-1.5 text-[11px] text-[#A8929A] text-center">
          <div className="flex items-center justify-center gap-2 text-[#D7C7CC]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{t('lock.localBadge')}</span>
          </div>
          {!initialized && <p className="text-rose-200/80">{t('lock.setupWarning')}</p>}
        </div>
      </div>
    </div>
  );
};
