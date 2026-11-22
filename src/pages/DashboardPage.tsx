import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Cake,
  Calendar,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Coins,
  CreditCard,
  Droplets,
  ExternalLink,
  Fuel,
  KeyRound,
  MapPin,
  Newspaper,
  Pin,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Sun,
  TrendingUp,
  Upload,
  Wind,
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
  WeatherSnapshot,
} from '../types';
import type { NavPage } from '../components/Layout';
import { useI18n } from '../i18n';
type Lang = 'tr' | 'en' | 'de';
import { auditPasswords } from '../utils/passwordUtils';
import { formatCurrency, summarizeSubscriptions } from '../utils/currencyUtils';
import {
  computeNextOccurrence,
  daysBetween,
  formatCountdown,
  formatLocalizedDate,
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

function getWeatherMeta(code: number, lang: Lang): { label: string; icon: React.ReactNode } {
  if (code === 0 || code === 1) {
    return {
      label: lang === 'de' ? 'Klar / Sonnig' : lang === 'en' ? 'Clear / Sunny' : 'Açık / Güneşli',
      icon: <Sun className="w-7 h-7 text-amber-300" />,
    };
  }
  if (code === 2 || code === 3) {
    return {
      label: lang === 'de' ? 'Bewölkt' : lang === 'en' ? 'Cloudy' : 'Parçalı Bulutlu',
      icon: <Cloud className="w-7 h-7 text-slate-200" />,
    };
  }
  if (code === 45 || code === 48) {
    return {
      label: lang === 'de' ? 'Nebel' : lang === 'en' ? 'Foggy' : 'Sisli',
      icon: <CloudFog className="w-7 h-7 text-slate-300" />,
    };
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return {
      label: lang === 'de' ? 'Regen' : lang === 'en' ? 'Rain' : 'Yağmurlu',
      icon: <CloudRain className="w-7 h-7 text-sky-300" />,
    };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return {
      label: lang === 'de' ? 'Schnee' : lang === 'en' ? 'Snow' : 'Karlı',
      icon: <CloudSnow className="w-7 h-7 text-cyan-200" />,
    };
  }
  if (code >= 95) {
    return {
      label: lang === 'de' ? 'Gewitter' : lang === 'en' ? 'Thunderstorm' : 'Fırtınalı',
      icon: <CloudLightning className="w-7 h-7 text-amber-400" />,
    };
  }
  return {
    label: lang === 'de' ? 'Wechselhaft' : lang === 'en' ? 'Partly Cloudy' : 'Değişken',
    icon: <Cloud className="w-7 h-7 text-slate-200" />,
  };
}

function getSmallWeatherIcon(code: number) {
  if (code <= 1) return <Sun className="w-3.5 h-3.5 text-amber-300" />;
  if (code <= 3 || code === 45 || code === 48) return <Cloud className="w-3.5 h-3.5 text-slate-300" />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className="w-3.5 h-3.5 text-cyan-200" />;
  return <CloudRain className="w-3.5 h-3.5 text-sky-300" />;
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
  const { lang, locale, t } = useI18n();
  const [markets, setMarkets] = useState<MarketsSnapshot | null>(null);
  const [news, setNews] = useState<LocalNewsSnapshot | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  const weatherCity = settings.newsRegionPrimary || settings.fuelCity || 'Hallein';

  useEffect(() => {
    api.getMarkets(settings.fuelCity || 'hallein', false).then(setMarkets).catch(() => {});
    api.getLocalNews(false).then(setNews).catch(() => {});
    api.getWeather(weatherCity, false).then(setWeather).catch(() => {});
  }, [settings.fuelCity, weatherCity, settings.newsCountry, settings.newsRegionSecondary]);

  const audit = auditPasswords(passwords);
  const subSummary = summarizeSubscriptions(subscriptions, settings.defaultCurrency, settings.exchangeRates);
  const today = startOfToday();
  const dealHits = deals.filter((d) => d.currentPrice > 0 && d.targetPrice > 0 && d.currentPrice <= d.targetPrice);
  const btc = markets?.crypto.find((c) => c.id === 'bitcoin');
  const eth = markets?.crypto.find((c) => c.id === 'ethereum');

  const upcomingItems = [
    ...events.map((ev) => {
      const occ = computeNextOccurrence(ev, today);
      return {
        id: `ev-${ev.id}`,
        kind: ev.eventType,
        title: ev.title,
        meta: occ.turningAge
          ? t('dash.turningAge', { age: occ.turningAge, date: formatLocalizedDate(occ.nextIso, lang) })
          : formatLocalizedDate(occ.nextIso, lang),
        daysUntil: occ.daysUntil,
        page: 'calendar' as NavPage,
      };
    }),
    ...subscriptions
      .filter((s) => s.status === 'active')
      .map((s) => ({
        id: `sub-${s.id}`,
        kind: 'subscription' as const,
        title: t('dash.renewalSuffix', { name: s.name }),
        meta: `${formatCurrency(s.price, s.currency, lang)} · ${formatLocalizedDate(s.nextBillingDate, lang)}`,
        daysUntil: daysBetween(today, parseIsoDate(s.nextBillingDate)),
        page: 'subscriptions' as NavPage,
      })),
  ]
    .filter((i) => i.daysUntil >= -1 && i.daysUntil <= 45)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 6);

  const pinnedNotes = notes.filter((n) => n.pinned).slice(0, 4);
  const weatherMeta = weather ? getWeatherMeta(weather.weatherCode, lang) : null;
  const topCheapestSuper95 = markets?.fuel.super95.stations[0];
  const topCheapestDiesel = markets?.fuel.diesel.stations[0];
  const regionDisplay = [settings.newsRegionPrimary, settings.newsRegionSecondary].filter(Boolean).join(' & ');

  return (
    <div className="space-y-6">
      {/* Compact Hero Bar */}
      <div className="pv-glass-crimson rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-rose-200/80 font-medium">{t('dash.badge')}</div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white mt-1">{t('dash.welcome')}</h1>
          <p className="text-sm text-[#E4D5DA] mt-1">{t('dash.welcomeSub')}</p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button onClick={() => onNavigate('clients')} className="pv-btn-primary">
            <Upload className="w-4 h-4" />
            {t('dash.uploadClientZip')}
          </button>
          <button onClick={onOpenGenerator} className="pv-btn-secondary">
            <Sparkles className="w-4 h-4 text-rose-300" />
            {t('dash.generatePass')}
          </button>
        </div>
      </div>

      {/* ROW 1: DAILY BRIEFING (HAVA DURUMU + BENZİN FİYATLARI + KRİPTO/ALTIN) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 1. LIVE WEATHER CARD */}
        <div className="pv-glass rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-200">
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              <span>
                {weather?.cityLabel || weatherCity} ·{' '}
                {lang === 'de' ? 'Wetter' : lang === 'en' ? 'Weather' : 'Hava Durumu'}
              </span>
            </div>
            <button
              onClick={() => onNavigate('news')}
              className="text-[11px] text-[#B8A2AA] hover:text-white cursor-pointer"
            >
              {lang === 'de' ? 'Region ändern' : lang === 'en' ? 'Change city' : 'Şehir Değiştir'}
            </button>
          </div>

          {weather && weatherMeta ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-13 h-13 rounded-2xl bg-black/45 border border-white/10 flex items-center justify-center shrink-0">
                    {weatherMeta.icon}
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-white font-mono-code leading-none">
                      {weather.temperature}°C
                    </div>
                    <div className="text-xs text-[#E4D5DA] mt-1">{weatherMeta.label}</div>
                  </div>
                </div>
                <div className="text-right text-[11px] text-[#C8B5BC] space-y-1">
                  <div>
                    {lang === 'de' ? 'Gefühlt' : lang === 'en' ? 'Feels' : 'Hissedilen'}:{' '}
                    <strong className="text-white">{weather.apparentTemperature}°</strong>
                  </div>
                  <div className="inline-flex items-center gap-1 justify-end">
                    <Droplets className="w-3 h-3 text-sky-300" />
                    <span>%{weather.humidity}</span>
                    <Wind className="w-3 h-3 text-slate-300 ml-1" />
                    <span>{weather.windSpeed} km/h</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 pt-2.5 border-t border-white/8 text-center">
                {weather.daily.slice(0, 4).map((d, idx) => {
                  const dt = new Date(d.date + 'T12:00:00');
                  const dayLabel =
                    idx === 0
                      ? lang === 'de'
                        ? 'Heute'
                        : lang === 'en'
                          ? 'Today'
                          : 'Bugün'
                      : dt.toLocaleDateString(locale, { weekday: 'short' });
                  return (
                    <div key={d.date} className="rounded-lg bg-black/35 px-1.5 py-2 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-[#B8A2AA]">{dayLabel}</span>
                      {getSmallWeatherIcon(d.weatherCode)}
                      <span className="text-[11px] font-mono-code text-white font-semibold">
                        {d.tempMax}° <span className="text-[#9C868E] font-normal">{d.tempMin}°</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-xs text-[#9C868E]">{t('common.loading')}</div>
          )}
        </div>

        {/* 2. LIVE FUEL PRICES CARD */}
        <div
          onClick={() => onNavigate('markets')}
          className="pv-glass rounded-2xl p-5 flex flex-col justify-between gap-3.5 hover:border-rose-500/40 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-rose-200 font-semibold flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5 text-emerald-400" />
              {markets?.fuel.cityLabel || settings.fuelCity} ·{' '}
              {lang === 'de' ? 'Spritpreise' : lang === 'en' ? 'Fuel Prices' : 'Benzin & Dizel'}
            </span>
            <span className="text-[#9C868E]">{t('dash.details')}</span>
          </div>

          {markets ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-black/45 border border-emerald-500/25 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-200">Super 95</div>
                  <div className="text-2xl font-bold font-mono-code text-emerald-300 mt-1">
                    {markets.fuel.super95.cheapest ? `€${markets.fuel.super95.cheapest.toFixed(3)}` : '—'}
                  </div>
                  {topCheapestSuper95 && (
                    <div className="text-[10px] text-[#C8B5BC] truncate mt-1">{topCheapestSuper95.name}</div>
                  )}
                </div>
                <div className="rounded-xl bg-black/45 border border-amber-500/25 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-200">Diesel</div>
                  <div className="text-2xl font-bold font-mono-code text-amber-300 mt-1">
                    {markets.fuel.diesel.cheapest ? `€${markets.fuel.diesel.cheapest.toFixed(3)}` : '—'}
                  </div>
                  {topCheapestDiesel && (
                    <div className="text-[10px] text-[#C8B5BC] truncate mt-1">{topCheapestDiesel.name}</div>
                  )}
                </div>
              </div>
              {topCheapestSuper95 && (
                <div className="text-[11px] text-[#B8A2AA] truncate pt-1 border-t border-white/8 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                  <span className="truncate">
                    {topCheapestSuper95.address}, {topCheapestSuper95.city} ({topCheapestSuper95.distanceKm} km)
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#9C868E]">{t('common.loading')}</div>
          )}
        </div>

        {/* 3. LIVE CRYPTO, GOLD & DEALS CARD */}
        <div className="pv-glass rounded-2xl p-5 flex flex-col justify-between gap-3.5 md:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => onNavigate('markets')}
              className="text-rose-200 font-semibold flex items-center gap-1.5 hover:text-white cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
              {t('dash.liveMarketGold')}
            </button>
            <button
              onClick={() => onNavigate('markets')}
              className="text-[#9C868E] hover:text-white cursor-pointer"
            >
              {t('dash.details')}
            </button>
          </div>

          {markets ? (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-black/45 border border-white/8 p-2.5">
                <div className="text-[10px] text-[#A8929A]">BTC</div>
                <div className="font-mono-code font-bold text-white mt-0.5 text-sm">
                  {btc ? `€${Math.round(btc.eur).toLocaleString(locale)}` : '—'}
                </div>
              </div>
              <div className="rounded-xl bg-black/45 border border-white/8 p-2.5">
                <div className="text-[10px] text-[#A8929A]">ETH</div>
                <div className="font-mono-code font-bold text-white mt-0.5 text-sm">
                  {eth ? `€${Math.round(eth.eur).toLocaleString(locale)}` : '—'}
                </div>
              </div>
              <div className="rounded-xl bg-black/45 border border-amber-500/20 p-2.5">
                <div className="text-[10px] text-amber-200 flex items-center gap-0.5">
                  <Coins className="w-2.5 h-2.5" /> {t('dash.gramGold')}
                </div>
                <div className="font-mono-code font-bold text-white mt-0.5 text-sm">
                  {markets.metals ? `€${markets.metals.goldGramEur.toFixed(1)}` : '—'}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-[#9C868E]">{t('common.loading')}</div>
          )}

          <button
            onClick={() => onNavigate('deals')}
            className="flex items-center justify-between gap-2 pt-2.5 border-t border-white/8 text-left hover:text-white transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2 text-xs text-[#E4D5DA]">
              <ShoppingBag className="w-3.5 h-3.5 text-rose-400" />
              <span>
                {deals.length} {t('dash.trackedProducts')}
              </span>
            </span>
            <span className="text-xs font-medium">
              {dealHits.length > 0 ? (
                <span className="text-emerald-300">{t('dash.dealsHit', { count: dealHits.length })}</span>
              ) : (
                <span className="text-[#9C868E]">{t('dash.manage')}</span>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* ROW 2: REGIONAL TOP NEWS RIGHT ON HOME PAGE */}
      <div className="pv-glass rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-rose-400" />
            <span>{regionDisplay || t('dash.localNewsTitle')} — Top Haberler (24s)</span>
          </h2>
          <button
            onClick={() => onNavigate('news')}
            className="text-xs text-rose-300 hover:text-white transition-colors cursor-pointer"
          >
            {t('dash.viewAll')}
          </button>
        </div>

        {!news ? (
          <div className="py-6 text-center text-xs text-[#9C868E]">{t('dash.newsLoading')}</div>
        ) : news.items.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#9C868E]">{t('news.empty')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {news.items.slice(0, 6).map((item, idx) => (
              <a
                key={item.id}
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-black/35 hover:bg-white/[0.08] border border-white/8 hover:border-rose-500/35 transition-all group"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    loading="lazy"
                    className="w-16 h-14 rounded-lg object-cover border border-white/15 shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[#9F1239]/35 border border-rose-500/35 flex items-center justify-center font-display text-xs font-bold text-white shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#B8A2AA]">
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200">{item.region}</span>
                    <span className="truncate">{item.source}</span>
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-white group-hover:text-rose-200 line-clamp-2 mt-0.5 leading-snug">
                    {item.title}
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[#9C868E] group-hover:text-white shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ROW 3: VAULT KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigate('passwords')}
          className="pv-glass rounded-2xl p-4 text-left hover:border-rose-500/40 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#C8B5BC]">{t('dash.savedPasswords')}</span>
            <div className="w-8 h-8 rounded-xl bg-[#9F1239]/25 border border-rose-500/30 flex items-center justify-center text-rose-300">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">{passwords.length}</div>
          <div className="text-xs text-[#B8A2AA] mt-1 flex items-center justify-between">
            <span>{t('dash.securityScore', { score: audit.healthScore })}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-300 transition-opacity" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('subscriptions')}
          className="pv-glass rounded-2xl p-4 text-left hover:border-rose-500/40 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#C8B5BC]">{t('dash.monthlySubCost')}</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center text-amber-300">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {formatCurrency(subSummary.monthlyTotal, settings.defaultCurrency, lang)}
          </div>
          <div className="text-xs text-[#B8A2AA] mt-1 flex items-center justify-between">
            <span>{t('dash.yearly', { amount: formatCurrency(subSummary.yearlyTotal, settings.defaultCurrency, lang) })}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-300 transition-opacity" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('clients')}
          className="pv-glass rounded-2xl p-4 text-left hover:border-rose-500/40 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#C8B5BC]">{t('dash.clientVaults')}</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-200">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">{clients.length}</div>
          <div className="text-xs text-[#B8A2AA] mt-1 flex items-center justify-between">
            <span>
              {t('dash.clientStats', {
                creds: clients.reduce((s, c) => s + (c.credentialCount || 0), 0),
                files: clients.reduce((s, c) => s + (c.fileCount || 0), 0),
              })}
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-300 transition-opacity" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('calendar')}
          className="pv-glass rounded-2xl p-4 text-left hover:border-rose-500/40 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#C8B5BC]">{t('dash.calendarNotes')}</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-300">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {events.length} <span className="text-sm font-normal text-[#B8A2AA]">{t('dash.datesUnit')}</span> ·{' '}
            {notes.length} <span className="text-sm font-normal text-[#B8A2AA]">{t('dash.notesUnit')}</span>
          </div>
          <div className="text-xs text-[#B8A2AA] mt-1 flex items-center justify-between">
            <span>{t('dash.upcomingCount', { count: upcomingItems.length })}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-300 transition-opacity" />
          </div>
        </button>
      </div>

      {/* ROW 4: UPCOMING DATES & PINNED NOTES + SECURITY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 pv-glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-rose-400" />
              {t('dash.upcomingHeader')}
            </h2>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs text-rose-300 hover:text-white transition-colors cursor-pointer"
            >
              {t('dash.goCalendar')}
            </button>
          </div>
          {upcomingItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#A8929A]">{t('dash.noUpcoming')}</div>
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
                    {formatCountdown(item.daysUntil, lang)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="pv-glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-rose-400" />
                {t('dash.passwordHealth')}
              </h2>
              <span className="font-mono-code text-lg font-bold text-white">%{audit.healthScore}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-3.5">
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
                className="p-3 rounded-xl bg-white/[0.04] hover:bg-rose-950/50 border border-white/10 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs text-[#C8B5BC]">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  {t('dash.weakPass')}
                </div>
                <div className="text-xl font-bold text-white mt-1">{audit.weakIds.size}</div>
              </button>
              <button
                onClick={() => onNavigate('passwords', { filter: 'reused' })}
                className="p-3 rounded-xl bg-white/[0.04] hover:bg-rose-950/50 border border-white/10 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs text-[#C8B5BC]">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  {t('dash.reusedPass')}
                </div>
                <div className="text-xl font-bold text-white mt-1">{audit.reusedIds.size}</div>
              </button>
            </div>
          </div>

          <div className="pv-glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Pin className="w-4 h-4 text-rose-400" />
                {t('dash.pinnedNotes')}
              </h2>
              <button
                onClick={() => onNavigate('notes')}
                className="text-xs text-rose-300 hover:text-white transition-colors cursor-pointer"
              >
                {t('dash.allNotes')}
              </button>
            </div>
            {pinnedNotes.length === 0 ? (
              <div className="py-5 text-center text-xs text-[#A8929A]">{t('dash.noPinnedNotes')}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {pinnedNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onNavigate('notes')}
                    className="p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium text-white truncate">
                      <StickyNote className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="truncate">{n.title}</span>
                    </div>
                    <p className="text-[11px] text-[#B8A2AA] line-clamp-2 mt-1">
                      {n.content.replace(/[#*_`>]/g, '') || t('dash.emptyContent')}
                    </p>
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
