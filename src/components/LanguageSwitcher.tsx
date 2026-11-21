import React from 'react';
import { Globe } from 'lucide-react';
import type { AppLanguage } from '../types';
import { LANGUAGE_OPTIONS, useI18n } from '../i18n';

interface LanguageSwitcherProps {
  onSelect?: (lang: AppLanguage) => void;
  variant?: 'compact' | 'full';
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ onSelect, variant = 'compact' }) => {
  const { lang, setLang } = useI18n();

  const handleChoose = (next: AppLanguage) => {
    if (next === lang) return;
    setLang(next);
    onSelect?.(next);
  };

  if (variant === 'full') {
    return (
      <div className="grid grid-cols-3 gap-2">
        {LANGUAGE_OPTIONS.map((opt) => {
          const active = lang === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => handleChoose(opt.code)}
              className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                active
                  ? 'bg-gradient-to-r from-[#9F1239] to-[#7F1D1D] text-white border-rose-400/45 shadow-[0_6px_18px_-8px_rgba(225,29,72,0.8)]'
                  : 'bg-white/5 text-[#D7C7CC] border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="font-mono-code text-[11px] opacity-80">{opt.short}</span>
              <span>{opt.name}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-white/5 border border-white/10 text-[11px]"
      role="group"
      aria-label="Language"
    >
      <Globe className="w-3.5 h-3.5 text-rose-300/80 ml-1 mr-0.5 hidden sm:inline" />
      {LANGUAGE_OPTIONS.map((opt) => {
        const active = lang === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => handleChoose(opt.code)}
            title={opt.name}
            className={`px-2 py-1 rounded-lg font-mono-code font-semibold transition-all cursor-pointer ${
              active ? 'bg-[#9F1239] text-white shadow' : 'text-[#C8B5BC] hover:text-white hover:bg-white/8'
            }`}
          >
            {opt.short}
          </button>
        );
      })}
    </div>
  );
};
