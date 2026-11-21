import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { api } from '../api';
import type { AppSettings, BillingCycle, CurrencyCode, SubscriptionEntry, SubscriptionStatus } from '../types';
import {
  BILLING_CYCLE_LABELS,
  convertCurrency,
  formatCurrency,
  summarizeSubscriptions,
} from '../utils/currencyUtils';
import {
  advanceBillingDate,
  daysBetween,
  formatCountdown,
  formatTurkishDate,
  parseIsoDate,
  startOfToday,
  toIsoDate,
} from '../utils/dateUtils';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

const SUB_CATEGORIES = ['Yazılım / AI', 'Bulut / Hosting', 'Eğlence / Yayın', 'Müzik', 'Domain / Sunucu', 'Yaşam', 'Diğer'];

interface SubscriptionsPageProps {
  subscriptions: SubscriptionEntry[];
  settings: AppSettings;
  onRefresh: () => Promise<void>;
}

const emptySub = (defaultCurrency: CurrencyCode): Partial<SubscriptionEntry> => ({
  name: '',
  price: 0,
  currency: defaultCurrency,
  billingCycle: 'monthly',
  nextBillingDate: toIsoDate(new Date()),
  category: 'Yazılım / AI',
  status: 'active',
  autoRenew: true,
  paymentMethod: '',
  url: '',
  notes: '',
  remindDaysBefore: 3,
});

