import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Coins,
  ExternalLink,
  Gamepad2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import { api } from '../api';
import type {
  CurrencyCode,
  FreecashMilestone,
  FreecashOffer,
  FreecashPlatform,
  FreecashStatus,
} from '../types';
import { useI18n } from '../i18n';
import { formatCurrency } from '../utils/currencyUtils';
import { daysBetween, formatCountdown, formatLocalizedDate, parseIsoDate, startOfToday, toIsoDate } from '../utils/dateUtils';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

const PLATFORMS: FreecashPlatform[] = ['Android', 'iOS', 'PC', 'Web'];
const OFFER_WALLS = ['Freecash Exclusive', 'Torox', 'AdGate', 'AyET Studios', 'RevU', 'Lootably', 'Diğer'];

interface FreecashPageProps {
  offers: FreecashOffer[];
  onRefresh: () => Promise<void>;
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

const emptyOffer = (): Partial<FreecashOffer> => ({
  gameName: '',
  platform: 'Android',
  offerWall: 'Freecash Exclusive',
  currency: 'EUR',
  startedAt: toIsoDate(new Date()),
  deadlineAt: addDaysIso(30),
  remindDaysBefore: 3,
  status: 'active',
  milestones: [
    { id: 'm1', title: 'Oyunu indir & aç', reward: 0.25, completed: true },
    { id: 'm2', title: 'Seviye 10’a ulaş', reward: 4.5, completed: false },
    { id: 'm3', title: 'Seviye 25’e ulaş', reward: 18.0, completed: false },
  ],
  url: 'https://freecash.com/earn',
  notes: '',
});

export const FreecashPage: React.FC<FreecashPageProps> = ({ offers, onRefresh }) => {
  const { lang, t } = useI18n();
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FreecashStatus>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FreecashOffer | null>(null);
  const [form, setForm] = useState<Partial<FreecashOffer>>(emptyOffer());
  const [saving, setSaving] = useState(false);

  const today = startOfToday();

  const stats = useMemo(() => {
    let earnedTotal = 0;
    let pendingPotential = 0;
    let urgentCount = 0;
    let activeCount = 0;

    for (const o of offers) {
      const earned = o.milestones.filter((m) => m.completed).reduce((s, m) => s + m.reward, 0);
      const total = o.milestones.reduce((s, m) => s + m.reward, 0);
      earnedTotal += earned;
      if (o.status === 'active') {
        activeCount++;
        pendingPotential += Math.max(0, total - earned);
        const daysLeft = daysBetween(today, parseIsoDate(o.deadlineAt));
        if (daysLeft >= 0 && daysLeft <= (o.remindDaysBefore ?? 3)) {
          urgentCount++;
        }
      }
    }
    return { earnedTotal, pendingPotential, urgentCount, activeCount };
  }, [offers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...offers]
      .filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
        if (!q) return true;
        return [o.gameName, o.platform, o.offerWall, o.notes, ...o.milestones.map((m) => m.title)].some((f) =>
          f.toLowerCase().includes(q),
        );
      })
      .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt));
  }, [offers, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyOffer());
    setModalOpen(true);
  };

  const openEdit = (o: FreecashOffer) => {
    setEditing(o);
    setForm({ ...o, milestones: o.milestones.map((m) => ({ ...m })) });
    setModalOpen(true);
  };

  const handleToggleMilestone = async (offer: FreecashOffer, milestoneId: string) => {
    const now = new Date().toISOString();
    const updatedMilestones = offer.milestones.map((m) =>
      m.id === milestoneId
        ? { ...m, completed: !m.completed, completedAt: !m.completed ? now : undefined }
        : m,
    );
    const allDone = updatedMilestones.length > 0 && updatedMilestones.every((m) => m.completed);
    await api.updateFreecashOffer(offer.id, {
      milestones: updatedMilestones,
      status: allDone ? 'completed' : offer.status === 'completed' ? 'active' : offer.status,
    });
    await onRefresh();
    const toggled = updatedMilestones.find((m) => m.id === milestoneId);
    if (toggled?.completed) {
      notify(
        lang === 'de'
          ? `Meilenstein abgeschlossen: +${formatCurrency(toggled.reward, offer.currency, lang)}`
          : lang === 'en'
            ? `Milestone completed: +${formatCurrency(toggled.reward, offer.currency, lang)}`
            : `Aşama tamamlandı: +${formatCurrency(toggled.reward, offer.currency, lang)}`,
      );
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.gameName?.trim()) {
      notify(lang === 'de' ? 'Spielname erforderlich.' : lang === 'en' ? 'Offer name is required.' : 'Görev / oyun adı zorunludur.', 'error');
      return;
    }
    setSaving(true);
    try {
      const cleanedMilestones = (form.milestones || []).filter((m) => m.title.trim() || m.reward > 0);
      const payload = { ...form, milestones: cleanedMilestones };
      if (editing) {
        await api.updateFreecashOffer(editing.id, payload);
        notify(lang === 'de' ? 'Aufgabe aktualisiert.' : lang === 'en' ? 'Offer updated.' : 'Freecash görevi güncellendi.');
      } else {
        await api.createFreecashOffer(payload);
        notify(lang === 'de' ? 'Aufgabe hinzugefügt.' : lang === 'en' ? 'Offer added.' : 'Freecash görevi eklendi.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : t('common.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (o: FreecashOffer) => {
    if (
      !window.confirm(
        lang === 'de'
          ? `"${o.gameName}" wirklich löschen?`
          : lang === 'en'
            ? `Delete "${o.gameName}"?`
            : `"${o.gameName}" görevini silmek istiyor musunuz?`,
      )
    ) {
      return;
    }
    await api.deleteFreecashOffer(o.id);
    notify(lang === 'de' ? 'Gelöscht.' : lang === 'en' ? 'Deleted.' : 'Görev silindi.');
    await onRefresh();
  };

  const addMilestoneRow = () => {
    setForm((prev) => ({
      ...prev,
      milestones: [
        ...(prev.milestones || []),
        { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: '', reward: 0, completed: false },
      ],
    }));
  };

  const updateMilestoneRow = (idx: number, patch: Partial<FreecashMilestone>) => {
    setForm((prev) => {
      const arr = [...(prev.milestones || [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...prev, milestones: arr };
    });
  };

  const removeMilestoneRow = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      milestones: (prev.milestones || []).filter((_, i) => i !== idx),
    }));
  };

  const statusLabel = (st: FreecashStatus) => {
    if (lang === 'de') {
      return st === 'active' ? 'Aktiv' : st === 'pending_payout' ? 'Auszahlung offen' : st === 'completed' ? 'Erledigt' : 'Abgelaufen';
    }
    if (lang === 'en') {
      return st === 'active' ? 'Active' : st === 'pending_payout' ? 'Pending Payout' : st === 'completed' ? 'Completed' : 'Expired';
    }
    return st === 'active' ? 'Aktif' : st === 'pending_payout' ? 'Ödeme Bekliyor' : st === 'completed' ? 'Tamamlandı' : 'Süresi Doldu';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white flex items-center gap-2.5">
            <Gamepad2 className="w-6 h-6 text-emerald-400" />
            {lang === 'de' ? 'Freecash Aufgaben & Einnahmen' : lang === 'en' ? 'Freecash Offers & Earnings' : 'Freecash Görev & Kazanç Takibi'}
          </h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            {lang === 'de'
              ? 'Verfolge Fristen, Meilenstein-Boni und automatische Erinnerungen für deine Freecash-Spiele.'
              : lang === 'en'
                ? 'Track offer deadlines, milestone rewards, and automatic countdown reminders.'
                : 'Girdiğiniz oyun/görevlerin kalan sürelerini, aşamalı ödüllerini (€/$) ve yaklaşan son tarih alarmlarını takip edin.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="https://freecash.com/earn" target="_blank" rel="noreferrer" className="pv-btn-secondary text-xs">
            Freecash.com
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={openCreate} className="pv-btn-primary">
            <Plus className="w-4 h-4" />
            {lang === 'de' ? 'Neue Aufgabe' : lang === 'en' ? 'New Offer' : 'Yeni Görev Ekle'}
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="pv-glass-crimson rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-rose-200">
              {lang === 'de' ? 'Verdient (Erledigt)' : lang === 'en' ? 'Earned (Completed)' : 'Kazanılan (Tamamlanan)'}
            </div>
            <div className="text-2xl font-bold text-emerald-300 font-mono-code mt-1">
              €{stats.earnedTotal.toFixed(2)}
            </div>
          </div>
          <Trophy className="w-8 h-8 text-emerald-400/80" />
        </div>

        <div className="pv-glass rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#C8B5BC]">
              {lang === 'de' ? 'Offenes Potenzial' : lang === 'en' ? 'Remaining Potential' : 'Kalan Potansiyel Ödül'}
            </div>
            <div className="text-2xl font-bold text-white font-mono-code mt-1">
              €{stats.pendingPotential.toFixed(2)}
            </div>
          </div>
          <Coins className="w-8 h-8 text-amber-300/80" />
        </div>

        <div className="pv-glass rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#C8B5BC]">
              {lang === 'de' ? 'Aktive Aufgaben' : lang === 'en' ? 'Active Offers' : 'Aktif Görevler'}
            </div>
            <div className="text-2xl font-bold text-white mt-1">{stats.activeCount}</div>
          </div>
          <Gamepad2 className="w-8 h-8 text-rose-400/80" />
        </div>

        <div className="pv-glass rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#C8B5BC]">
              {lang === 'de' ? 'Frist läuft bald ab' : lang === 'en' ? 'Expiring Soon' : 'Süresi Yaklaşan'}
            </div>
            <div className="text-2xl font-bold text-amber-300 mt-1">{stats.urgentCount}</div>
          </div>
          <Clock className="w-8 h-8 text-amber-400/80" />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="pv-glass rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'de' ? 'Spiel, Plattform oder Meilenstein suchen...' : lang === 'en' ? 'Search game, platform or milestone...' : 'Oyun, platform veya aşama ara...'}
            className="pv-input pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['active', 'pending_payout', 'completed', 'expired', 'all'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                statusFilter === st
                  ? 'bg-[#9F1239] text-white'
                  : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10 border border-white/10'
              }`}
            >
              {st === 'all' ? (lang === 'de' ? 'Alle' : lang === 'en' ? 'All' : 'Tümü') : statusLabel(st)}
            </button>
          ))}
        </div>
      </div>

      {/* Offer Cards */}
      {filtered.length === 0 ? (
        <div className="pv-glass rounded-2xl p-12 text-center space-y-3">
          <Gamepad2 className="w-10 h-10 text-emerald-400/70 mx-auto" />
          <div className="text-base font-medium text-white">
            {lang === 'de' ? 'Keine Freecash-Aufgaben' : lang === 'en' ? 'No Freecash offers yet' : 'Henüz eklenmiş Freecash görevi yok'}
          </div>
          <p className="text-sm text-[#A8929A] max-w-lg mx-auto">
            {lang === 'de'
              ? 'Füge deine laufenden Spiele mit Meilensteinen und Fristen hinzu, um keine Boni zu verpassen.'
              : lang === 'en'
                ? 'Add your active offers with milestones and deadlines so you never miss a payout window.'
                : 'Başladığınız oyunları, aşama ödüllerini ve son teslim tarihini ekleyin; süre dolmadan bildirim zili ve takvimden uyarı alın.'}
          </p>
          <button onClick={openCreate} className="pv-btn-primary">
            <Plus className="w-4 h-4" />
            {lang === 'de' ? 'Erste Aufgabe hinzufügen' : lang === 'en' ? 'Add First Offer' : 'İlk Görevi Ekle'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((offer) => {
            const earned = offer.milestones.filter((m) => m.completed).reduce((s, m) => s + m.reward, 0);
            const total = offer.milestones.reduce((s, m) => s + m.reward, 0);
            const pct = total > 0 ? Math.round((earned / total) * 100) : 0;
            const daysLeft = daysBetween(today, parseIsoDate(offer.deadlineAt));

            return (
              <div key={offer.id} className="pv-glass rounded-2xl p-5 space-y-4 hover:border-rose-500/35 transition-all flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/35 font-medium">
                          {offer.platform}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-[#E4D5DA]">
                          {offer.offerWall}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            offer.status === 'active' && daysLeft <= 3
                              ? 'bg-rose-500/30 text-rose-100 border border-rose-500/50'
                              : offer.status === 'completed'
                                ? 'bg-emerald-500/25 text-emerald-200'
                                : 'bg-white/10 text-[#D7C7CC]'
                          }`}
                        >
                          {offer.status === 'active' ? formatCountdown(daysLeft, lang) : statusLabel(offer.status)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-white text-base mt-1.5 truncate">{offer.gameName}</h3>
                      <div className="text-xs text-[#B8A2AA] mt-0.5">
                        {lang === 'de' ? 'Frist:' : lang === 'en' ? 'Deadline:' : 'Son Tarih:'}{' '}
                        <span className="text-white">{formatLocalizedDate(offer.deadlineAt, lang)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {offer.url && (
                        <a
                          href={/^https?:\/\//i.test(offer.url) ? offer.url : `https://${offer.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-white hover:bg-white/10"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => openEdit(offer)}
                        className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-white hover:bg-white/10 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(offer)}
                        className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="rounded-xl bg-black/45 border border-white/8 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#C8B5BC]">
                        {lang === 'de' ? 'Fortschritt' : lang === 'en' ? 'Earnings Progress' : 'Kazanç İlerlemesi'}
                      </span>
                      <span className="font-mono-code font-bold text-white">
                        <span className="text-emerald-300">{formatCurrency(earned, offer.currency, lang)}</span> /{' '}
                        {formatCurrency(total, offer.currency, lang)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Interactive Milestones */}
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {offer.milestones.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleToggleMilestone(offer, m.id)}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          m.completed
                            ? 'bg-emerald-500/12 border-emerald-400/30 text-emerald-100'
                            : 'bg-black/35 border-white/8 hover:border-rose-500/40 text-[#F8F4F5]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {m.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-[#9C868E] shrink-0" />
                          )}
                          <span className={`truncate ${m.completed ? 'line-through opacity-80' : ''}`}>{m.title}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {m.deadlineAt && !m.completed && (
                            <span className="text-[10px] text-amber-300">
                              {formatCountdown(daysBetween(today, parseIsoDate(m.deadlineAt)), lang)}
                            </span>
                          )}
                          <span className="font-mono-code font-semibold text-emerald-300">
                            +{formatCurrency(m.reward, offer.currency, lang)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {offer.notes && (
                  <div className="text-[11px] text-[#B8A2AA] pt-2 border-t border-white/8">{offer.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Offer Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? (lang === 'de' ? 'Aufgabe bearbeiten' : lang === 'en' ? 'Edit Offer' : 'Freecash Görevini Düzenle') : (lang === 'de' ? 'Neue Freecash-Aufgabe' : lang === 'en' ? 'New Freecash Offer' : 'Yeni Freecash Görevi Ekle')}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Oyun / Görev Adı *</label>
              <input
                value={form.gameName || ''}
                onChange={(e) => setForm({ ...form, gameName: e.target.value })}
                placeholder="Örn: Monopoly GO!, Raid: Shadow Legends, Dice Dreams"
                className="pv-input"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Platform</label>
              <select
                value={form.platform || 'Android'}
                onChange={(e) => setForm({ ...form, platform: e.target.value as FreecashPlatform })}
                className="pv-select w-full"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Offerwall / Sağlayıcı</label>
              <select
                value={form.offerWall || 'Freecash Exclusive'}
                onChange={(e) => setForm({ ...form, offerWall: e.target.value })}
                className="pv-select w-full"
              >
                {OFFER_WALLS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Para Birimi</label>
              <select
                value={form.currency || 'EUR'}
                onChange={(e) => setForm({ ...form, currency: e.target.value as CurrencyCode })}
                className="pv-select w-full"
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
                <option value="TRY">TRY (₺)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Durum</label>
              <select
                value={form.status || 'active'}
                onChange={(e) => setForm({ ...form, status: e.target.value as FreecashStatus })}
                className="pv-select w-full"
              >
                <option value="active">Aktif</option>
                <option value="pending_payout">Ödeme Bekliyor</option>
                <option value="completed">Tamamlandı</option>
                <option value="expired">Süresi Doldu</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Başlangıç Tarihi</label>
              <input
                type="date"
                value={form.startedAt || ''}
                onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
                className="pv-input"
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Son Bitiş Tarihi (Deadline) *</label>
              <input
                type="date"
                value={form.deadlineAt || ''}
                onChange={(e) => setForm({ ...form, deadlineAt: e.target.value })}
                className="pv-input"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Kaç Gün Önce Uyarsın?</label>
              <input
                type="number"
                min={0}
                max={30}
                value={form.remindDaysBefore ?? 3}
                onChange={(e) => setForm({ ...form, remindDaysBefore: Number(e.target.value) })}
                className="pv-input"
              />
            </div>
          </div>

          {/* Milestones Builder */}
          <div className="space-y-2.5 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Aşamalar ve Ödüller
              </span>
              <button type="button" onClick={addMilestoneRow} className="text-xs text-rose-300 hover:text-white cursor-pointer">
                + Aşama Ekle
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {(form.milestones || []).map((m, idx) => (
                <div key={m.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={m.completed}
                    onChange={(e) => updateMilestoneRow(idx, { completed: e.target.checked })}
                    className="col-span-1 accent-emerald-500 w-4 h-4"
                    title="Tamamlandı"
                  />
                  <input
                    value={m.title}
                    onChange={(e) => updateMilestoneRow(idx, { title: e.target.value })}
                    placeholder="Örn: Seviye 20 / 48 saat bonusu"
                    className="pv-input col-span-5 text-xs"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={m.reward}
                    onChange={(e) => updateMilestoneRow(idx, { reward: Number(e.target.value) })}
                    placeholder="Ödül"
                    className="pv-input col-span-2 text-xs font-mono-code"
                  />
                  <input
                    type="date"
                    value={m.deadlineAt || ''}
                    onChange={(e) => updateMilestoneRow(idx, { deadlineAt: e.target.value })}
                    className="pv-input col-span-3 text-xs"
                    title="Bu aşamaya özel son tarih (opsiyonel)"
                  />
                  <button
                    type="button"
                    onClick={() => removeMilestoneRow(idx)}
                    className="col-span-1 text-[#9C868E] hover:text-rose-400 cursor-pointer flex justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Freecash Görev Linki</label>
              <input
                value={form.url || ''}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://freecash.com/..."
                className="pv-input text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Notlar / İpuçları</label>
              <input
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Örn: 7 gün bekleme süresi, promo kodu..."
                className="pv-input text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-white/10">
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
