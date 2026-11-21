import React, { useMemo, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  ExternalLink,
  LineChart,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { api } from '../api';
import type { CurrencyCode, StoreName, TrackedProduct } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

const STORES: StoreName[] = ['Amazon', 'Temu', 'AliExpress', 'MediaMarkt', 'Geizhals', 'Diğer'];

const STORE_BADGE: Record<StoreName, string> = {
  Amazon: 'bg-amber-500/20 text-amber-200 border-amber-400/35',
  Temu: 'bg-orange-500/25 text-orange-200 border-orange-400/40',
  AliExpress: 'bg-rose-500/25 text-rose-200 border-rose-500/45',
  MediaMarkt: 'bg-red-600/25 text-red-200 border-red-500/40',
  Geizhals: 'bg-sky-500/20 text-sky-200 border-sky-400/35',
  Diğer: 'bg-white/10 text-[#D7C7CC] border-white/15',
};

function extractAmazonAsin(url: string): string | null {
  const m = url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

const MiniSparkline: React.FC<{ points: { price: number }[] }> = ({ points }) => {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.price);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 120;
  const h = 32;
  const coords = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * (w - 6) + 3;
      const y = h - 4 - ((v - min) / span) * (h - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const dropped = vals[vals.length - 1] < vals[0];
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        fill="none"
        stroke={dropped ? '#34d399' : '#fb7185'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
};

interface DealsPageProps {
  deals: TrackedProduct[];
  onRefresh: () => Promise<void>;
}

const emptyDeal = (): Partial<TrackedProduct> => ({
  name: '',
  store: 'Amazon',
  url: '',
  imageUrl: '',
  currency: 'EUR',
  currentPrice: 0,
  originalPrice: 0,
  targetPrice: 0,
  notes: '',
});

export const DealsPage: React.FC<DealsPageProps> = ({ deals, onRefresh }) => {
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<'all' | 'alerts' | StoreName>('all');
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TrackedProduct | null>(null);
  const [form, setForm] = useState<Partial<TrackedProduct>>(emptyDeal());
  const [inspectingUrl, setInspectingUrl] = useState(false);
  const [inspectNote, setInspectNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick inline price log modal
  const [quickPriceItem, setQuickPriceItem] = useState<TrackedProduct | null>(null);
  const [quickPriceValue, setQuickPriceValue] = useState('');

  const targetHits = useMemo(
    () => deals.filter((d) => d.currentPrice > 0 && d.targetPrice > 0 && d.currentPrice <= d.targetPrice),
    [deals],
  );
  const discounted = useMemo(
    () => deals.filter((d) => d.currentPrice > 0 && d.originalPrice > d.currentPrice),
    [deals],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (storeFilter === 'alerts' && !(d.currentPrice > 0 && d.targetPrice > 0 && d.currentPrice <= d.targetPrice)) {
        return false;
      }
      if (storeFilter !== 'all' && storeFilter !== 'alerts' && d.store !== storeFilter) return false;
      if (!q) return true;
      return [d.name, d.store, d.notes, d.url].some((f) => f.toLowerCase().includes(q));
    });
  }, [deals, search, storeFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyDeal());
    setInspectNote('');
    setModalOpen(true);
  };

  const openEdit = (d: TrackedProduct) => {
    setEditing(d);
    setForm({ ...d });
    setInspectNote('');
    setModalOpen(true);
  };

  const handleInspectUrl = async () => {
    if (!form.url?.trim()) {
      notify('Önce ürün linkini yapıştırın.', 'info');
      return;
    }
    setInspectingUrl(true);
    setInspectNote('');
    try {
      const res = await api.inspectDealUrl(form.url.trim());
      setForm((prev) => ({
        ...prev,
        store: res.store,
        name: res.title || prev.name,
        imageUrl: res.imageUrl || prev.imageUrl,
        currency: res.currency || prev.currency,
        currentPrice: res.price ?? prev.currentPrice,
        originalPrice: res.price ?? prev.originalPrice,
        targetPrice: res.price && !prev.targetPrice ? Number((res.price * 0.85).toFixed(2)) : prev.targetPrice,
        lastCheckStatus: res.blocked ? 'blocked' : res.price ? 'ok' : 'manual',
        lastCheckMessage: res.message,
      }));
      setInspectNote(res.message);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Link incelenemedi.', 'error');
    } finally {
      setInspectingUrl(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      notify('Ürün adı zorunludur.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateDeal(editing.id, form);
        notify('Ürün takibi güncellendi.');
      } else {
        await api.createDeal(form);
        notify('Ürün indirim takibine eklendi.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckSingle = async (d: TrackedProduct) => {
    setCheckingId(d.id);
    try {
      const updated = await api.checkDealPrice(d.id);
      await onRefresh();
      if (updated.lastCheckStatus === 'ok') {
        notify(`${updated.name}: ${formatCurrency(updated.currentPrice, updated.currency)}`);
      } else {
        notify(updated.lastCheckMessage, 'info');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Kontrol edilemedi.', 'error');
    } finally {
      setCheckingId(null);
    }
  };

  const handleCheckAll = async () => {
    const withUrls = deals.filter((d) => d.url);
    if (withUrls.length === 0) return;
    setCheckingAll(true);
    let okCount = 0;
    for (const d of withUrls) {
      try {
        const res = await api.checkDealPrice(d.id);
        if (res.lastCheckStatus === 'ok') okCount++;
      } catch {
        // continue
      }
    }
    await onRefresh();
    setCheckingAll(false);
    notify(`${withUrls.length} ürün kontrol edildi (${okCount} otomatik fiyat güncellendi).`);
  };

  const handleQuickPriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPriceItem) return;
    const val = Number(quickPriceValue.replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0) {
      notify('Geçerli bir fiyat girin.', 'error');
      return;
    }
    await api.updateDeal(quickPriceItem.id, {
      currentPrice: val,
      lastCheckStatus: 'manual',
      lastCheckMessage: `Manuel güncellendi: ${formatCurrency(val, quickPriceItem.currency)}`,
    });
    setQuickPriceItem(null);
    setQuickPriceValue('');
    await onRefresh();
    if (quickPriceItem.targetPrice > 0 && val <= quickPriceItem.targetPrice) {
      notify(`🎯 ${quickPriceItem.name} hedef fiyatınıza (${formatCurrency(quickPriceItem.targetPrice, quickPriceItem.currency)}) ulaştı!`);
    } else {
      notify('Yeni fiyat geçmişe kaydedildi.');
    }
  };

  const handleDelete = async (d: TrackedProduct) => {
    if (!window.confirm(`"${d.name}" ürününü takipten çıkarmak istiyor musunuz?`)) return;
    await api.deleteDeal(d.id);
    notify('Ürün takipten çıkarıldı.');
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Favori Ürün & İndirim Takibi</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            Amazon, Temu, AliExpress, MediaMarkt ve Geizhals favorilerinizi hedef fiyat alarmları ve fiyat geçmişiyle takip edin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {deals.length > 0 && (
            <button onClick={handleCheckAll} disabled={checkingAll} className="pv-btn-secondary text-xs">
              <RefreshCw className={`w-3.5 h-3.5 text-rose-300 ${checkingAll ? 'animate-spin' : ''}`} />
              {checkingAll ? 'Kontrol Ediliyor...' : 'Tümünü Kontrol Et'}
            </button>
          )}
          <button onClick={openCreate} className="pv-btn-primary">
            <Plus className="w-4 h-4" />
            Ürün Ekle
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="pv-glass rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#C8B5BC]">Takip Edilen Ürün</div>
            <div className="text-2xl font-bold text-white mt-1">{deals.length}</div>
          </div>
          <ShoppingBag className="w-8 h-8 text-rose-400/75" />
        </div>
        <button
          onClick={() => setStoreFilter(storeFilter === 'alerts' ? 'all' : 'alerts')}
          className="pv-glass-crimson rounded-2xl p-4 flex items-center justify-between text-left cursor-pointer"
        >
          <div>
            <div className="text-xs text-rose-200">Hedef Fiyata Ulaşanlar</div>
            <div className="text-2xl font-bold text-white mt-1">{targetHits.length}</div>
          </div>
          <BellRing className="w-8 h-8 text-emerald-300" />
        </button>
        <div className="pv-glass rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#C8B5BC]">İlk Fiyattan İndirimde</div>
            <div className="text-2xl font-bold text-emerald-300 mt-1">{discounted.length}</div>
          </div>
          <TrendingDown className="w-8 h-8 text-emerald-400/80" />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="pv-glass rounded-2xl p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-rose-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün adı, mağaza veya not ara..."
            className="pv-input pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all' as const, label: `Tümü (${deals.length})` },
            { id: 'alerts' as const, label: `🎯 Hedefe Ulaşan (${targetHits.length})` },
            ...STORES.map((s) => ({ id: s, label: s })),
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStoreFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                storeFilter === f.id
                  ? 'bg-[#9F1239] text-white'
                  : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10 border border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Products List */}
      {filtered.length === 0 ? (
        <div className="pv-glass rounded-2xl p-12 text-center space-y-3">
          <Tag className="w-10 h-10 text-rose-400/70 mx-auto" />
          <div className="text-base font-medium text-white">Henüz takip edilen ürün yok</div>
          <p className="text-sm text-[#A8929A] max-w-lg mx-auto">
            Amazon, Temu veya AliExpress favori ürününüzün linkini yapıştırıp hedef indirim fiyatınızı belirleyin; fiyat düştüğünde üst bildirim zilinde anında uyarı alın.
          </p>
          <button onClick={openCreate} className="pv-btn-primary">
            <Plus className="w-4 h-4" />
            İlk Ürünü Takibe Al
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((d) => {
            const hitTarget = d.currentPrice > 0 && d.targetPrice > 0 && d.currentPrice <= d.targetPrice;
            const discountPct =
              d.originalPrice > 0 && d.currentPrice > 0 && d.currentPrice < d.originalPrice
                ? Math.round(((d.originalPrice - d.currentPrice) / d.originalPrice) * 100)
                : 0;
            const asin = d.store === 'Amazon' ? extractAmazonAsin(d.url) : null;

            return (
              <div
                key={d.id}
                className={`rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all ${
                  hitTarget
                    ? 'pv-glass-crimson border-emerald-400/50 shadow-[0_0_28px_-10px_rgba(52,211,153,0.45)]'
                    : 'pv-glass hover:border-rose-500/35'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {d.imageUrl ? (
                      <img
                        src={d.imageUrl}
                        alt={d.name}
                        className="w-14 h-14 rounded-xl object-cover bg-white/10 border border-white/15 shrink-0"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center text-rose-300 shrink-0">
                        <ShoppingBag className="w-6 h-6" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STORE_BADGE[d.store]}`}>
                          {d.store}
                        </span>
                        {hitTarget && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 border border-emerald-400/45 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Hedef Fiyatta!
                          </span>
                        )}
                        {discountPct > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                            -%{discountPct}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-white text-sm sm:text-base mt-1 line-clamp-2">{d.name}</h3>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(d)}
                        className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-white hover:bg-white/10 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(d)}
                        className="p-1.5 rounded-lg text-[#C8B5BC] hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Price Row + Sparkline */}
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-black/45 border border-white/8 px-3.5 py-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#A8929A]">Güncel Fiyat</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold text-white font-mono-code">
                          {formatCurrency(d.currentPrice, d.currency)}
                        </span>
                        {d.originalPrice > d.currentPrice && (
                          <span className="text-xs text-[#9C868E] line-through font-mono-code">
                            {formatCurrency(d.originalPrice, d.currency)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-rose-200/90 mt-0.5">
                        Hedef Alarm: <strong className="font-mono-code">{formatCurrency(d.targetPrice, d.currency)}</strong>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <MiniSparkline points={d.priceHistory || []} />
                      <span className="text-[10px] text-[#9C868E] mt-1">
                        {(d.priceHistory || []).length} fiyat kaydı
                      </span>
                    </div>
                  </div>

                  {d.lastCheckMessage && (
                    <div className="text-[11px] text-[#B8A2AA] flex items-center justify-between gap-2">
                      <span className="truncate">{d.lastCheckMessage}</span>
                    </div>
                  )}
                </div>

                {/* Action Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/8">
                  <div className="flex flex-wrap gap-1.5">
                    {d.url && (
                      <button
                        onClick={() => handleCheckSingle(d)}
                        disabled={checkingId === d.id}
                        className="pv-btn-secondary text-xs py-1.5 px-2.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-rose-300 ${checkingId === d.id ? 'animate-spin' : ''}`} />
                        Kontrol Et
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setQuickPriceItem(d);
                        setQuickPriceValue(String(d.currentPrice || ''));
                      }}
                      className="pv-btn-secondary text-xs py-1.5 px-2.5"
                    >
                      Hızlı Fiyat Gir
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {asin && (
                      <a
                        href={`https://keepa.com/#!product/3-${asin}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/30 inline-flex items-center gap-1"
                        title="Keepa ile Amazon.de tam fiyat geçmişi grafiğini aç"
                      >
                        <LineChart className="w-3 h-3" />
                        Keepa
                      </a>
                    )}
                    <a
                      href={`https://geizhals.at/?fs=${encodeURIComponent(d.name.slice(0, 60))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-400/30"
                      title="Avusturya Geizhals'ta en ucuz fiyatı karşılaştır"
                    >
                      Geizhals.at
                    </a>
                    {d.url && (
                      <a
                        href={/^https?:\/\//i.test(d.url) ? d.url : `https://${d.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="pv-btn-primary text-xs py-1.5 px-2.5"
                      >
                        Ürüne Git
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Ürünü Düzenle' : 'Favori Ürün / İndirim Takibi Ekle'}
        subtitle="Ürün linkini yapıştırıp bilgileri otomatik çekmeyi deneyebilir veya elle girebilirsiniz"
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">Ürün Linki (Amazon, Temu, AliExpress, Geizhals...)</label>
            <div className="flex gap-2">
              <input
                value={form.url || ''}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://www.amazon.de/dp/..."
                className="pv-input flex-1"
              />
              <button
                type="button"
                onClick={handleInspectUrl}
                disabled={inspectingUrl}
                className="pv-btn-secondary text-xs shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-rose-300" />
                {inspectingUrl ? 'Okunuyor...' : 'Bilgileri Çek'}
              </button>
            </div>
            {inspectNote && <p className="text-[11px] text-rose-200 mt-1.5">{inspectNote}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Ürün Adı *</label>
              <input
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Örn: Sony WH-1000XM5 Kulaklık"
                className="pv-input"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Mağaza</label>
              <select
                value={form.store || 'Amazon'}
                onChange={(e) => setForm({ ...form, store: e.target.value as StoreName })}
                className="pv-select w-full"
              >
                {STORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Güncel Fiyat</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.currentPrice ?? ''}
                onChange={(e) => setForm({ ...form, currentPrice: Number(e.target.value) })}
                className="pv-input font-mono-code"
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">İlk / Liste Fiyatı</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.originalPrice ?? ''}
                onChange={(e) => setForm({ ...form, originalPrice: Number(e.target.value) })}
                className="pv-input font-mono-code"
              />
            </div>
            <div>
              <label className="block text-xs text-[#D7C7CC] mb-1.5">Hedef İndirim Fiyatı</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.targetPrice ?? ''}
                onChange={(e) => setForm({ ...form, targetPrice: Number(e.target.value) })}
                className="pv-input font-mono-code"
              />
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
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">Notlar (Beden, renk, kupon kodu...)</label>
            <textarea
              rows={2}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="pv-input resize-none"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-white/10">
            <button type="button" onClick={() => setModalOpen(false)} className="pv-btn-secondary">
              İptal
            </button>
            <button type="submit" disabled={saving} className="pv-btn-primary">
              {saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Takibe Ekle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Inline Price Update Modal */}
      <Modal
        open={Boolean(quickPriceItem)}
        onClose={() => setQuickPriceItem(null)}
        title="Hızlı Güncel Fiyat Gir"
        subtitle={quickPriceItem?.name}
        size="sm"
      >
        <form onSubmit={handleQuickPriceSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#D7C7CC] mb-1.5">
              Yeni Gördüğünüz Fiyat ({quickPriceItem?.currency})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={quickPriceValue}
              onChange={(e) => setQuickPriceValue(e.target.value)}
              autoFocus
              className="pv-input font-mono-code text-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setQuickPriceItem(null)} className="pv-btn-secondary">
              İptal
            </button>
            <button type="submit" className="pv-btn-primary">
              Fiyatı Kaydet
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

