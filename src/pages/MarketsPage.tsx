import React, { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  ExternalLink,
  Fuel,
  MapPin,
  Plus,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { AppSettings, MarketsSnapshot } from '../types';
import { useToast } from '../components/Toast';

const AVAILABLE_COINS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { id: 'the-open-network', symbol: 'TON', name: 'Toncoin' },
  { id: 'sui', symbol: 'SUI', name: 'Sui' },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
  { id: 'tron', symbol: 'TRX', name: 'TRON' },
  { id: 'pepe', symbol: 'PEPE', name: 'Pepe' },
];

interface MarketsPageProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

function fmtMoney(val: number, cur: 'EUR' | 'USD' | 'TRY'): string {
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '₺';
  const decimals = val > 0 && val < 0.05 ? 6 : val < 5 ? 3 : 2;
  return `${sym}${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val)}`;
}

export const MarketsPage: React.FC<MarketsPageProps> = ({ settings, onUpdateSettings }) => {
  const { notify } = useToast();
  const [data, setData] = useState<MarketsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const city = settings.fuelCity || 'hallein';
  const cur = settings.marketCurrency || 'EUR';
  const watchlist = settings.cryptoWatchlist?.length
    ? settings.cryptoWatchlist
    : ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple'];

  const loadMarkets = async (targetCity = city, force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const snap = await api.getMarkets(targetCity, force);
      setData(snap);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Piyasa verileri alınamadı.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMarkets(city, false);
  }, [city, watchlist.join(',')]);

  const toggleCoin = async (coinId: string) => {
    const exists = watchlist.includes(coinId);
    if (exists && watchlist.length <= 1) {
      notify('En az 1 kripto para takipte kalmalıdır.', 'info');
      return;
    }
    const next = exists ? watchlist.filter((c) => c !== coinId) : [...watchlist, coinId];
    await onUpdateSettings({ cryptoWatchlist: next });
  };

  const handleSyncFxToSubscriptions = async () => {
    if (!data?.fx) return;
    await onUpdateSettings({
      exchangeRates: {
        TRY: 1,
        EUR: Number(data.fx.eurToTry.toFixed(2)),
        USD: Number(data.fx.usdToTry.toFixed(2)),
        GBP: Number((data.fx.eurToTry / data.fx.eurToGbp).toFixed(2)),
      },
    });
    notify('Canlı ECB döviz kurları abonelik gider hesaplayıcısına aktarıldı!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Piyasalar, Altın & Yakıt</h1>
          <p className="text-sm text-[#C8B5BC] mt-0.5">
            Canlı Kripto (BTC, ETH...), Altın/Gümüş, ECB Döviz ve Avusturya E-Control resmi Hallein/Salzburg yakıt fiyatları.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-black/45 border border-white/10 p-1 text-xs">
            {(['EUR', 'USD', 'TRY'] as const).map((c) => (
              <button
                key={c}
                onClick={() => onUpdateSettings({ marketCurrency: c })}
                className={`px-3 py-1 rounded-lg font-medium cursor-pointer transition-all ${
                  cur === c ? 'bg-[#9F1239] text-white' : 'text-[#C8B5BC] hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadMarkets(city, true)}
            disabled={refreshing}
            className="pv-btn-primary text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Canlı Yenile
          </button>
        </div>
      </div>

      {data?.warnings && data.warnings.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 px-4 py-2.5 text-xs text-amber-200">
          {data.warnings.join(' · ')}
        </div>
      )}

      {loading && !data ? (
        <div className="pv-glass rounded-2xl p-12 text-center text-sm text-[#D7C7CC]">
          Canlı piyasa ve E-Control yakıt verileri çekiliyor...
        </div>
      ) : data ? (
        <>
          {/* SECTION 1: CRYPTO WATCHLIST */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-rose-400" />
                Kripto Takip Listesi
              </h2>
              <button
                onClick={() => setPickerOpen((o) => !o)}
                className="pv-btn-secondary text-xs py-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-rose-300" />
                Coin Ekle / Çıkar
              </button>
            </div>

            {pickerOpen && (
              <div className="pv-glass rounded-2xl p-4 flex flex-wrap gap-2">
                {AVAILABLE_COINS.map((coin) => {
                  const active = watchlist.includes(coin.id);
                  return (
                    <button
                      key={coin.id}
                      onClick={() => toggleCoin(coin.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                        active
                          ? 'bg-[#9F1239] text-white border border-rose-400/40'
                          : 'bg-white/5 text-[#D7C7CC] border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <span>{coin.symbol}</span>
                      <span className="opacity-75 text-[10px]">{coin.name}</span>
                      {active && <X className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
              {data.crypto.map((c) => {
                const primary = cur === 'EUR' ? c.eur : cur === 'USD' ? c.usd : c.try;
                const secondary = cur === 'EUR' ? fmtMoney(c.usd, 'USD') : fmtMoney(c.eur, 'EUR');
                const positive = c.change24h >= 0;
                return (
                  <div
                    key={c.id}
                    className="pv-glass rounded-2xl p-4 hover:border-rose-500/40 transition-all space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-sm">{c.symbol}</div>
                        <div className="text-[11px] text-[#A8929A]">{c.name}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          positive
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                            : 'bg-rose-500/25 text-rose-200 border border-rose-500/40'
                        }`}
                      >
                        {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(c.change24h).toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white font-mono-code">
                        {fmtMoney(primary, cur)}
                      </div>
                      <div className="text-[11px] text-[#B8A2AA] font-mono-code mt-0.5">
                        {secondary} · {fmtMoney(c.try, 'TRY')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: GOLD, SILVER & LIVE FX */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 pv-glass-crimson rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-300" />
                  Altın & Gümüş
                </h2>
                <span className="text-[11px] text-rose-200/80">Canlı Spot Fiyatlar</span>
              </div>

              {data.metals ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-black/45 border border-amber-400/25 p-3.5">
                    <div className="text-[11px] text-amber-200/90 uppercase tracking-wider">Gram Altın</div>
                    <div className="text-xl font-bold text-white font-mono-code mt-1.5">
                      {fmtMoney(data.metals.goldGramEur, 'EUR')}
                    </div>
                    <div className="text-xs text-[#D7C7CC] font-mono-code mt-0.5">
                      {fmtMoney(data.metals.goldGramTry, 'TRY')}
                    </div>
                  </div>

                  <div className="rounded-xl bg-black/45 border border-white/10 p-3.5">
                    <div className="text-[11px] text-[#C8B5BC] uppercase tracking-wider">Ons Altın (XAU)</div>
                    <div className="text-xl font-bold text-white font-mono-code mt-1.5">
                      {fmtMoney(data.metals.goldOunceUsd, 'USD')}
                    </div>
                    <div className="text-xs text-[#D7C7CC] font-mono-code mt-0.5">
                      {fmtMoney(data.metals.goldOunceEur, 'EUR')}
                    </div>
                  </div>

                  <div className="rounded-xl bg-black/45 border border-white/10 p-3.5">
                    <div className="text-[11px] text-[#C8B5BC] uppercase tracking-wider">Gram Gümüş (XAG)</div>
                    <div className="text-xl font-bold text-white font-mono-code mt-1.5">
                      {fmtMoney(data.metals.silverGramEur, 'EUR')}
                    </div>
                    <div className="text-xs text-[#D7C7CC] font-mono-code mt-0.5">
                      {fmtMoney(data.metals.silverGramTry, 'TRY')}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#B8A2AA]">Altın verisi alınamadı.</div>
              )}
            </div>

            <div className="lg:col-span-5 pv-glass rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white">Döviz Kurları (ECB)</h2>
                  {data.fx && <span className="text-[11px] text-[#9C868E]">{data.fx.date}</span>}
                </div>
                {data.fx ? (
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="rounded-xl bg-black/45 border border-white/8 p-3">
                      <div className="text-[10px] text-[#B8A2AA]">EUR / TRY</div>
                      <div className="text-base font-bold text-white font-mono-code mt-1">
                        ₺{data.fx.eurToTry.toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-black/45 border border-white/8 p-3">
                      <div className="text-[10px] text-[#B8A2AA]">USD / TRY</div>
                      <div className="text-base font-bold text-white font-mono-code mt-1">
                        ₺{data.fx.usdToTry.toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-black/45 border border-white/8 p-3">
                      <div className="text-[10px] text-[#B8A2AA]">EUR / USD</div>
                      <div className="text-base font-bold text-white font-mono-code mt-1">
                        ${data.fx.eurToUsd.toFixed(4)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#B8A2AA]">Döviz verisi alınamadı.</div>
                )}
              </div>

              {data.fx && (
                <button onClick={handleSyncFxToSubscriptions} className="pv-btn-secondary text-xs w-full">
                  Bu Canlı Kurları Abonelik Hesabına Aktar
                </button>
              )}
            </div>
          </div>

          {/* SECTION 3: AUSTRIA E-CONTROL LIVE FUEL (HALLEIN & SALZBURG) */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-rose-400" />
                  Canlı Benzin & Dizel Fiyatları — {data.fuel.cityLabel}
                </h2>
                <p className="text-xs text-[#B8A2AA] mt-0.5">
                  Avusturya Resmi E-Control Spritpreisrechner verisi (En ucuz 5 açık istasyon)
                </p>
              </div>
              <div className="flex rounded-xl bg-black/45 border border-white/10 p-1 text-xs">
                {[
                  { id: 'hallein' as const, label: 'Hallein (5400)' },
                  { id: 'salzburg' as const, label: 'Salzburg (5020)' },
                ].map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => onUpdateSettings({ fuelCity: loc.id })}
                    className={`px-3.5 py-1.5 rounded-lg font-medium cursor-pointer transition-all ${
                      city === loc.id ? 'bg-[#9F1239] text-white' : 'text-[#C8B5BC] hover:text-white'
                    }`}
                  >
                    {loc.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[
                {
                  title: 'Super 95 (Benzin)',
                  accent: 'text-emerald-300',
                  badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35',
                  block: data.fuel.super95,
                },
                {
                  title: 'Diesel (Dizel)',
                  accent: 'text-amber-300',
                  badge: 'bg-amber-500/20 text-amber-200 border-amber-400/35',
                  block: data.fuel.diesel,
                },
              ].map((fuelCol) => (
                <div key={fuelCol.title} className="pv-glass rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-white">{fuelCol.title}</h3>
                      {fuelCol.block.average && (
                        <span className="text-xs text-[#B8A2AA]">
                          Bölge ortalaması: €{fuelCol.block.average.toFixed(3)} / L
                        </span>
                      )}
                    </div>
                    {fuelCol.block.cheapest && (
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-[#B8A2AA]">En Ucuz</div>
                        <div className={`text-2xl font-bold font-mono-code ${fuelCol.accent}`}>
                          €{fuelCol.block.cheapest.toFixed(3)}
                        </div>
                      </div>
                    )}
                  </div>

                  {fuelCol.block.stations.length === 0 ? (
                    <div className="text-xs text-[#9C868E] py-4">Açık istasyon verisi bulunamadı.</div>
                  ) : (
                    <div className="space-y-2">
                      {fuelCol.block.stations.map((st, idx) => (
                        <a
                          key={st.id}
                          href={`https://www.google.com/maps/search/?api=1&query=${st.latitude},${st.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/40 hover:bg-white/[0.08] border border-white/8 transition-colors"
                        >
                          <div className="min-w-0 flex items-start gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-white/8 text-xs font-bold text-white flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white truncate">{st.name}</div>
                              <div className="text-xs text-[#B8A2AA] truncate flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0 text-rose-400" />
                                <span>
                                  {st.address}, {st.postalCode} {st.city} · {st.distanceKm} km
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-mono-code text-sm font-bold px-2.5 py-1 rounded-lg border ${fuelCol.badge}`}>
                              €{st.price.toFixed(3)}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-[#9C868E]" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-[#9C868E] text-right">
            Son güncelleme: {new Date(data.updatedAt).toLocaleTimeString('tr-TR')}
          </div>
        </>
      ) : null}
    </div>
  );
};
