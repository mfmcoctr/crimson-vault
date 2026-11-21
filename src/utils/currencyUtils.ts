import type { AppLanguage, BillingCycle, CurrencyCode, SubscriptionEntry } from '../types';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export const BILLING_CYCLE_LABELS_BY_LANG: Record<AppLanguage, Record<BillingCycle, string>> = {
  tr: {
    weekly: 'Haftalık',
    monthly: 'Aylık',
    quarterly: '3 Aylık',
    yearly: 'Yıllık',
    once: 'Tek Seferlik',
  },
  en: {
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
    once: 'One-time',
  },
  de: {
    weekly: 'Wöchentlich',
    monthly: 'Monatlich',
    quarterly: 'Vierteljährlich',
    yearly: 'Jährlich',
    once: 'Einmalig',
  },
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = BILLING_CYCLE_LABELS_BY_LANG.tr;

export function getBillingCycleLabel(cycle: BillingCycle, lang: AppLanguage = 'tr'): string {
  return BILLING_CYCLE_LABELS_BY_LANG[lang]?.[cycle] || BILLING_CYCLE_LABELS_BY_LANG.tr[cycle];
}

export function getNumberLocale(lang: AppLanguage = 'tr'): string {
  if (lang === 'en') return 'en-US';
  if (lang === 'de') return 'de-AT';
  return 'tr-TR';
}

export function formatCurrency(amount: number, currency: CurrencyCode, lang: AppLanguage = 'tr'): string {
  const formatted = new Intl.NumberFormat(getNumberLocale(lang), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${CURRENCY_SYMBOLS[currency] || ''}${formatted}`;
}

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  ratesInTry: Record<CurrencyCode, number>,
): number {
  if (from === to) return amount;
  const fromRate = ratesInTry[from] || 1;
  const toRate = ratesInTry[to] || 1;
  return (amount * fromRate) / toRate;
}

export function toMonthlyEquivalent(price: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'weekly':
      return (price * 52) / 12;
    case 'monthly':
      return price;
    case 'quarterly':
      return price / 3;
    case 'yearly':
      return price / 12;
    case 'once':
      return 0;
  }
}

export function toYearlyEquivalent(price: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'weekly':
      return price * 52;
    case 'monthly':
      return price * 12;
    case 'quarterly':
      return price * 4;
    case 'yearly':
      return price;
    case 'once':
      return price;
  }
}

export function summarizeSubscriptions(
  subscriptions: SubscriptionEntry[],
  targetCurrency: CurrencyCode,
  ratesInTry: Record<CurrencyCode, number>,
) {
  const active = subscriptions.filter((s) => s.status === 'active');
  let monthlyTotal = 0;
  let yearlyTotal = 0;
  const byCategory: Record<string, number> = {};
  const byOriginalCurrency: Partial<Record<CurrencyCode, number>> = {};

  for (const sub of active) {
    const mOrig = toMonthlyEquivalent(sub.price, sub.billingCycle);
    const yOrig = toYearlyEquivalent(sub.price, sub.billingCycle);
    const mConv = convertCurrency(mOrig, sub.currency, targetCurrency, ratesInTry);
    const yConv = convertCurrency(yOrig, sub.currency, targetCurrency, ratesInTry);

    monthlyTotal += mConv;
    yearlyTotal += yConv;
    byCategory[sub.category] = (byCategory[sub.category] || 0) + mConv;
    byOriginalCurrency[sub.currency] = (byOriginalCurrency[sub.currency] || 0) + mOrig;
  }

  return {
    activeCount: active.length,
    monthlyTotal,
    yearlyTotal,
    byCategory: Object.entries(byCategory)
      .map(([category, monthly]) => ({ category, monthly }))
      .sort((a, b) => b.monthly - a.monthly),
    byOriginalCurrency,
  };
}