export const SubscriptionsPage: React.FC<SubscriptionsPageProps> = ({ subscriptions, settings, onRefresh }) => {
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionEntry | null>(null);
  const [form, setForm] = useState<Partial<SubscriptionEntry>>(emptySub(settings.defaultCurrency));
  const [saving, setSaving] = useState(false);

  const summary = useMemo(
    () => summarizeSubscriptions(subscriptions, settings.defaultCurrency, settings.exchangeRates),
    [subscriptions, settings],
  );
  const today = startOfToday();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subscriptions
      .filter((s) => {
        if (statusFilter !== 'all' && s.status !== statusFilter) return false;
        if (!q) return true;
        return [s.name, s.category, s.notes, s.paymentMethod].some((f) => f.toLowerCase().includes(q));
      })
      .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));
  }, [subscriptions, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptySub(settings.defaultCurrency));
    setModalOpen(true);
  };

  const openEdit = (s: SubscriptionEntry) => {
    setEditing(s);
    setForm({ ...s });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      notify('Abonelik adı zorunludur.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateSubscription(editing.id, form);
        notify('Abonelik güncellendi.');
      } else {
        await api.createSubscription(form);
        notify('Abonelik eklendi.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'İşlem başarısız.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdvancePeriod = async (s: SubscriptionEntry) => {
    const nextDate = advanceBillingDate(s.nextBillingDate, s.billingCycle);
    await api.updateSubscription(s.id, { nextBillingDate: nextDate });
    notify(`${s.name} sonraki yenileme tarihi ${formatTurkishDate(nextDate)} olarak güncellendi.`);
    await onRefresh();
  };

  const handleDelete = async (s: SubscriptionEntry) => {
    if (!window.confirm(`"${s.name}" aboneliğini silmek istiyor musunuz?`)) return;
    await api.deleteSubscription(s.id);
    notify('Abonelik silindi.');
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Abonelik Takibi & Gider Özeti</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            Tüm düzenli ödemelerinizi çoklu para birimi desteği ve yenileme uyarılarıyla takip edin.
          </p>
        </div>
        <button onClick={openCreate} className="pv-btn-primary">
          <Plus className="w-4 h-4" />
          Yeni Abonelik
        </button>
      </div>

      {/* Cost Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="pv-glass-crimson rounded-2xl p-5">
            <div className="text-xs text-rose-200/80 uppercase tracking-wider">Aylık Tahmini Gider</div>
            <div className="text-3xl font-bold text-white mt-2">
              {formatCurrency(summary.monthlyTotal, settings.defaultCurrency)}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.entries(summary.byOriginalCurrency).map(([cur, val]) => (
                <span key={cur} className="text-[11px] px-2 py-0.5 rounded-full bg-black/40 text-rose-100 border border-white/10">
                  {formatCurrency(val || 0, cur as CurrencyCode)} / ay
                </span>
              ))}
            </div>
          </div>

          <div className="pv-glass rounded-2xl p-5">
            <div className="text-xs text-[#C8B5BC] uppercase tracking-wider">Yıllık Toplam Projeksiyon</div>
            <div className="text-3xl font-bold text-white mt-2">
              {formatCurrency(summary.yearlyTotal, settings.defaultCurrency)}
            </div>
            <div className="text-xs text-[#B8A2AA] mt-3 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
              <span>{summary.activeCount} aktif abonelik · Kurlar Ayarlar'dan düzenlenebilir</span>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="lg:col-span-5 pv-glass rounded-2xl p-5">
          <div className="text-xs text-[#C8B5BC] uppercase tracking-wider mb-3">Kategori Bazlı Aylık Dağılım</div>
          {summary.byCategory.length === 0 ? (
            <div className="text-xs text-[#9C868E] py-4">Henüz aktif abonelik verisi yok.</div>
          ) : (
            <div className="space-y-2.5">
              {summary.byCategory.slice(0, 4).map((cat) => {
                const pct = summary.monthlyTotal > 0 ? Math.round((cat.monthly / summary.monthlyTotal) * 100) : 0;
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#F8F4F5]">{cat.category}</span>
                      <span className="text-[#D7C7CC]">
                        {formatCurrency(cat.monthly, settings.defaultCurrency)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#9F1239] to-[#FB7185]"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="pv-glass rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Abonelik adı, kategori veya ödeme yöntemi ara..."
            className="pv-input pl-10"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { id: 'active', label: 'Aktif' },
            { id: 'paused', label: 'Duraklatıldı' },
            { id: 'cancelled', label: 'İptal' },
            { id: 'all', label: 'Tümü' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id as 'all' | SubscriptionStatus)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                statusFilter === t.id
                  ? 'bg-[#9F1239] text-white'
                  : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10 border border-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Subscriptions Grid */}
      {filtered.length === 0 ? (
        <div className="pv-glass rounded-2xl p-12 text-center space-y-3">
          <CreditCard className="w-10 h-10 text-rose-400/70 mx-auto" />
          <div className="text-base font-medium text-white">Abonelik kaydı bulunamadı</div>
          <p className="text-sm text-[#A8929A]">Netflix, ChatGPT, Hosting veya SaaS aboneliklerinizi ekleyin.</p>
          <button onClick={openCreate} className="pv-btn-primary">
            <Plus className="w-4 h-4" />
            İlk Aboneliği Ekle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const daysUntil = daysBetween(today, parseIsoDate(s.nextBillingDate));
            const converted =
              s.currency !== settings.defaultCurrency
                ? convertCurrency(s.price, s.currency, settings.defaultCurrency, settings.exchangeRates)
                : null;

            return (
              <div
                key={s.id}
                className="pv-glass rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-rose-500/35 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white truncate">{s.name}</h3>
                        {s.url && (
                          <a
                            href={/^https?:\/\//i.test(s.url) ? s.url : `https://${s.url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-rose-300 hover:text-white"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <span className="text-xs text-[#B8A2AA]">{s.category}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-white hover:bg-white/10 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-rose-300 hover:bg-rose-950/60 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between bg-black/45 border border-white/8 rounded-xl px-3.5 py-2.5">
                    <div>
                      <span className="text-xl font-bold text-white">{formatCurrency(s.price, s.currency)}</span>
                      <span className="text-xs text-[#B8A2AA] ml-1.5">/ {BILLING_CYCLE_LABELS[s.billingCycle]}</span>
                    </div>
                    {converted !== null && (
                      <span className="text-xs text-rose-200/90">
                        ≈ {formatCurrency(converted, settings.defaultCurrency)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#C8B5BC]">Sonraki Yenileme:</span>
                    <span className="text-white font-medium">{formatTurkishDate(s.nextBillingDate)}</span>
                  </div>

                  {s.paymentMethod && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#C8B5BC]">Ödeme Yöntemi:</span>
                      <span className="text-[#E4D5DA]">{s.paymentMethod}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/8">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      s.status !== 'active'
                        ? 'bg-white/8 text-[#A8929A]'
                        : daysUntil <= 2
                          ? 'bg-rose-600/35 text-rose-100 border border-rose-500/45'
                          : daysUntil <= 7
                            ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                            : 'bg-white/8 text-[#D7C7CC]'
                    }`}
                  >
                    {s.status === 'active'
                      ? formatCountdown(daysUntil)
                      : s.status === 'paused'
                        ? 'Duraklatıldı'
                        : 'İptal Edildi'}
                  </span>

                  {s.status === 'active' && s.billingCycle !== 'once' && (
                    <button
                      onClick={() => handleAdvancePeriod(s)}
                      className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/6 hover:bg-[#9F1239]/40 text-[#F8F4F5] border border-white/10 transition-colors cursor-pointer"
                      title="Ödemeyi işaretle ve tarihi sonraki döneme taşı"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Ödendi
                      <RefreshCw className="w-3 h-3 opacity-70" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Aboneliği Düzenle' : 'Yeni Abonelik Ekle'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Hizmet Adı *</label>
              <input
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Örn: Spotify, Hetzner VPS, ChatGPT Plus"
                className="pv-input"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Kategori</label>
              <select
                value={form.category || 'Yazılım / AI'}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="pv-select w-full"
              >
                {SUB_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Tutar *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price ?? ''}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="pv-input"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Para Birimi</label>
              <select
                value={form.currency || 'TRY'}
                onChange={(e) => setForm({ ...form, currency: e.target.value as CurrencyCode })}
                className="pv-select w-full"
              >
                <option value="TRY">TRY (₺)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Ödeme Döngüsü</label>
              <select
                value={form.billingCycle || 'monthly'}
                onChange={(e) => setForm({ ...form, billingCycle: e.target.value as BillingCycle })}
                className="pv-select w-full"
              >
                <option value="monthly">Aylık</option>
                <option value="yearly">Yıllık</option>
                <option value="quarterly">3 Aylık</option>
                <option value="weekly">Haftalık</option>
                <option value="once">Tek Seferlik</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Sonraki Ödeme Tarihi</label>
              <input
                type="date"
                value={form.nextBillingDate || ''}
                onChange={(e) => setForm({ ...form, nextBillingDate: e.target.value })}
                className="pv-input"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Durum</label>
              <select
                value={form.status || 'active'}
                onChange={(e) => setForm({ ...form, status: e.target.value as SubscriptionStatus })}
                className="pv-select w-full"
              >
                <option value="active">Aktif</option>
                <option value="paused">Duraklatıldı</option>
                <option value="cancelled">İptal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Kaç Gün Önce Hatırlat?</label>
              <input
                type="number"
                min="0"
                max="60"
                value={form.remindDaysBefore ?? 3}
                onChange={(e) => setForm({ ...form, remindDaysBefore: Number(e.target.value) })}
                className="pv-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Ödeme Yöntemi / Kart Notu</label>
              <input
                value={form.paymentMethod || ''}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                placeholder="Örn: Sanal Kart ••4821"
                className="pv-input"
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Yönetim Paneli URL</label>
              <input
                value={form.url || ''}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://..."
                className="pv-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">Notlar</label>
            <textarea
              rows={2}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="pv-input resize-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
            <button type="button" onClick={() => setModalOpen(false)} className="pv-btn-secondary">
              İptal
            </button>
            <button type="submit" disabled={saving} className="pv-btn-primary">
              {saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

