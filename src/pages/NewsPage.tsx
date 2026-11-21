import React, { useEffect, useMemo, useState } from 'react';
import { Clock, ExternalLink, Globe, Languages, MapPin, Newspaper, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import { api } from '../api';
import type { AppSettings, LocalNewsSnapshot, NewsCountryCode } from '../types';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';

const COUNTRIES: { code: NewsCountryCode; label: string }[] = [
  { code: 'AT', label: 'Austria / Österreich (AT)' },
  { code: 'TR', label: 'Türkiye (TR)' },
  { code: 'DE', label: 'Germany / Deutschland (DE)' },
  { code: 'CH', label: 'Switzerland / Schweiz (CH)' },
  { code: 'GB', label: 'United Kingdom (GB)' },
  { code: 'US', label: 'United States (US)' },
];

const QUICK_PRESETS: { label: string; country: NewsCountryCode; primary: string; secondary: string }[] = [
  { label: 'Hallein & Salzburg', country: 'AT', primary: 'Hallein', secondary: 'Salzburg' },
  { label: 'Wien', country: 'AT', primary: 'Wien', secondary: '' },
  { label: 'İstanbul', country: 'TR', primary: 'İstanbul', secondary: '' },
  { label: 'Ankara', country: 'TR', primary: 'Ankara', secondary: '' },
  { label: 'İzmir', country: 'TR', primary: 'İzmir', secondary: '' },
  { label: 'München & Bayern', country: 'DE', primary: 'München', secondary: 'Bayern' },
  { label: 'Berlin', country: 'DE', primary: 'Berlin', secondary: '' },
];

interface NewsPageProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

export const NewsPage: React.FC<NewsPageProps> = ({ settings, onUpdateSettings }) => {
  const { lang, locale, t } = useI18n();
  const { notify } = useToast();
  const [data, setData] = useState<LocalNewsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regionFilter, setRegionFilter] = useState<'all' | 'primary' | 'secondary'>('all');

  const formatAge = (hours: number): string => {
    if (hours < 1) {
      return t('news.ageMins', { n: Math.max(1, Math.round(hours * 60)) });
    }
    if (hours < 24) {
      return t('news.ageHours', { n: Math.round(hours) });
    }
    return t('news.ageDays', { n: Math.floor(hours / 24) });
  };

  // Dynamic Region Picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [country, setCountry] = useState<NewsCountryCode>(settings.newsCountry || 'AT');
  const [primary, setPrimary] = useState(settings.newsRegionPrimary ?? 'Hallein');
  const [secondary, setSecondary] = useState(settings.newsRegionSecondary ?? 'Salzburg');

  useEffect(() => {
    setCountry(settings.newsCountry || 'AT');
    setPrimary(settings.newsRegionPrimary ?? 'Hallein');
    setSecondary(settings.newsRegionSecondary ?? 'Salzburg');
  }, [settings.newsCountry, settings.newsRegionPrimary, settings.newsRegionSecondary]);

  const loadNews = async (
    force = false,
    override?: { country: NewsCountryCode; primary: string; secondary: string },
  ) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const snap = await api.getLocalNews(force, override);
      setData(snap);
      setRegionFilter('all');
    } catch (err) {
      notify(err instanceof Error ? err.message : t('news.loadError'), 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNews(false);
  }, [settings.newsCountry, settings.newsRegionPrimary, settings.newsRegionSecondary]);

  const handleSaveRegion = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const p = primary.trim();
    const s = secondary.trim();
    if (!p && !s) {
      notify('Lütfen en az bir şehir veya bölge adı girin.', 'error');
      return;
    }
    await onUpdateSettings({
      newsCountry: country,
      newsRegionPrimary: p || s,
      newsRegionSecondary: p && s ? s : '',
    });
    setPickerOpen(false);
    await loadNews(true, { country, primary: p || s, secondary: p && s ? s : '' });
    notify(`Haber bölgesi "${[p, s].filter(Boolean).join(' & ')}" olarak güncellendi.`);
  };

  const applyPreset = async (preset: (typeof QUICK_PRESETS)[number]) => {
    setCountry(preset.country);
    setPrimary(preset.primary);
    setSecondary(preset.secondary);
    await onUpdateSettings({
      newsCountry: preset.country,
      newsRegionPrimary: preset.primary,
      newsRegionSecondary: preset.secondary,
    });
    setPickerOpen(false);
    await loadNews(true, {
      country: preset.country,
      primary: preset.primary,
      secondary: preset.secondary,
    });
    notify(`Haber bölgesi "${preset.label}" olarak ayarlandı.`);
  };

  const items = useMemo(() => {
    if (!data) return [];
    if (regionFilter === 'primary') return data.items.filter((i) => i.isPrimaryRegion);
    if (regionFilter === 'secondary') return data.items.filter((i) => !i.isPrimaryRegion);
    return data.items;
  }, [data, regionFilter]);

  const headingRegion = data
    ? [data.regionPrimary, data.regionSecondary].filter(Boolean).join(' & ')
    : [settings.newsRegionPrimary, settings.newsRegionSecondary].filter(Boolean).join(' & ') || 'Bölgeniz';

  const feedLanguage = data?.language || (country === 'TR' ? 'tr' : country === 'GB' || country === 'US' ? 'en' : 'de');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">
            {headingRegion} — Top 10 (24h)
          </h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">{t('news.subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className="pv-btn-secondary text-xs"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-rose-300" />
            {lang === 'de' ? 'Region ändern' : lang === 'en' ? 'Change Region' : 'Bölge Değiştir'}
          </button>
          <button onClick={() => loadNews(true)} disabled={refreshing} className="pv-btn-primary text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('news.refresh')}
          </button>
        </div>
      </div>

      {/* Dynamic Region Selector Panel */}
      {pickerOpen && (
        <form onSubmit={handleSaveRegion} className="pv-glass-crimson rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Globe className="w-4 h-4 text-rose-300" />
            <span>Haber Bölgenizi Seçin (İstediğiniz Ülke & Şehir)</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 rounded-lg bg-black/45 hover:bg-[#9F1239]/55 border border-white/12 text-xs text-[#F8F4F5] cursor-pointer transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-3">
              <label className="block text-xs text-[#E4D5DA] mb-1">Ülke</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value as NewsCountryCode)}
                className="pv-select w-full text-xs"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs text-[#E4D5DA] mb-1">1. Şehir / İlçe *</label>
              <input
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                placeholder="Örn: Hallein, Kadıköy, Wien..."
                className="pv-input text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs text-[#E4D5DA] mb-1">2. Şehir / Eyalet (Opsiyonel)</label>
              <input
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
                placeholder="Örn: Salzburg, İstanbul..."
                className="pv-input text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="pv-btn-primary text-xs w-full">
                <Save className="w-3.5 h-3.5" />
                Kaydet & Getir
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="pv-glass rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setRegionFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
              regionFilter === 'all'
                ? 'bg-[#9F1239] text-white'
                : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10 border border-white/10'
            }`}
          >
            {t('news.filterAll', { count: data?.items.length || 0 })}
          </button>

          {data?.regionPrimary && data.regionSecondary && (
            <>
              <button
                onClick={() => setRegionFilter('primary')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                  regionFilter === 'primary'
                    ? 'bg-[#9F1239] text-white'
                    : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10 border border-white/10'
                }`}
              >
                {data.regionPrimary} ({data.items.filter((i) => i.isPrimaryRegion).length})
              </button>
              <button
                onClick={() => setRegionFilter('secondary')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                  regionFilter === 'secondary'
                    ? 'bg-[#9F1239] text-white'
                    : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10 border border-white/10'
                }`}
              >
                {data.regionSecondary} ({data.items.filter((i) => !i.isPrimaryRegion).length})
              </button>
            </>
          )}
        </div>

        {data && (
          <div className="text-xs text-[#A8929A]">
            {t('mkt.lastUpdate', { time: new Date(data.updatedAt).toLocaleTimeString(locale) })}
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="pv-glass rounded-2xl p-12 text-center text-sm text-[#D7C7CC]">{t('news.loading')}</div>
      ) : items.length === 0 ? (
        <div className="pv-glass rounded-2xl p-12 text-center space-y-3">
          <Newspaper className="w-10 h-10 text-rose-400/60 mx-auto" />
          <div className="text-sm text-[#B8A2AA]">{t('news.empty')}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((news, idx) => {
            const targetLang = lang === 'en' ? 'en' : lang === 'de' ? 'de' : 'tr';
            const translateUrl = `https://translate.google.com/translate?sl=${feedLanguage}&tl=${targetLang}&u=${encodeURIComponent(news.link)}`;
            return (
              <div
                key={news.id}
                className="pv-glass rounded-2xl p-4 sm:p-5 hover:border-rose-500/40 transition-all flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#9F1239]/80 to-[#2B0711] border border-rose-400/35 flex items-center justify-center font-display font-bold text-white text-base shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border ${
                        news.isPrimaryRegion
                          ? 'bg-rose-500/25 text-rose-100 border-rose-500/45'
                          : 'bg-sky-500/20 text-sky-200 border-sky-400/35'
                      }`}
                    >
                      <MapPin className="w-3 h-3" />
                      {news.region}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/8 text-[#E4D5DA]">{news.source}</span>
                    <span className="inline-flex items-center gap-1 text-[#A8929A]">
                      <Clock className="w-3 h-3" />
                      {formatAge(news.ageHours)}
                    </span>
                  </div>

                  <a
                    href={news.link}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-base font-semibold text-white hover:text-rose-200 transition-colors leading-snug"
                  >
                    {news.title}
                  </a>

                  {news.summary && <p className="text-xs text-[#C8B5BC] line-clamp-2">{news.summary}</p>}
                </div>

                <div className="flex sm:flex-col gap-2 shrink-0">
                  <a
                    href={news.link}
                    target="_blank"
                    rel="noreferrer"
                    className="pv-btn-primary text-xs py-1.5 px-3"
                  >
                    {t('news.openArticle')}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {feedLanguage !== lang && (
                    <a
                      href={translateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="pv-btn-secondary text-xs py-1.5 px-3"
                      title={t('news.translateTitle')}
                    >
                      <Languages className="w-3.5 h-3.5 text-rose-300" />
                      {t('news.translateBtn')}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
