import type { BillingCycle, CurrencyCode, SubscriptionEntry } from '../types';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: 'Haftalık',
  monthly: 'Aylık',
  quarterly: '3 Aylık',
  yearly: 'Yıllık',
  once: 'Tek Seferlik',
};

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const formatted = new Intl.NumberFormat('tr-TR', {
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

