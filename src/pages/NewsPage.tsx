import React, { useEffect, useMemo, useState } from 'react';
import { Clock, ExternalLink, Languages, MapPin, Newspaper, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { LocalNewsSnapshot } from '../types';
import { useToast } from '../components/Toast';

function formatAgeTurkish(hours: number): string {
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} dk önce`;
  }
  if (hours < 24) {
    return `${Math.round(hours)} saat önce`;
  }
  return `${Math.floor(hours / 24)} gün önce`;
}

export const NewsPage: React.FC = () => {
  const { notify } = useToast();
  const [data, setData] = useState<LocalNewsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regionFilter, setRegionFilter] = useState<'all' | 'Hallein' | 'Salzburg'>('all');

  const loadNews = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      setData(await api.getLocalNews(force));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Haberler yüklenemedi.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNews(false);
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    if (regionFilter === 'all') return data.items;
    return data.items.filter((i) => i.region === regionFilter);
  }, [data, regionFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Hallein & Salzburg — Son 24 Saat Top 10</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            ORF Salzburg, Salzburger Nachrichten, MeinBezirk Hallein ve bölge kaynaklarından derlenen en önemli 10 haber.
          </p>
        </div>

        <button onClick={() => loadNews(true)} disabled={refreshing} className="pv-btn-primary text-xs self-start sm:self-auto">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Haberleri Yenile
        </button>
      </div>

      {/* Filter Bar */}
      <div className="pv-glass rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[
            { id: 'all' as const, label: `Top 10 Tümü (${data?.items.length || 0})` },
            {
              id: 'Hallein' as const,
              label: `Hallein / Tennengau (${data?.items.filter((i) => i.region === 'Hallein').length || 0})`,
            },
            {
              id: 'Salzburg' as const,
              label: `Salzburg (${data?.items.filter((i) => i.region === 'Salzburg').length || 0})`,
            },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setRegionFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                regionFilter === f.id
                  ? 'bg-[#9F1239] text-white'
                  : 'bg-white/5 text-[#D7C7CC] hover:bg-white/10 border border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {data && (
          <div className="text-xs text-[#A8929A]">
            Son güncelleme: {new Date(data.updatedAt).toLocaleTimeString('tr-TR')}
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="pv-glass rounded-2xl p-12 text-center text-sm text-[#D7C7CC]">
          Hallein & Salzburg son 24 saat haberleri derleniyor...
        </div>
      ) : items.length === 0 ? (
        <div className="pv-glass rounded-2xl p-12 text-center space-y-3">
          <Newspaper className="w-10 h-10 text-rose-400/60 mx-auto" />
          <div className="text-sm text-[#B8A2AA]">Bu filtrede haber bulunamadı.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((news, idx) => {
            const translateUrl = `https://translate.google.com/translate?sl=de&tl=tr&u=${encodeURIComponent(news.link)}`;
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
                        news.region === 'Hallein'
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
                      {formatAgeTurkish(news.ageHours)}
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
                    Haberi Aç
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={translateUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pv-btn-secondary text-xs py-1.5 px-3"
                    title="Google Çeviri ile Türkçe oku"
                  >
                    <Languages className="w-3.5 h-3.5 text-rose-300" />
                    Türkçe Oku
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
