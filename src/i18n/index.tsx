import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AppLanguage } from '../types';
import { CATEGORY_LABELS, LANGUAGE_OPTIONS, TRANSLATIONS, type TranslationKey } from './translations';
import { getNumberLocale } from '../utils/currencyUtils';

const STORAGE_KEY = 'pv_lang';

function detectInitialLanguage(): AppLanguage {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'tr' || saved === 'en' || saved === 'de') {
      return saved;
    }
    const nav = (window.navigator.language || '').toLowerCase();
    if (nav.startsWith('de')) return 'de';
    if (nav.startsWith('en')) return 'en';
    if (nav.startsWith('tr')) return 'tr';
  }
  return 'tr';
}

interface I18nContextValue {
  lang: AppLanguage;
  locale: string;
  setLang: (next: AppLanguage) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  categoryLabel: (canonical: string) => string;
  storeLabel: (store: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(detectInitialLanguage);

  const setLang = useCallback((next: AppLanguage) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.title = TRANSLATIONS[lang]['app.title'];
    }
  }, [lang]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let text = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.tr[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [lang],
  );

  const categoryLabel = useCallback(
    (canonical: string): string => {
      return CATEGORY_LABELS[canonical]?.[lang] ?? canonical;
    },
    [lang],
  );

  const storeLabel = useCallback(
    (store: string): string => {
      if (store === 'Diğer') return CATEGORY_LABELS.Diğer[lang];
      return store;
    },
    [lang],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      locale: getNumberLocale(lang),
      setLang,
      t,
      categoryLabel,
      storeLabel,
    }),
    [lang, setLang, t, categoryLabel, storeLabel],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export { LANGUAGE_OPTIONS };
export type { TranslationKey };
