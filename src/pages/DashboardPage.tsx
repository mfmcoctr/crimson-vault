import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Cake,
  Calendar,
  Coins,
  CreditCard,
  Fuel,
  KeyRound,
  Newspaper,
  Pin,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  StickyNote,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { api } from '../api';
import type {
  AppSettings,
  CalendarEventEntry,
  ClientVault,
  LocalNewsSnapshot,
  MarketsSnapshot,
  NoteEntry,
  PasswordEntry,
  SubscriptionEntry,
  TrackedProduct,
} from '../types';
import type { NavPage } from '../components/Layout';
import { auditPasswords } from '../utils/passwordUtils';
import { formatCurrency, summarizeSubscriptions } from '../utils/currencyUtils';
import {
  computeNextOccurrence,
  daysBetween,
  formatCountdown,
  formatTurkishDate,
  parseIsoDate,
  startOfToday,
} from '../utils/dateUtils';

interface DashboardPageProps {
  passwords: PasswordEntry[];
  subscriptions: SubscriptionEntry[];
  notes: NoteEntry[];
  events: CalendarEventEntry[];
  clients: ClientVault[];
  deals: TrackedProduct[];
  settings: AppSettings;
  onNavigate: (page: NavPage, opts?: { clientId?: string; filter?: string }) => void;
  onOpenGenerator: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  passwords,
  subscriptions,
  notes,
  events,
  clients,
  deals,
  settings,
  onNavigate,
  onOpenGenerator,
}) => {
  const [markets, setMarkets] = useState<MarketsSnapshot | null>(null);
  const [news, setNews] = useState<LocalNewsSnapshot | null>(null);

  useEffect(() => {
    api.getMarkets(settings.fuelCity || 'hallein', false).then(setMarkets).catch(() => {});
    api.getLocalNews(false).then(setNews).catch(() => {});
  }, [settings.fuelCity]);

  const audit = auditPasswords(passwords);
  const subSummary = summarizeSubscriptions(subscriptions, settings.defaultCurrency, settings.exchangeRates);
  const today = startOfToday();
  const dealHits = deals.filter((d) => d.currentPrice > 0 && d.targetPrice > 0 && d.currentPrice <= d.targetPrice);
  const btc = markets?.crypto.find((c) => c.id === 'bitcoin');
  const eth = markets?.crypto.find((c) => c.id === 'ethereum');

  // Unified upcoming timeline (next 45 days: birthdays, events, active subscription renewals)
  const upcomingItems = [
    ...events.map((ev) => {
      const occ = computeNextOccurrence(ev, today);
      return {
        id: `ev-${ev.id}`,
        kind: ev.eventType,
        title: ev.title,
        meta: occ.turningAge ? `${occ.turningAge} yaşına giriyor · ${formatTurkishDate(occ.nextIso)}` : formatTurkishDate(occ.nextIso),
        daysUntil: occ.daysUntil,
        page: 'calendar' as NavPage,
      };
    }),
    ...subscriptions
      .filter((s) => s.status === 'active')
      .map((s) => ({
        id: `sub-${s.id}`,
        kind: 'subscription' as const,
        title: `${s.name} Yenilemesi`,
        meta: `${formatCurrency(s.price, s.currency)} · ${formatTurkishDate(s.nextBillingDate)}`,
        daysUntil: daysBetween(today, parseIsoDate(s.nextBillingDate)),
        page: 'subscriptions' as NavPage,
      })),
  ]
    .filter((i) => i.daysUntil >= -1 && i.daysUntil <= 45)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 8);

  const pinnedNotes = notes.filter((n) => n.pinned).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Hero Welcome Bar */}
      <div className="pv-glass-crimson rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-rose-200/80 font-medium">
            Şifreli Yerel Kasa · AES-256-GCM
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white mt-1">
            Kasanıza Hoş Geldiniz
          </h1>
          <p className="text-sm text-[#E4D5DA] mt-1">
            Şifreleriniz, abonelikleriniz, takvim hatırlatmalarınız ve müşteri kasalarınız yerel cihazınızda güvende.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button onClick={() => onNavigate('clients')} className="pv-btn-primary">
            <Upload className="w-4 h-4" />
            Müşteri ZIP Yükle
          </button>
          <button onClick={onOpenGenerator} className="pv-btn-secondary">
            <Sparkles className="w-4 h-4 text-rose-300" />
            Şifre Üret
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigate('passwords')}
          className="pv-glass rounded-2xl p-5 text-left hover:border-rose-500/40 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#C8B5BC]">Kayıtlı Şifreler</span>
            <div className="w-9 h-9 rounded-xl bg-[#9F1239]/25 border border-rose-500/30 flex items-center justify-center text-rose-300">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3">{passwords.length}</div>
          <div className="text-xs text-[#B8A2AA] mt-1 flex items-center justify-between">
            <span>Güvenlik Skoru: %{audit.healthScore}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-300 transition-opacity" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('subscriptions')}
          className="pv-glass rounded-2xl p-5 text-left hover:border-rose-500/40 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#C8B5BC]">Aylık Abonelik Gideri</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center text-amber-300">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3">
            {formatCurrency(subSummary.monthlyTotal, settings.defaultCurrency)}
          </div>
          <div className="text-xs text-[#B8A2AA] mt-1 flex items-center justify-between">
            <span>Yıllık: {formatCurrency(subSummary.yearlyTotal, settings.defaultCurrency)}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-300 transition-opacity" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('clients')}
          className="pv-glass rounded-2xl p-5 text-left hover:border-rose-500/40 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#C8B5BC]">Müşteri Kasaları</span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-200">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3">{clients.length}</div>
          <div className="text-xs text-[#B8A2AA] mt-1 flex items-center justify-between">
            <span>
              {clients.reduce((s, c) => s + (c.credentialCount || 0), 0)} erişim ·{' '}
              {clients.reduce((s, c) => s + (c.fileCount || 0), 0)} şifreli dosya
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-300 transition-opacity" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('calendar')}
          className="pv-glass rounded-2xl p-5 text-left hover:border-rose-500/40 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#C8B5BC]">Takvim & Notlar</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-300">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-3">
            {events.length} <span className="text-sm font-normal text-[#B8A2AA]">tarih</span> · {notes.length}{' '}
            <span className="text-sm font-normal text-[#B8A2AA]">not</span>
          </div>
          <div className="text-xs text-[#B8A2AA] mt-1 flex items-center justify-between">
            <span>{upcomingItems.length} yaklaşan hatırlatma</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-300 transition-opacity" />
          </div>
        </button>
      </div>

      {/* Live Markets, Fuel (Hallein/Salzburg), Local News & Deals Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('markets')}
          className="pv-glass rounded-2xl p-4 text-left hover:border-rose-500/40 transition-all space-y-2.5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-rose-200 font-semibold flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
              Canlı Piyasa & Altın
            </span>
            <span className="text-[#9C868E]">Detay →</span>
          </div>
          {markets ? (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-black/40 p-2">
                <div className="text-[10px] text-[#A8929A]">BTC</div>
                <div className="font-mono-code font-bold text-white mt-0.5">
                  {btc ? `€${Math.round(btc.eur).toLocaleString('tr-TR')}` : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-black/40 p-2">
                <div className="text-[10px] text-[#A8929A]">ETH</div>
                <div className="font-mono-code font-bold text-white mt-0.5">
                  {eth ? `€${Math.round(eth.eur).toLocaleString('tr-TR')}` : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-black/40 p-2">
                <div className="text-[10px] text-amber-200 flex items-center gap-0.5">
                  <Coins className="w-2.5 h-2.5" /> Gram Altın
                </div>
                <div className="font-mono-code font-bold text-white mt-0.5">
                  {markets.metals ? `€${markets.metals.goldGramEur.toFixed(1)}` : '—'}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#9C868E]">Yükleniyor...</div>
          )}
          {markets && (
            <div className="flex items-center justify-between text-[11px] text-[#D7C7CC] pt-1 border-t border-white/8">
              <span className="inline-flex items-center gap-1">
                <Fuel className="w-3 h-3 text-emerald-400" />
                {markets.fuel.city === 'hallein' ? 'Hallein' : 'Salzburg'} Super 95:{' '}
                <strong className="font-mono-code text-emerald-300">
                  {markets.fuel.super95.cheapest ? `€${markets.fuel.super95.cheapest.toFixed(3)}` : '—'}
                </strong>
              </span>
              <span>
                Dizel:{' '}
                <strong className="font-mono-code text-amber-300">
                  {markets.fuel.diesel.cheapest ? `€${markets.fuel.diesel.cheapest.toFixed(3)}` : '—'}
                </strong>
              </span>
            </div>
          )}
        </button>

        <button
          onClick={() => onNavigate('news')}
          className="pv-glass rounded-2xl p-4 text-left hover:border-rose-500/40 transition-all flex flex-col justify-between gap-2 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-rose-200 font-semibold flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-rose-400" />
              Hallein & Salzburg Top 10
            </span>
            <span className="text-[#9C868E]">Tümü →</span>
          </div>
          {news && news.items.length > 0 ? (
            <div className="space-y-1.5">
              {news.items.slice(0, 2).map((n) => (
                <div key={n.id} className="text-xs text-white truncate">
                  <span className="text-rose-300 mr-1.5">•</span>
                  {n.title}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[#9C868E]">Son 24 saat haberleri yükleniyor...</div>
          )}
          <div className="text-[11px] text-[#A8929A]">
            {news ? `Son 24 saatte ${news.last24hCount} bölge haberi` : 'ORF Salzburg + Bölge Basını'}
          </div>
        </button>

        <button
          onClick={() => onNavigate('deals')}
          className="pv-glass rounded-2xl p-4 text-left hover:border-rose-500/40 transition-all flex flex-col justify-between gap-2 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-rose-200 font-semibold flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-rose-400" />
              İndirim & Ürün Takibi
            </span>
            <span className="text-[#9C868E]">Yönet →</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-white">{deals.length}</span>
            <span className="text-xs text-[#C8B5BC]">takip edilen ürün</span>
          </div>
          <div className="text-xs">
            {dealHits.length > 0 ? (
              <span className="text-emerald-300 font-medium">
                🎯 {dealHits.length} ürün hedef indirim fiyatına ulaştı!
              </span>
            ) : (
              <span className="text-[#A8929A]">Amazon, Temu, AliExpress fiyat alarmları</span>
            )}
          </div>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Upcoming Events & Renewals */}
        <div className="lg:col-span-7 space-y-6">
          <div className="pv-glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-400" />
                Yaklaşan Önemli Tarihler & Yenilemeler
              </h2>
              <button
                onClick={() => onNavigate('calendar')}
                className="text-xs text-rose-300 hover:text-white transition-colors cursor-pointer"
              >
                Takvime Git →
              </button>
            </div>
            {upcomingItems.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#A8929A]">
                Önümüzdeki 45 gün içinde kayıtlı doğum günü, etkinlik veya yenileme bulunmuyor.
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcomingItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.page)}
                    className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 transition-colors text-left cursor-pointer"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        item.kind === 'birthday'
                          ? 'bg-rose-500/20 text-rose-300'
                          : item.kind === 'subscription'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {item.kind === 'birthday' ? (
                        <Cake className="w-4 h-4" />
                      ) : item.kind === 'subscription' ? (
                        <CreditCard className="w-4 h-4" />
                      ) : (
                        <Calendar className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{item.title}</div>
                      <div className="text-xs text-[#B8A2AA] truncate">{item.meta}</div>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                        item.daysUntil <= 1
                          ? 'bg-[#E11D48]/30 text-rose-100 border border-rose-500/50'
                          : item.daysUntil <= 7
                            ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                            : 'bg-white/8 text-[#D7C7CC]'
                      }`}
                    >
                      {formatCountdown(item.daysUntil)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pinned Notes */}
          <div className="pv-glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Pin className="w-4 h-4 text-rose-400" />
                Sabitlenmiş Güvenli Notlar
              </h2>
              <button
                onClick={() => onNavigate('notes')}
                className="text-xs text-rose-300 hover:text-white transition-colors cursor-pointer"
              >
                Tüm Notlar →
              </button>
            </div>
            {pinnedNotes.length === 0 ? (
              <div className="py-7 text-center text-sm text-[#A8929A]">
                Henüz sabitlenmiş not yok. Önemli notlarınızı sabitleyerek burada hızlıca görebilirsiniz.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pinnedNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onNavigate('notes')}
                    className="p-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-white truncate">
                      <StickyNote className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="truncate">{n.title}</span>
                    </div>
                    <p className="text-xs text-[#B8A2AA] line-clamp-2 mt-1.5">
                      {n.content.replace(/[#*_`>]/g, '') || 'İçerik boş'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Security Health + Client Vaults Quick List */}
        <div className="lg:col-span-5 space-y-6">
          <div className="pv-glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-rose-400" />
                Şifre Güvenlik Sağlığı
              </h2>
              <span className="font-mono-code text-lg font-bold text-white">%{audit.healthScore}</span>
            </div>

            <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  audit.healthScore >= 80
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : audit.healthScore >= 55
                      ? 'bg-gradient-to-r from-amber-500 to-rose-400'
                      : 'bg-gradient-to-r from-red-600 to-rose-500'
                }`}
                style={{ width: `${audit.healthScore}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onNavigate('passwords', { filter: 'weak' })}
                className="p-3.5 rounded-xl bg-white/[0.04] hover:bg-rose-950/50 border border-white/10 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs text-[#C8B5BC]">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Zayıf Şifre
                </div>
                <div className="text-xl font-bold text-white mt-1">{audit.weakIds.size}</div>
              </button>
              <button
                onClick={() => onNavigate('passwords', { filter: 'reused' })}
                className="p-3.5 rounded-xl bg-white/[0.04] hover:bg-rose-950/50 border border-white/10 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs text-[#C8B5BC]">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Tekrarlanan
                </div>
                <div className="text-xl font-bold text-white mt-1">{audit.reusedIds.size}</div>
              </button>
            </div>
          </div>

          <div className="pv-glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-rose-400" />
                Müşteri Kasaları
              </h2>
              <button
                onClick={() => onNavigate('clients')}
                className="text-xs text-rose-300 hover:text-white transition-colors cursor-pointer"
              >
                Tümünü Yönet →
              </button>
            </div>
            {clients.length === 0 ? (
              <div className="py-7 text-center space-y-3">
                <p className="text-sm text-[#A8929A]">
                  Web sitesi müşterileriniz için ayrı şifreli kasalar oluşturun veya toplu ZIP arşivi yükleyin.
                </p>
                <button onClick={() => onNavigate('clients')} className="pv-btn-secondary text-xs">
                  <Upload className="w-3.5 h-3.5 text-rose-300" />
                  İlk Müşteri Kasasını Oluştur
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {clients.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onNavigate('clients', { clientId: c.id })}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-[#9F1239]/25 border border-white/8 transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{c.name}</div>
                      <div className="text-xs text-[#B8A2AA] truncate">{c.domain || c.company || 'Domain eklenmemiş'}</div>
                    </div>
                    <div className="text-[11px] text-rose-200 bg-rose-950/60 border border-rose-500/25 px-2.5 py-1 rounded-full shrink-0">
                      {c.credentialCount || 0} şifre · {c.fileCount || 0} dosya
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

