import React, { useMemo, useState } from 'react';
import {
  Bell,
  Cake,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CreditCard,
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
  TR_DAYS_SHORT,
  TR_MONTHS,
  computeNextOccurrence,
  eventOccursOnDay,
  formatCountdown,
  formatTurkishDate,
  parseIsoDate,
  startOfToday,
  toIsoDate,
} from '../utils/dateUtils';
import { formatCurrency } from '../utils/currencyUtils';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

interface CalendarPageProps {
  events: CalendarEventEntry[];
  subscriptions: SubscriptionEntry[];
  settings: AppSettings;
  onRefresh: () => Promise<void>;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const EVENT_TYPE_META: Record<EventType, { label: string; color: string; pill: string }> = {
  birthday: {
    label: 'Doğum Günü',
    color: 'text-rose-300',
    pill: 'bg-[#BE123C]/40 text-rose-100 border-rose-500/45',
  },
  anniversary: {
    label: 'Yıldönümü',
    color: 'text-amber-300',
    pill: 'bg-amber-500/25 text-amber-100 border-amber-400/40',
  },
  important: {
    label: 'Önemli Tarih',
    color: 'text-white',
    pill: 'bg-white/15 text-white border-white/25',
  },
  reminder: {
    label: 'Hatırlatma',
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
  const { notify } = useToast();
  const today = startOfToday();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventEntry | null>(null);
  const [form, setForm] = useState<Partial<CalendarEventEntry>>(emptyEvent());
  const [saving, setSaving] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

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
    return events
      .map((e) => computeNextOccurrence(e, today))
      .sort((a, b) => a.daysUntil - b.daysUntil);
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
      notify('Başlık ve tarih gereklidir.', 'error');
      return;
    }
    setSaving(true);
    try {
      const birthYear =
        form.eventType === 'birthday'
          ? form.birthYear || Number(form.date.slice(0, 4))
          : null;
      const payload = { ...form, birthYear };
      if (editing) {
        await api.updateEvent(editing.id, payload);
        notify('Takvim kaydı güncellendi.');
      } else {
        await api.createEvent(payload);
        notify('Yeni tarih takvime eklendi.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: CalendarEventEntry) => {
    if (!window.confirm(`"${ev.title}" kaydını silmek istiyor musunuz?`)) return;
    await api.deleteEvent(ev.id);
    notify('Etkinlik silindi.');
    await onRefresh();
  };

  const requestBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      notify('Tarayıcınız masaüstü bildirimlerini desteklemiyor.', 'error');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('PersonVault Bildirimleri Aktif', {
        body: 'Doğum günleri ve yaklaşan önemli tarihleriniz için bildirim alacaksınız.',
      });
      await onUpdateSettings({ browserNotifications: true });
      notify('Tarayıcı bildirimleri etkinleştirildi!');
    } else {
      notify('Bildirim izni verilmedi.', 'info');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Takvim & Hatırlatmalar</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            Doğum günleri (otomatik yaş hesabı), yıldönümleri, önemli tarihler ve abonelik yenilemeleri.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={requestBrowserNotifications} className="pv-btn-secondary text-xs">
            <Bell className="w-4 h-4 text-rose-300" />
            Tarayıcı Bildirimi
          </button>
          <button onClick={() => openCreate()} className="pv-btn-primary">
            <Plus className="w-4 h-4" />
            Yeni Tarih / Doğum Günü
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
                {TR_MONTHS[month]} {year}
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
                Bugün
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#D7C7CC] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showSubscriptionsOnCalendar}
                onChange={(e) => onUpdateSettings({ showSubscriptionsOnCalendar: e.target.checked })}
                className="accent-[#BE123C]"
              />
              <span>Abonelik yenilemelerini göster</span>
            </label>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-[#B8A2AA] pb-1">
            {TR_DAYS_SHORT.map((d) => (
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
                ? subscriptions.filter(
                    (s) => s.status === 'active' && s.nextBillingDate === iso,
                  )
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
                        ev.eventType === 'birthday' && (ev.birthYear || Number(ev.date.slice(0, 4)) < cell.date.getFullYear())
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
                          title={`${ev.title}${age ? ` (${age}. yaş)` : ''}`}
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
                        title={`${sub.name}: ${formatCurrency(sub.price, sub.currency)}`}
                      >
                        💳 {sub.name}
                      </div>
                    ))}
                    {dayEvents.length + daySubs.length > 3 && (
                      <div className="text-[10px] text-rose-200 pl-1">
                        +{dayEvents.length + daySubs.length - 3} daha
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
              Yaklaşan Tarihler & Sayaç
            </h2>
            <span className="text-xs text-[#B8A2AA]">{upcomingEvents.length} kayıt</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {upcomingEvents.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <Cake className="w-9 h-9 text-rose-400/60 mx-auto" />
                <div className="text-sm text-[#A8929A]">Henüz doğum günü veya önemli tarih eklenmemiş.</div>
                <button onClick={() => openCreate()} className="pv-btn-secondary text-xs">
                  İlk Tarihi Ekle
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
                          {formatTurkishDate(nextIso)}
                          {turningAge !== null && turningAge > 0 && (
                            <span className="ml-1.5 text-rose-300 font-medium">· {turningAge}. yaş</span>
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
                      {EVENT_TYPE_META[event.eventType].label} ·{' '}
                      {event.recurrence === 'yearly'
                        ? 'Her Yıl'
                        : event.recurrence === 'monthly'
                          ? 'Her Ay'
                          : 'Tek Seferlik'}
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
                      {formatCountdown(daysUntil)}
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
        title={editing ? 'Tarihi Düzenle' : 'Yeni Tarih / Doğum Günü Ekle'}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">Başlık *</label>
            <input
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Örn: Annemin Doğum Günü, Domain Yenileme, Evlilik Yıldönümü"
              className="pv-input"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Etkinlik Türü</label>
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
                <option value="birthday">Doğum Günü</option>
                <option value="anniversary">Yıldönümü</option>
                <option value="important">Önemli Tarih</option>
                <option value="reminder">Hatırlatma</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">
                {form.eventType === 'birthday' ? 'Doğum Tarihi' : 'Tarih'} *
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
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Tekrar</label>
              <select
                value={form.recurrence || 'yearly'}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value as RecurrenceType })}
                className="pv-select w-full"
              >
                <option value="yearly">Her Yıl</option>
                <option value="monthly">Her Ay</option>
                <option value="none">Tek Seferlik</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Kaç Gün Önce Hatırlat?</label>
              <select
                value={form.remindDaysBefore ?? 3}
                onChange={(e) => setForm({ ...form, remindDaysBefore: Number(e.target.value) })}
                className="pv-select w-full"
              >
                <option value={0}>Aynı gün</option>
                <option value={1}>1 gün önce</option>
                <option value={3}>3 gün önce</option>
                <option value={7}>7 gün önce</option>
                <option value={14}>14 gün önce</option>
                <option value={30}>30 gün önce</option>
              </select>
            </div>
          </div>

          {form.eventType === 'birthday' && (
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">
                Doğum Yılı (Otomatik yaş hesabı için — opsiyonel)
              </label>
              <input
                type="number"
                min="1900"
                max="2100"
                value={form.birthYear ?? ''}
                onChange={(e) => setForm({ ...form, birthYear: e.target.value ? Number(e.target.value) : null })}
                placeholder="Örn: 1995"
                className="pv-input"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">Notlar / Hediye Fikri</label>
            <textarea
              rows={3}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Hediye fikri, rezervasyon notu veya detay..."
              className="pv-input resize-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
            <button type="button" onClick={() => setModalOpen(false)} className="pv-btn-secondary">
              İptal
            </button>
            <button type="submit" disabled={saving} className="pv-btn-primary">
              {saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

