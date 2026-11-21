import React, { useMemo, useState } from 'react';
import {
  Bell,
  Cake,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Heart,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type {
  AppSettings,
  CalendarEventEntry,
  EventType,
  RecurrenceType,
  SubscriptionEntry,
} from '../types';
import {
  DAYS_SHORT_BY_LANG,
  MONTHS_BY_LANG,
  computeNextOccurrence,
  eventOccursOnDay,
  formatCountdown,
  formatLocalizedDate,
  startOfToday,
  toIsoDate,
} from '../utils/dateUtils';
import { formatCurrency } from '../utils/currencyUtils';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useI18n, type TranslationKey } from '../i18n';

interface CalendarPageProps {
  events: CalendarEventEntry[];
  subscriptions: SubscriptionEntry[];
  settings: AppSettings;
  onRefresh: () => Promise<void>;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const EVENT_TYPE_META: Record<EventType, { labelKey: TranslationKey; color: string; pill: string }> = {
  birthday: {
    labelKey: 'cal.type.birthday',
    color: 'text-rose-300',
    pill: 'bg-[#BE123C]/40 text-rose-100 border-rose-500/45',
  },
  anniversary: {
    labelKey: 'cal.type.anniversary',
    color: 'text-amber-300',
    pill: 'bg-amber-500/25 text-amber-100 border-amber-400/40',
  },
  important: {
    labelKey: 'cal.type.important',
    color: 'text-white',
    pill: 'bg-white/15 text-white border-white/25',
  },
  reminder: {
    labelKey: 'cal.type.reminder',
    color: 'text-sky-300',
    pill: 'bg-sky-500/20 text-sky-100 border-sky-400/35',
  },
};

const emptyEvent = (dateIso = toIsoDate(new Date())): Partial<CalendarEventEntry> => ({
  title: '',
  eventType: 'birthday',
  date: dateIso,
  birthYear: null,
  recurrence: 'yearly',
  remindDaysBefore: 3,
  notes: '',
});

export const CalendarPage: React.FC<CalendarPageProps> = ({
  events,
  subscriptions,
  settings,
  onRefresh,
  onUpdateSettings,
}) => {
  const { lang, t } = useI18n();
  const { notify } = useToast();
  const today = startOfToday();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventEntry | null>(null);
  const [form, setForm] = useState<Partial<CalendarEventEntry>>(emptyEvent());
  const [saving, setSaving] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const months = MONTHS_BY_LANG[lang] || MONTHS_BY_LANG.tr;
  const daysShort = DAYS_SHORT_BY_LANG[lang] || DAYS_SHORT_BY_LANG.tr;

  // Monday-first grid calculation
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7; // Mon=0 .. Sun=6
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month, -i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - (startOffset + daysInMonth) + 1;
      cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false });
    }
    return cells;
  }, [year, month]);

  const upcomingEvents = useMemo(() => {
    return events.map((e) => computeNextOccurrence(e, today)).sort((a, b) => a.daysUntil - b.daysUntil);
  }, [events]);

  const openCreate = (dateIso?: string) => {
    setEditing(null);
    setForm(emptyEvent(dateIso || toIsoDate(new Date())));
    setModalOpen(true);
  };

  const openEdit = (ev: CalendarEventEntry) => {
    setEditing(ev);
    setForm({ ...ev });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim() || !form.date) {
      notify(t('cal.requiredError'), 'error');
      return;
    }
    setSaving(true);
    try {
      const birthYear =
        form.eventType === 'birthday' ? form.birthYear || Number(form.date.slice(0, 4)) : null;
      const payload = { ...form, birthYear };
      if (editing) {
        await api.updateEvent(editing.id, payload);
        notify(t('cal.updatedToast'));
      } else {
        await api.createEvent(payload);
        notify(t('cal.createdToast'));
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: CalendarEventEntry) => {
    if (!window.confirm(t('cal.deleteConfirm', { title: ev.title }))) return;
    await api.deleteEvent(ev.id);
    notify(t('cal.deletedToast'));
    await onRefresh();
  };

  const requestBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      notify(t('cal.notifUnsupported'), 'error');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification(t('cal.notifActiveTitle'), {
        body: t('cal.notifActiveBody'),
      });
      await onUpdateSettings({ browserNotifications: true });
      notify(t('cal.notifEnabled'));
    } else {
      notify(t('cal.notifDenied'), 'info');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">{t('cal.title')}</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">{t('cal.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={requestBrowserNotifications} className="pv-btn-secondary text-xs">
            <Bell className="w-4 h-4 text-rose-300" />
            {t('cal.browserNotif')}
          </button>
          <button onClick={() => openCreate()} className="pv-btn-primary">
            <Plus className="w-4 h-4" />
            {t('cal.newEvent')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Monthly Calendar Grid */}
        <div className="xl:col-span-8 pv-glass rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCursor(new Date(year, month - 1, 1))}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/12 border border-white/10 text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="font-display text-lg sm:text-xl font-semibold text-white min-w-[175px] text-center">
                {months[month]} {year}
              </h2>
              <button
                onClick={() => setCursor(new Date(year, month + 1, 1))}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/12 border border-white/10 text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="ml-1 px-3 py-1.5 rounded-xl bg-white/6 hover:bg-white/12 text-xs text-rose-200 border border-white/10 cursor-pointer"
              >
                {t('cal.today')}
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#D7C7CC] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showSubscriptionsOnCalendar}
                onChange={(e) => onUpdateSettings({ showSubscriptionsOnCalendar: e.target.checked })}
                className="accent-[#BE123C]"
              />
              <span>{t('cal.showSubs')}</span>
            </label>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-[#B8A2AA] pb-1">
            {daysShort.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, idx) => {
              const iso = toIsoDate(cell.date);
              const isToday = iso === toIsoDate(today);
              const dayEvents = events.filter((ev) =>
                eventOccursOnDay(ev, cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate()),
              );
              const daySubs = settings.showSubscriptionsOnCalendar
                ? subscriptions.filter((s) => s.status === 'active' && s.nextBillingDate === iso)
                : [];

              return (
                <div
                  key={idx}
                  onClick={() => openCreate(iso)}
                  className={`min-h-[86px] sm:min-h-[98px] p-1.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                    !cell.inMonth
                      ? 'bg-black/20 border-white/5 opacity-45'
                      : isToday
                        ? 'bg-[#9F1239]/25 border-rose-400/60 shadow-[inset_0_0_20px_rgba(225,29,72,0.2)]'
                        : 'bg-black/35 border-white/8 hover:border-rose-500/35 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday ? 'bg-[#E11D48] text-white font-bold' : 'text-[#E4D5DA]'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                  </div>

                  <div className="space-y-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => {
                      const age =
                        ev.eventType === 'birthday' &&
                        (ev.birthYear || Number(ev.date.slice(0, 4)) < cell.date.getFullYear())
                          ? cell.date.getFullYear() - (ev.birthYear || Number(ev.date.slice(0, 4)))
                          : null;
                      return (
                        <button
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(ev);
                          }}
                          className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded border truncate cursor-pointer ${
                            EVENT_TYPE_META[ev.eventType].pill
                          }`}
                          title={`${ev.title}${age ? ` (${t('cal.ageSuffix', { age })})` : ''}`}
                        >
                          {ev.eventType === 'birthday' ? '🎂 ' : ''}
                          {ev.title}
                          {age && age > 0 ? ` (${age})` : ''}
                        </button>
                      );
                    })}
                    {daySubs.slice(0, 1).map((sub) => (
                      <div
                        key={sub.id}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 truncate"
                        title={`${sub.name}: ${formatCurrency(sub.price, sub.currency, lang)}`}
                      >
                        💳 {sub.name}
                      </div>
                    ))}
                    {dayEvents.length + daySubs.length > 3 && (
                      <div className="text-[10px] text-rose-200 pl-1">
                        {t('cal.moreCount', { count: dayEvents.length + daySubs.length - 3 })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Countdown Sidebar */}
        <div className="xl:col-span-4 pv-glass rounded-2xl p-5 flex flex-col max-h-[720px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              {t('cal.upcomingHeader')}
            </h2>
            <span className="text-xs text-[#B8A2AA]">{t('cal.recordsCount', { count: upcomingEvents.length })}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {upcomingEvents.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <Cake className="w-9 h-9 text-rose-400/60 mx-auto" />
                <div className="text-sm text-[#A8929A]">{t('cal.emptyDesc')}</div>
                <button onClick={() => openCreate()} className="pv-btn-secondary text-xs">
                  {t('cal.addFirst')}
                </button>
              </div>
            ) : (
              upcomingEvents.map(({ event, nextIso, daysUntil, turningAge }) => (
                <div
                  key={event.id}
                  className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-rose-500/35 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#9F1239]/25 border border-rose-500/30 flex items-center justify-center shrink-0 mt-0.5">
                        {event.eventType === 'birthday' ? (
                          <Cake className="w-4 h-4 text-rose-300" />
                        ) : event.eventType === 'anniversary' ? (
                          <Heart className="w-4 h-4 text-amber-300" />
                        ) : (
                          <CalendarIcon className="w-4 h-4 text-sky-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{event.title}</div>
                        <div className="text-xs text-[#C8B5BC] mt-0.5">
                          {formatLocalizedDate(nextIso, lang)}
                          {turningAge !== null && turningAge > 0 && (
                            <span className="ml-1.5 text-rose-300 font-medium">
                              · {t('cal.ageSuffix', { age: turningAge })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => openEdit(event)}
                        className="p-1 text-[#C8B5BC] hover:text-white cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(event)}
                        className="p-1 text-[#C8B5BC] hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-[#9C868E]">
                      {t(EVENT_TYPE_META[event.eventType].labelKey)} ·{' '}
                      {event.recurrence === 'yearly'
                        ? t('cal.rec.yearly')
                        : event.recurrence === 'monthly'
                          ? t('cal.rec.monthly')
                          : t('cal.rec.none')}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        daysUntil <= 1
                          ? 'bg-[#E11D48]/35 text-rose-100 border border-rose-500/45'
                          : daysUntil <= 7
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'bg-white/8 text-[#D7C7CC]'
                      }`}
                    >
                      {formatCountdown(daysUntil, lang)}
                    </span>
                  </div>
                  {event.notes && <p className="text-xs text-[#B8A2AA] border-t border-white/6 pt-1.5">{event.notes}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Event Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('cal.modalEdit') : t('cal.modalCreate')}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('cal.fieldTitle')}</label>
            <input
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t('cal.fieldTitlePlaceholder')}
              className="pv-input"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('cal.eventType')}</label>
              <select
                value={form.eventType || 'birthday'}
                onChange={(e) => {
                  const nextType = e.target.value as EventType;
                  setForm({
                    ...form,
                    eventType: nextType,
                    recurrence: nextType === 'birthday' || nextType === 'anniversary' ? 'yearly' : form.recurrence,
                  });
                }}
                className="pv-select w-full"
              >
                <option value="birthday">{t('cal.type.birthday')}</option>
                <option value="anniversary">{t('cal.type.anniversary')}</option>
                <option value="important">{t('cal.type.important')}</option>
                <option value="reminder">{t('cal.type.reminder')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">
                {form.eventType === 'birthday' ? t('cal.birthDate') : t('cal.date')} *
              </label>
              <input
                type="date"
                value={form.date || ''}
                onChange={(e) => {
                  const d = e.target.value;
                  setForm({
                    ...form,
                    date: d,
                    birthYear: form.eventType === 'birthday' && d ? Number(d.slice(0, 4)) : form.birthYear,
                  });
                }}
                className="pv-input"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('cal.recurrence')}</label>
              <select
                value={form.recurrence || 'yearly'}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value as RecurrenceType })}
                className="pv-select w-full"
              >
                <option value="yearly">{t('cal.rec.yearly')}</option>
                <option value="monthly">{t('cal.rec.monthly')}</option>
                <option value="none">{t('cal.rec.none')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('cal.remindBefore')}</label>
              <select
                value={form.remindDaysBefore ?? 3}
                onChange={(e) => setForm({ ...form, remindDaysBefore: Number(e.target.value) })}
                className="pv-select w-full"
              >
                <option value={0}>{t('cal.remind0')}</option>
                <option value={1}>{t('cal.remind1')}</option>
                <option value={3}>{t('cal.remind3')}</option>
                <option value={7}>{t('cal.remind7')}</option>
                <option value={14}>{t('cal.remind14')}</option>
                <option value={30}>{t('cal.remind30')}</option>
              </select>
            </div>
          </div>

          {form.eventType === 'birthday' && (
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('cal.birthYearLabel')}</label>
              <input
                type="number"
                min="1900"
                max="2100"
                value={form.birthYear ?? ''}
                onChange={(e) => setForm({ ...form, birthYear: e.target.value ? Number(e.target.value) : null })}
                placeholder={t('cal.birthYearPlaceholder')}
                className="pv-input"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">{t('cal.notesLabel')}</label>
            <textarea
              rows={3}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t('cal.notesPlaceholder')}
              className="pv-input resize-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
            <button type="button" onClick={() => setModalOpen(false)} className="pv-btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="pv-btn-primary">
              {saving ? t('common.saving') : editing ? t('common.update') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
