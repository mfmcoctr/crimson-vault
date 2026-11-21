import type { BillingCycle, CalendarEventEntry, SubscriptionEntry } from '../types';

export const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export const TR_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((utcTo - utcFrom) / msPerDay);
}

export interface NextEventOccurrence {
  event: CalendarEventEntry;
  nextDate: Date;
  nextIso: string;
  daysUntil: number;
  turningAge: number | null;
}

export function computeNextOccurrence(event: CalendarEventEntry, reference = startOfToday()): NextEventOccurrence {
  const base = parseIsoDate(event.date);
  let target = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  if (event.recurrence === 'yearly' || event.eventType === 'birthday') {
    target = new Date(reference.getFullYear(), base.getMonth(), base.getDate());
    if (daysBetween(reference, target) < 0) {
      target = new Date(reference.getFullYear() + 1, base.getMonth(), base.getDate());
    }
  } else if (event.recurrence === 'monthly') {
    target = new Date(reference.getFullYear(), reference.getMonth(), base.getDate());
    if (daysBetween(reference, target) < 0) {
      target = new Date(reference.getFullYear(), reference.getMonth() + 1, base.getDate());
    }
  }

  const daysUntil = daysBetween(reference, target);
  let turningAge: number | null = null;
  if (event.eventType === 'birthday') {
    const birthYr = event.birthYear || (base.getFullYear() > 1900 && base.getFullYear() < target.getFullYear() ? base.getFullYear() : null);
    if (birthYr) {
      turningAge = target.getFullYear() - birthYr;
    }
  }

  return {
    event,
    nextDate: target,
    nextIso: toIsoDate(target),
    daysUntil,
    turningAge,
  };
}

export function formatCountdown(daysUntil: number): string {
  if (daysUntil === 0) return 'Bugün!';
  if (daysUntil === 1) return 'Yarın';
  if (daysUntil < 0) return `${Math.abs(daysUntil)} gün önce`;
  return `${daysUntil} gün kaldı`;
}

export function formatTurkishDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function advanceBillingDate(isoDate: string, cycle: BillingCycle): string {
  const d = parseIsoDate(isoDate);
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return toIsoDate(d);
}

export function eventOccursOnDay(event: CalendarEventEntry, year: number, monthIndex: number, day: number): boolean {
  const base = parseIsoDate(event.date);
  if (event.recurrence === 'yearly' || event.eventType === 'birthday') {
    return base.getMonth() === monthIndex && base.getDate() === day;
  }
  if (event.recurrence === 'monthly') {
    return base.getDate() === day;
  }
  return base.getFullYear() === year && base.getMonth() === monthIndex && base.getDate() === day;
}

export interface ActiveReminderAlert {
  id: string;
  source: 'event' | 'subscription';
  title: string;
  subtitle: string;
  dateIso: string;
  daysUntil: number;
  urgent: boolean;
}

export function collectActiveReminders(
  events: CalendarEventEntry[],
  subscriptions: SubscriptionEntry[],
): ActiveReminderAlert[] {
  const today = startOfToday();
  const alerts: ActiveReminderAlert[] = [];

  for (const ev of events) {
    const occ = computeNextOccurrence(ev, today);
    const windowDays = Math.max(0, ev.remindDaysBefore ?? 3);
    if (occ.daysUntil >= 0 && occ.daysUntil <= windowDays) {
      const ageText = occ.turningAge ? ` (${occ.turningAge}. yaş)` : '';
      alerts.push({
        id: `ev-${ev.id}`,
        source: 'event',
        title: `${ev.title}${ageText}`,
        subtitle: `${formatTurkishDate(occ.nextIso)} · ${formatCountdown(occ.daysUntil)}`,
        dateIso: occ.nextIso,
        daysUntil: occ.daysUntil,
        urgent: occ.daysUntil <= 1,
      });
    }
  }

  for (const sub of subscriptions) {
    if (sub.status !== 'active') continue;
    const due = parseIsoDate(sub.nextBillingDate);
    const diff = daysBetween(today, due);
    const windowDays = Math.max(0, sub.remindDaysBefore ?? 3);
    if (diff >= -1 && diff <= windowDays) {
      alerts.push({
        id: `sub-${sub.id}`,
        source: 'subscription',
        title: `${sub.name} Yenilemesi`,
        subtitle: `${sub.price} ${sub.currency} · ${formatCountdown(diff)}`,
        dateIso: sub.nextBillingDate,
        daysUntil: diff,
        urgent: diff <= 1,
      });
    }
  }

  return alerts.sort((a, b) => a.daysUntil - b.daysUntil);
}

