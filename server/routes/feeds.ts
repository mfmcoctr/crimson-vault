import { Router } from 'express';
import { newId } from '../crypto.ts';
import {
  deleteTrackedProduct,
  getSettings,
  listTrackedProducts,
  saveTrackedProduct,
} from '../db.ts';
import { getActiveDek, requireUnlocked } from '../session.ts';
import type {
  CryptoAssetQuote,
  CurrencyCode,
  FuelStationQuote,
  LocalNewsItem,
  LocalNewsSnapshot,
  MarketsSnapshot,
  NewsCountryCode,
  StoreName,
  TrackedProduct,
  WeatherSnapshot,
} from '../../src/types.ts';

const router = Router();
router.use(requireUnlocked);

const TROY_OUNCE_GRAMS = 31.1034768;

const COIN_CATALOG: Record<string, { symbol: string; name: string; binancePair?: string }> = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin', binancePair: 'BTCUSDT' },
  ethereum: { symbol: 'ETH', name: 'Ethereum', binancePair: 'ETHUSDT' },
  solana: { symbol: 'SOL', name: 'Solana', binancePair: 'SOLUSDT' },
  binancecoin: { symbol: 'BNB', name: 'BNB', binancePair: 'BNBUSDT' },
  ripple: { symbol: 'XRP', name: 'XRP', binancePair: 'XRPUSDT' },
  cardano: { symbol: 'ADA', name: 'Cardano', binancePair: 'ADAUSDT' },
  'avalanche-2': { symbol: 'AVAX', name: 'Avalanche', binancePair: 'AVAXUSDT' },
  dogecoin: { symbol: 'DOGE', name: 'Dogecoin', binancePair: 'DOGEUSDT' },
  polkadot: { symbol: 'DOT', name: 'Polkadot', binancePair: 'DOTUSDT' },
  chainlink: { symbol: 'LINK', name: 'Chainlink', binancePair: 'LINKUSDT' },
  'the-open-network': { symbol: 'TON', name: 'Toncoin', binancePair: 'TONUSDT' },
  sui: { symbol: 'SUI', name: 'Sui', binancePair: 'SUIUSDT' },
  litecoin: { symbol: 'LTC', name: 'Litecoin', binancePair: 'LTCUSDT' },
  tron: { symbol: 'TRX', name: 'TRON', binancePair: 'TRXUSDT' },
  pepe: { symbol: 'PEPE', name: 'Pepe', binancePair: 'PEPEUSDT' },
};

const FUEL_LOCATIONS: Record<string, { label: string; lat: number; lon: number }> = {
  hallein: { label: 'Hallein (5400)', lat: 47.6833, lon: 13.1 },
  salzburg: { label: 'Salzburg (5020)', lat: 47.8095, lon: 13.055 },
  wien: { label: 'Wien (1010)', lat: 48.2082, lon: 16.3738 },
  graz: { label: 'Graz (8010)', lat: 47.0707, lon: 15.4395 },
  linz: { label: 'Linz (4020)', lat: 48.3069, lon: 14.2858 },
  innsbruck: { label: 'Innsbruck (6020)', lat: 47.2692, lon: 11.4041 },
};

const COUNTRY_NEWS_CONFIG: Record<
  NewsCountryCode,
  { hl: string; gl: string; ceid: string; lang: string; trustedRe: RegExp }
> = {
  AT: {
    hl: 'de-AT',
    gl: 'AT',
    ceid: 'AT:de',
    lang: 'de',
    trustedRe: /(orf|salzburger nachrichten|meinbezirk|salzburg24|krone|derstandard|kurier|die presse|kleine zeitung|tiroler)/i,
  },
  TR: {
    hl: 'tr',
    gl: 'TR',
    ceid: 'TR:tr',
    lang: 'tr',
    trustedRe: /(aa|anadolu|ntv|bbc|dw|t24|diken|hürriyet|milliyet|sözcü|habertürk|cnntürk|cumhuriyet|trthaber|ekonomim)/i,
  },
  DE: {
    hl: 'de',
    gl: 'DE',
    ceid: 'DE:de',
    lang: 'de',
    trustedRe: /(tagesschau|spiegel|zeit|sueddeutsche|faz|welt|ndr|wdr|br24|swr|rbb|mdr|focus)/i,
  },
  CH: {
    hl: 'de-CH',
    gl: 'CH',
    ceid: 'CH:de',
    lang: 'de',
    trustedRe: /(srf|nzz|tages-anzeiger|blick|20 minuten|watson|aargauer)/i,
  },
  GB: {
    hl: 'en-GB',
    gl: 'GB',
    ceid: 'GB:en',
    lang: 'en',
    trustedRe: /(bbc|guardian|reuters|sky news|telegraph|independent|ft|times)/i,
  },
  US: {
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en',
    lang: 'en',
    trustedRe: /(reuters|ap news|nytimes|washington post|cnn|npr|bloomberg|nbc|cbs|abc)/i,
  },
};

const AUSTRIA_ORF_FEEDS: { match: RegExp; url: string; source: string }[] = [
  { match: /(salzburg|hallein|tennengau|pinzgau|pongau|flachgau|lungau)/i, url: 'https://rss.orf.at/salzburg.xml', source: 'ORF Salzburg' },
  { match: /(wien|vienna)/i, url: 'https://rss.orf.at/wien.xml', source: 'ORF Wien' },
  { match: /(graz|steiermark)/i, url: 'https://rss.orf.at/steiermark.xml', source: 'ORF Steiermark' },
  { match: /(linz|wels|steyr|oberösterreich)/i, url: 'https://rss.orf.at/ooe.xml', source: 'ORF Oberösterreich' },
  { match: /(innsbruck|tirol|kufstein)/i, url: 'https://rss.orf.at/tirol.xml', source: 'ORF Tirol' },
  { match: /(klagenfurt|villach|kärnten)/i, url: 'https://rss.orf.at/kaernten.xml', source: 'ORF Kärnten' },
  { match: /(bregenz|dornbirn|vorarlberg)/i, url: 'https://rss.orf.at/vorarlberg.xml', source: 'ORF Vorarlberg' },
  { match: /(st\.?\s*pölten|niederösterreich)/i, url: 'https://rss.orf.at/noe.xml', source: 'ORF Niederösterreich' },
  { match: /(eisenstadt|burgenland)/i, url: 'https://rss.orf.at/burgenland.xml', source: 'ORF Burgenland' },
];

// Simple in-memory caches
const marketsCache = new Map<string, { at: number; data: MarketsSnapshot }>();
const newsCache = new Map<string, { at: number; data: LocalNewsSnapshot }>();
const weatherCache = new Map<string, { at: number; data: WeatherSnapshot }>();
const translationCache = new Map<string, string>();
const geocodeCache = new Map<string, { label: string; lat: number; lon: number }>();

async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const clean = text.trim();
  if (!clean || sourceLang === targetLang) return clean;
  const key = `${sourceLang}->${targetLang}:${clean}`;
  const cached = translationCache.get(key);
  if (cached) return cached;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(clean)}`;
    const data = await fetchJsonWithTimeout<[[string, string][]?]>(url, 4000);
    const translated = Array.isArray(data?.[0]) ? data[0].map((seg) => seg[0] || '').join('').trim() : '';
    if (translated) {
      if (translationCache.size > 500) translationCache.clear();
      translationCache.set(key, translated);
      return translated;
    }
  } catch {
    // fallback to original text
  }
  return clean;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'PersonVault/1.0 (+local-personal-vault)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchTextWithTimeout(url: string, timeoutMs = 8500): Promise<{ status: number; text: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'de-AT,de;q=0.9,en;q=0.8,tr;q=0.7',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, text: await res.text(), finalUrl: res.url };
}

async function fetchFxRates(): Promise<MarketsSnapshot['fx']> {
  const data = await fetchJsonWithTimeout<{
    date: string;
    rates: { USD: number; TRY: number; GBP: number };
  }>('https://api.frankfurter.app/latest?from=EUR&to=USD,TRY,GBP');

  const eurToUsd = data.rates.USD || 1.08;
  const eurToTry = data.rates.TRY || 39.5;
  const eurToGbp = data.rates.GBP || 0.85;
  return {
    eurToUsd,
    eurToTry,
    eurToGbp,
    usdToTry: eurToTry / eurToUsd,
    date: data.date,
  };
}

async function fetchCryptoQuotes(coinIds: string[], fx: MarketsSnapshot['fx']): Promise<CryptoAssetQuote[]> {
  const ids = coinIds.length > 0 ? coinIds : ['bitcoin', 'ethereum', 'solana'];
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=eur,usd,try&include_24hr_change=true`;
    const raw = await fetchJsonWithTimeout<
      Record<string, { eur?: number; usd?: number; try?: number; eur_24h_change?: number; usd_24h_change?: number }>
    >(url);

    const out: CryptoAssetQuote[] = [];
    for (const id of ids) {
      const q = raw[id];
      if (!q) continue;
      const meta = COIN_CATALOG[id] || { symbol: id.toUpperCase().slice(0, 6), name: id };
      out.push({
        id,
        symbol: meta.symbol,
        name: meta.name,
        eur: q.eur ?? (q.usd && fx ? q.usd / fx.eurToUsd : 0),
        usd: q.usd ?? 0,
        try: q.try ?? (q.usd && fx ? q.usd * fx.usdToTry : 0),
        change24h: q.eur_24h_change ?? q.usd_24h_change ?? 0,
      });
    }
    if (out.length > 0) return out;
  } catch {
    // fallback to Binance public ticker below
  }

  const out: CryptoAssetQuote[] = [];
  const eurRate = fx?.eurToUsd || 1.08;
  const tryRate = fx?.usdToTry || 36.5;
  await Promise.all(
    ids.map(async (id) => {
      const meta = COIN_CATALOG[id];
      if (!meta?.binancePair) return;
      try {
        const ticker = await fetchJsonWithTimeout<{ lastPrice: string; priceChangePercent: string }>(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${meta.binancePair}`,
          5000,
        );
        const usd = Number(ticker.lastPrice) || 0;
        out.push({
          id,
          symbol: meta.symbol,
          name: meta.name,
          usd,
          eur: usd / eurRate,
          try: usd * tryRate,
          change24h: Number(ticker.priceChangePercent) || 0,
        });
      } catch {
        // ignore single ticker error
      }
    }),
  );
  return out;
}

async function fetchMetals(fx: MarketsSnapshot['fx']): Promise<MarketsSnapshot['metals']> {
  const [xau, xag] = await Promise.all([
    fetchJsonWithTimeout<{ price: number }>('https://api.gold-api.com/price/XAU'),
    fetchJsonWithTimeout<{ price: number }>('https://api.gold-api.com/price/XAG').catch(() => ({ price: 0 })),
  ]);
  const eurToUsd = fx?.eurToUsd || 1.08;
  const usdToTry = fx?.usdToTry || 36.5;

  const goldOunceUsd = Number(xau.price) || 0;
  const goldOunceEur = goldOunceUsd / eurToUsd;
  const goldGramEur = goldOunceEur / TROY_OUNCE_GRAMS;
  const goldGramTry = (goldOunceUsd * usdToTry) / TROY_OUNCE_GRAMS;

  const silverOunceUsd = Number(xag.price) || 0;
  const silverGramEur = silverOunceUsd / eurToUsd / TROY_OUNCE_GRAMS;
  const silverGramTry = (silverOunceUsd * usdToTry) / TROY_OUNCE_GRAMS;

  return {
    goldOunceUsd,
    goldOunceEur,
    goldGramEur,
    goldGramTry,
    silverOunceUsd,
    silverGramEur,
    silverGramTry,
  };
}

interface EControlStationRaw {
  id: number;
  name: string;
  open?: boolean;
  distance?: number;
  location?: {
    address?: string;
    postalCode?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  prices?: { fuelType: string; amount: number }[];
}

async function fetchFuelForType(
  lat: number,
  lon: number,
  fuelType: 'SUP' | 'DIE',
): Promise<{ cheapest: number | null; average: number | null; stations: FuelStationQuote[] }> {
  const url = `https://api.e-control.at/sprit/1.0/search/gas-stations/by-address?latitude=${lat}&longitude=${lon}&fuelType=${fuelType}&includeClosed=false`;
  const raw = await fetchJsonWithTimeout<EControlStationRaw[]>(url, 8000);
  const stations: FuelStationQuote[] = [];
  for (const s of raw || []) {
    const p = s.prices?.find((pr) => pr.fuelType === fuelType && typeof pr.amount === 'number');
    if (!p) continue;
    stations.push({
      id: s.id,
      name: s.name || 'İstasyon',
      address: s.location?.address || '',
      postalCode: s.location?.postalCode || '',
      city: s.location?.city || '',
      distanceKm: Number((s.distance ?? 0).toFixed(1)),
      price: p.amount,
      open: Boolean(s.open),
      latitude: s.location?.latitude ?? lat,
      longitude: s.location?.longitude ?? lon,
    });
  }
  stations.sort((a, b) => a.price - b.price);
  const top5 = stations.slice(0, 5);
  const cheapest = top5[0]?.price ?? null;
  const average =
    stations.length > 0
      ? Number((stations.reduce((acc, s) => acc + s.price, 0) / stations.length).toFixed(3))
      : null;
  return { cheapest, average, stations: top5 };
}

async function resolveAustriaFuelLocation(rawCity: string): Promise<{ key: string; label: string; lat: number; lon: number }> {
  const key = (rawCity || 'hallein').trim().toLowerCase();
  if (FUEL_LOCATIONS[key]) {
    return { key, ...FUEL_LOCATIONS[key] };
  }
  const cached = geocodeCache.get(key);
  if (cached) return { key, ...cached };
  try {
    const geo = await fetchJsonWithTimeout<{ lat: string; lon: string; display_name: string }[]>(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=at&limit=1&q=${encodeURIComponent(rawCity.trim())}`,
      5000,
    );
    if (geo?.[0]) {
      const entry = {
        label: rawCity.trim(),
        lat: Number(geo[0].lat),
        lon: Number(geo[0].lon),
      };
      geocodeCache.set(key, entry);
      return { key, ...entry };
    }
  } catch {
    // fallback to Hallein
  }
  return { key: 'hallein', ...FUEL_LOCATIONS.hallein };
}

// --- 1. MARKETS + GOLD + FUEL (AUSTRIA E-CONTROL DYNAMIC CITY) ---
router.get('/markets', async (req, res) => {
  const settings = getSettings(getActiveDek());
  const cityRaw = typeof req.query.city === 'string' && req.query.city.trim() ? req.query.city.trim() : settings.fuelCity || 'hallein';
  const forceRefresh = req.query.refresh === '1';
  const watchlist = settings.cryptoWatchlist?.length ? settings.cryptoWatchlist : ['bitcoin', 'ethereum', 'solana'];
  const loc = await resolveAustriaFuelLocation(cityRaw);
  const cacheKey = `${loc.key}:${watchlist.join(',')}`;

  const cached = marketsCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < 2 * 60 * 1000) {
    res.json(cached.data);
    return;
  }

  const warnings: string[] = [];
  let fx: MarketsSnapshot['fx'] = null;
  try {
    fx = await fetchFxRates();
  } catch {
    warnings.push('Döviz kurları (ECB) geçici olarak alınamadı.');
  }

  const [cryptoRes, metalsRes, supRes, dieRes] = await Promise.allSettled([
    fetchCryptoQuotes(watchlist, fx),
    fetchMetals(fx),
    fetchFuelForType(loc.lat, loc.lon, 'SUP'),
    fetchFuelForType(loc.lat, loc.lon, 'DIE'),
  ]);

  const crypto = cryptoRes.status === 'fulfilled' ? cryptoRes.value : [];
  if (cryptoRes.status === 'rejected' || crypto.length === 0) {
    warnings.push('Kripto verileri geçici olarak alınamadı.');
  }

  const metals = metalsRes.status === 'fulfilled' ? metalsRes.value : null;
  if (metalsRes.status === 'rejected') {
    warnings.push('Altın / gümüş fiyatları geçici olarak alınamadı.');
  }

  const super95 =
    supRes.status === 'fulfilled' ? supRes.value : { cheapest: null, average: null, stations: [] };
  const diesel =
    dieRes.status === 'fulfilled' ? dieRes.value : { cheapest: null, average: null, stations: [] };
  if (supRes.status === 'rejected' || dieRes.status === 'rejected') {
    warnings.push('E-Control Avusturya yakıt verileri kısmen alınamadı.');
  }

  const snapshot: MarketsSnapshot = {
    updatedAt: new Date().toISOString(),
    crypto,
    metals,
    fx,
    fuel: {
      city: loc.key,
      cityLabel: loc.label,
      super95,
      diesel,
    },
    warnings,
  };

  marketsCache.set(cacheKey, { at: Date.now(), data: snapshot });
  res.json(snapshot);
});

// --- 1B. LIVE WEATHER (OPEN-METEO FOR ANY CITY) ---
async function resolveWeatherCoords(rawCity: string): Promise<{ key: string; label: string; lat: number; lon: number }> {
  const key = (rawCity || 'hallein').trim().toLowerCase();
  if (FUEL_LOCATIONS[key]) {
    return { key, label: FUEL_LOCATIONS[key].label.split(' ')[0], lat: FUEL_LOCATIONS[key].lat, lon: FUEL_LOCATIONS[key].lon };
  }
  const wKey = `w:${key}`;
  const cached = geocodeCache.get(wKey);
  if (cached) return { key, ...cached };
  try {
    const geo = await fetchJsonWithTimeout<{ lat: string; lon: string }[]>(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(rawCity.trim())}`,
      5000,
    );
    if (geo?.[0]) {
      const entry = { label: rawCity.trim(), lat: Number(geo[0].lat), lon: Number(geo[0].lon) };
      geocodeCache.set(wKey, entry);
      return { key, ...entry };
    }
  } catch {
    // fallback to Hallein
  }
  return { key: 'hallein', label: 'Hallein', lat: 47.6833, lon: 13.1 };
}

router.get('/weather', async (req, res) => {
  const settings = getSettings(getActiveDek());
  const cityRaw =
    typeof req.query.city === 'string' && req.query.city.trim()
      ? req.query.city.trim()
      : settings.newsRegionPrimary || settings.fuelCity || 'Hallein';
  const forceRefresh = req.query.refresh === '1';

  const loc = await resolveWeatherCoords(cityRaw);
  const cached = weatherCache.get(loc.key);
  if (!forceRefresh && cached && Date.now() - cached.at < 15 * 60 * 1000) {
    res.json(cached.data);
    return;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`;
    const raw = await fetchJsonWithTimeout<{
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
        weather_code?: number;
        is_day?: number;
      };
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    }>(url, 7000);

    const daily: WeatherSnapshot['daily'] = (raw.daily?.time || []).map((d, i) => ({
      date: d,
      weatherCode: raw.daily?.weather_code?.[i] ?? 0,
      tempMax: Math.round(raw.daily?.temperature_2m_max?.[i] ?? 0),
      tempMin: Math.round(raw.daily?.temperature_2m_min?.[i] ?? 0),
      precipProb: Math.round(raw.daily?.precipitation_probability_max?.[i] ?? 0),
    }));

    const snapshot: WeatherSnapshot = {
      updatedAt: new Date().toISOString(),
      cityLabel: loc.label,
      temperature: Number((raw.current?.temperature_2m ?? 0).toFixed(1)),
      apparentTemperature: Number((raw.current?.apparent_temperature ?? 0).toFixed(1)),
      humidity: Math.round(raw.current?.relative_humidity_2m ?? 0),
      windSpeed: Math.round(raw.current?.wind_speed_10m ?? 0),
      weatherCode: raw.current?.weather_code ?? 0,
      isDay: raw.current?.is_day !== 0,
      daily,
    };
    weatherCache.set(loc.key, { at: Date.now(), data: snapshot });
    res.json(snapshot);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Hava durumu alınamadı.' });
  }
});

// --- 2. DYNAMIC REGIONAL TOP 10 NEWS (LAST 24H) ---
function decodeXmlEntities(str: string): string {
  // 1) Unwrap CDATA and decode HTML entities FIRST so escaped tags like &lt;a href=...&gt; are decoded before tag stripping
  const decoded = str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));

  // 2) Strip ALL HTML tags (including decoded anchor/font tags from Google News RSS descriptions)
  return decoded
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

export function parseRssItems(xml: string, fallbackSource: string): {
  title: string;
  link: string;
  source: string;
  pubDateMs: number;
  summary: string;
  imageUrl?: string;
}[] {
  const items: { title: string; link: string; source: string; pubDateMs: number; summary: string; imageUrl?: string }[] = [];
  const matches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of matches) {
    let title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    let source = extractTag(block, 'source') || fallbackSource;
    const pubDateStr = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    const description = extractTag(block, 'description');

    const imgMatch =
      block.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i) ||
      block.match(/<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["']/i);
    const imageUrl = imgMatch?.[1] ? decodeXmlEntities(imgMatch[1]) : undefined;

    // Google News appends " - Source Name" to title; separate cleanly
    const dashIdx = title.lastIndexOf(' - ');
    if (fallbackSource === 'Google News' && dashIdx > 15) {
      if (!source || source === 'Google News') {
        source = title.slice(dashIdx + 3).trim();
      }
      title = title.slice(0, dashIdx).trim();
    }

    const pubDateMs = pubDateStr ? Date.parse(pubDateStr) : Date.now();
    if (!title || !link || Number.isNaN(pubDateMs)) continue;

    // Strip redundant summary (Google News description is usually just title + source repeated)
    const cleanTitleStart = title.toLowerCase().slice(0, 28);
    const descLower = description.toLowerCase();
    const isRedundant =
      !description ||
      descLower.startsWith(cleanTitleStart) ||
      description.length < 25 ||
      /^https?:\/\//i.test(description);
    const cleanSummary = isRedundant ? '' : description.slice(0, 220);

    items.push({ title, link, source, pubDateMs, summary: cleanSummary, imageUrl });
  }
  return items;
}

export function parseSalzburg24Articles(html: string): {
  title: string;
  link: string;
  source: string;
  pubDateMs: number;
  summary: string;
  imageUrl?: string;
}[] {
  const items: { title: string; link: string; source: string; pubDateMs: number; summary: string; imageUrl?: string }[] = [];
  const articles = html.match(/<article\b[\s\S]*?<\/article>/gi) || [];
  const now = Date.now();

  for (const art of articles) {
    const headMatch = art.match(/<h[23][^>]*class=["'][^"']*headline[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!headMatch) continue;
    const rawHref = headMatch[1].trim();
    const title = decodeXmlEntities(headMatch[2]);
    if (!title || !rawHref) continue;

    const link = rawHref.startsWith('http')
      ? rawHref
      : `https://www.salzburg24.at${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;

    const imgMatch =
      art.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i) ||
      art.match(/<img[^>]+data-src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
    let imageUrl = imgMatch?.[1] ? decodeXmlEntities(imgMatch[1]) : undefined;
    if (imageUrl && imageUrl.startsWith('/')) {
      imageUrl = `https://www.salzburg24.at${imageUrl}`;
    }

    const dachMatch = art.match(/<div[^>]*class=["'][^"']*dachzeile[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const summary = dachMatch ? decodeXmlEntities(dachMatch[1]) : '';

    const timeMatch = art.match(/<div[^>]*class=["'][^"']*badge[^"']*time[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const timeText = timeMatch ? decodeXmlEntities(timeMatch[1]) : '';
    let pubDateMs = now;
    const dmy = timeText.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    const hm = timeText.match(/^(\d{1,2}):(\d{2})$/);
    const vorStd = timeText.match(/vor\s+(\d+)\s*Std/i);
    const vorMin = timeText.match(/vor\s+(\d+)\s*Min/i);
    if (dmy) {
      const parsed = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 12, 0, 0).getTime();
      if (!Number.isNaN(parsed)) pubDateMs = parsed;
    } else if (hm) {
      const d = new Date();
      d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
      if (d.getTime() > now) d.setDate(d.getDate() - 1);
      pubDateMs = d.getTime();
    } else if (vorStd) {
      pubDateMs = now - Number(vorStd[1]) * 3600 * 1000;
    } else if (vorMin) {
      pubDateMs = now - Number(vorMin[1]) * 60 * 1000;
    }

    items.push({
      title,
      link,
      source: 'Salzburg24',
      pubDateMs,
      summary,
      imageUrl,
    });
  }
  return items;
}

router.get('/news', async (req, res) => {
  const settings = getSettings(getActiveDek());
  const forceRefresh = req.query.refresh === '1';

  const rawCountry = String(req.query.country || settings.newsCountry || 'AT').toUpperCase();
  const country: NewsCountryCode = (
    ['AT', 'TR', 'DE', 'CH', 'GB', 'US'].includes(rawCountry) ? rawCountry : 'AT'
  ) as NewsCountryCode;
  const regionPrimary = String(
    req.query.primary !== undefined ? req.query.primary : settings.newsRegionPrimary ?? 'Hallein',
  ).trim();
  const regionSecondary = String(
    req.query.secondary !== undefined ? req.query.secondary : settings.newsRegionSecondary ?? 'Salzburg',
  ).trim();

  const effectivePrimary = regionPrimary || regionSecondary || (country === 'TR' ? 'İstanbul' : country === 'AT' ? 'Wien' : 'Berlin');
  const effectiveSecondary = regionPrimary && regionSecondary && regionPrimary.toLowerCase() !== regionSecondary.toLowerCase()
    ? regionSecondary
    : '';
  const rawLang = String(req.query.lang || '').toLowerCase();
  const targetLang = ['tr', 'en', 'de'].includes(rawLang) ? rawLang : '';

  const cacheKey = `${country}|${effectivePrimary.toLowerCase()}|${effectiveSecondary.toLowerCase()}|${targetLang}`;
  const cached = newsCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < 10 * 60 * 1000) {
    res.json(cached.data);
    return;
  }

  const cfg = COUNTRY_NEWS_CONFIG[country];
  const gnewsUrl = (query: string) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=${cfg.hl}&gl=${cfg.gl}&ceid=${cfg.ceid}`;

  const feeds: {
    name: string;
    url: string;
    weight: number;
    tagRegion: string;
    isPrimaryFeed: boolean;
    kind: 'rss' | 'salzburg24';
  }[] = [
    {
      name: 'Google News',
      url: gnewsUrl(effectivePrimary),
      weight: 3.4,
      tagRegion: effectivePrimary,
      isPrimaryFeed: true,
      kind: 'rss',
    },
  ];

  if (effectiveSecondary) {
    feeds.push({
      name: 'Google News',
      url: gnewsUrl(effectiveSecondary),
      weight: 2.3,
      tagRegion: effectiveSecondary,
      isPrimaryFeed: false,
      kind: 'rss',
    });
  }

  // Enrich with official Austrian ORF federal state RSS feed + Salzburg24.at (with teaser images) when user picks an Austrian region
  if (country === 'AT') {
    const combined = `${effectivePrimary} ${effectiveSecondary}`;
    const orf = AUSTRIA_ORF_FEEDS.find((o) => o.match.test(combined));
    if (orf) {
      feeds.push({
        name: orf.source,
        url: orf.url,
        weight: 2.8,
        tagRegion: effectiveSecondary || effectivePrimary,
        isPrimaryFeed: !effectiveSecondary,
        kind: 'rss',
      });
    }
    if (/(hallein|tennengau)/i.test(combined)) {
      feeds.push({
        name: 'Salzburg24',
        url: 'https://www.salzburg24.at/news/salzburg/tennengau',
        weight: 3.5,
        tagRegion: effectivePrimary,
        isPrimaryFeed: true,
        kind: 'salzburg24',
      });
    }
    if (/salzburg/i.test(combined)) {
      feeds.push({
        name: 'Salzburg24',
        url: 'https://www.salzburg24.at/news/salzburg',
        weight: 2.9,
        tagRegion: effectiveSecondary || effectivePrimary,
        isPrimaryFeed: !effectiveSecondary,
        kind: 'salzburg24',
      });
    }
  }

  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const { text } = await fetchTextWithTimeout(f.url, 8000);
      const parsed =
        f.kind === 'salzburg24' ? parseSalzburg24Articles(text).slice(0, 15) : parseRssItems(text, f.name);
      return { meta: f, items: parsed };
    }),
  );

  const now = Date.now();
  const seen = new Set<string>();
  const primaryRe = new RegExp(effectivePrimary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const scored: (LocalNewsItem & { score: number })[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value.items) {
      const ageHours = Math.max(0, (now - item.pubDateMs) / (1000 * 60 * 60));
      if (ageHours > 72) continue;
      const normKey = item.title
        .toLowerCase()
        .replace(/[^a-z0-9äöüßçğıöşü]+/g, '')
        .slice(0, 48);
      if (!normKey || seen.has(normKey)) continue;
      seen.add(normKey);

      const mentionsPrimary = primaryRe.test(`${item.title} ${item.summary}`);
      const isPrimaryRegion = mentionsPrimary || r.value.meta.isPrimaryFeed;
      const isTrusted = cfg.trustedRe.test(item.source);

      let score = r.value.meta.weight * 10;
      if (ageHours <= 24) score += 25;
      else if (ageHours <= 48) score += 10;
      if (mentionsPrimary) score += 18;
      else if (isPrimaryRegion) score += 8;
      if (isTrusted) score += 7;
      score += Math.max(0, 24 - ageHours);

      scored.push({
        id: normKey,
        title: item.title,
        link: item.link,
        source: item.source,
        publishedAt: new Date(item.pubDateMs).toISOString(),
        ageHours: Number(ageHours.toFixed(1)),
        region: isPrimaryRegion ? effectivePrimary : effectiveSecondary || effectivePrimary,
        isPrimaryRegion,
        summary: item.summary,
        imageUrl: item.imageUrl,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Balanced Top 10: if both primary and secondary regions exist, reserve up to 4 slots for primary region stories so local town news isn't drowned out!
  let selected: (LocalNewsItem & { score: number })[] = [];
  if (effectiveSecondary) {
    const primaryPool = scored.filter((x) => x.isPrimaryRegion);
    const secondaryPool = scored.filter((x) => !x.isPrimaryRegion);
    const takePrimary = primaryPool.slice(0, 5);
    const usedIds = new Set(takePrimary.map((x) => x.id));
    const remaining = [...secondaryPool, ...primaryPool.slice(5)].filter((x) => !usedIds.has(x.id));
    selected = [...takePrimary, ...remaining].slice(0, 10).sort((a, b) => b.score - a.score);
  } else {
    selected = scored.slice(0, 10);
  }

  const last24hCount = scored.filter((x) => x.ageHours <= 24).length;
  let finalItems = selected.map(({ score: _s, ...item }) => item);

  // Auto-translate headlines & summaries when UI language differs from feed language
  if (targetLang && targetLang !== cfg.lang && finalItems.length > 0) {
    finalItems = await Promise.all(
      finalItems.map(async (item) => {
        const [trTitle, trSummary] = await Promise.all([
          translateText(item.title, cfg.lang, targetLang),
          item.summary ? translateText(item.summary, cfg.lang, targetLang) : Promise.resolve(''),
        ]);
        return {
          ...item,
          title: trTitle,
          summary: trSummary,
        };
      }),
    );
  }

  const snapshot: LocalNewsSnapshot = {
    updatedAt: new Date().toISOString(),
    country,
    language: cfg.lang,
    regionPrimary: effectivePrimary,
    regionSecondary: effectiveSecondary,
    items: finalItems,
    last24hCount,
  };
  newsCache.set(cacheKey, { at: Date.now(), data: snapshot });
  res.json(snapshot);
});

// --- 3. WISHLIST & DEAL TRACKER (AMAZON, TEMU, ALIEXPRESS, GEIZHALS...) ---
export function detectStoreFromUrl(rawUrl: string): StoreName {
  const s = rawUrl.toLowerCase();
  if (s.includes('amazon.') || s.includes('amzn.')) return 'Amazon';
  if (s.includes('temu.')) return 'Temu';
  if (s.includes('aliexpress.')) return 'AliExpress';
  if (s.includes('mediamarkt.')) return 'MediaMarkt';
  if (s.includes('geizhals.')) return 'Geizhals';
  return 'Diğer';
}

function parseLocalePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;
  // European format e.g. 1.299,90 or 49,99
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(cleaned) || /^\d+,\d{1,2}$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  // Standard dot decimal e.g. 1,299.90 or 49.99
  const val = Number(cleaned.replace(/,/g, ''));
  return Number.isFinite(val) && val > 0 ? val : null;
}

function detectCurrency(raw: string, url: string): CurrencyCode {
  if (/€|EUR/i.test(raw)) return 'EUR';
  if (/₺|TRY|TL/i.test(raw)) return 'TRY';
  if (/£|GBP/i.test(raw)) return 'GBP';
  if (/\$|USD/i.test(raw)) return 'USD';
  if (/\.de|\.at|geizhals\.at|mediamarkt\.at/i.test(url)) return 'EUR';
  if (/\.com\.tr/i.test(url)) return 'TRY';
  return 'EUR';
}

export function extractPublicProductMetadata(html: string, url: string): {
  title: string;
  imageUrl: string;
  price: number | null;
  currency: CurrencyCode;
  blocked: boolean;
} {
  const lower = html.toLowerCase();
  const isBlocked =
    lower.includes('captcha') ||
    lower.includes('robot check') ||
    lower.includes('enter the characters you see below') ||
    lower.includes('verify you are human') ||
    lower.includes('access denied') ||
    lower.includes('just a moment...');

  if (isBlocked) {
    return { title: '', imageUrl: '', price: null, currency: detectCurrency('', url), blocked: true };
  }

  const getMeta = (prop: string): string => {
    const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
    const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
    const m = html.match(r1) || html.match(r2);
    return m ? decodeXmlEntities(m[1]) : '';
  };

  let title = getMeta('og:title') || getMeta('twitter:title') || extractTag(html, 'title');
  title = title.replace(/\s*:\s*Amazon\.[a-z.]+.*$/i, '').trim();
  const imageUrl = getMeta('og:image') || getMeta('twitter:image');

  let price: number | null = null;
  let currencyRaw = getMeta('product:price:currency') || getMeta('og:price:currency');

  // 1) OpenGraph price meta
  const ogPrice = getMeta('product:price:amount') || getMeta('og:price:amount');
  if (ogPrice) price = parseLocalePrice(ogPrice);

  // 2) JSON-LD Product/Offer structured data
  if (!price) {
    const ldScripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const s of ldScripts) {
      const inner = s.replace(/^<script[^>]*>|<\/script>$/gi, '').trim();
      try {
        const parsed = JSON.parse(inner);
        const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed['@graph']) ? parsed['@graph'] : [])];
        for (const node of nodes) {
          const offers = node?.offers;
          const offerObj = Array.isArray(offers) ? offers[0] : offers;
          if (offerObj && (offerObj.price || offerObj.lowPrice)) {
            const p = parseLocalePrice(String(offerObj.price || offerObj.lowPrice));
            if (p) {
              price = p;
              if (offerObj.priceCurrency) currencyRaw = String(offerObj.priceCurrency);
              if (!title && node.name) title = String(node.name);
              break;
            }
          }
        }
      } catch {
        // ignore invalid JSON-LD
      }
      if (price) break;
    }
  }

  // 3) Common Amazon public price spans (when served cleanly without challenge)
  if (!price && url.toLowerCase().includes('amazon.')) {
    const whole = html.match(/class=["']a-price-whole["'][^>]*>(\d[\d.,]*)/i);
    const frac = html.match(/class=["']a-price-fraction["'][^>]*>(\d{2})/i);
    if (whole) {
      const combined = frac ? `${whole[1].replace(/[.,]$/, '')}.${frac[1]}` : whole[1];
      price = parseLocalePrice(combined);
    } else {
      const offscreen = html.match(/class=["']a-offscreen["'][^>]*>([^<]{2,20})</i);
      if (offscreen) {
        price = parseLocalePrice(offscreen[1]);
        currencyRaw = offscreen[1];
      }
    }
  }

  return {
    title,
    imageUrl,
    price,
    currency: detectCurrency(currencyRaw, url),
    blocked: false,
  };
}

router.get('/deals', (_req, res) => {
  res.json(listTrackedProducts(getActiveDek()));
});

router.post('/deals/inspect', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url?.trim()) {
    res.status(400).json({ error: 'Lütfen geçerli bir ürün linki girin.' });
    return;
  }
  const normalizedUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const store = detectStoreFromUrl(normalizedUrl);
  try {
    const { status, text } = await fetchTextWithTimeout(normalizedUrl, 8500);
    if (status >= 400) {
      res.json({
        store,
        title: '',
        imageUrl: '',
        price: null,
        currency: 'EUR' as CurrencyCode,
        blocked: true,
        message: `${store} otomatik okumaya izin vermedi (HTTP ${status}). Ürün adı ve fiyatını elle girip hedef alarmı kurabilirsiniz.`,
      });
      return;
    }
    const meta = extractPublicProductMetadata(text, normalizedUrl);
    res.json({
      store,
      ...meta,
      message: meta.blocked
        ? `${store} bot koruması nedeniyle otomatik fiyat vermedi — ürün adını ve güncel fiyatı elle girebilirsiniz.`
        : meta.price
          ? 'Ürün bilgileri ve güncel fiyat başarıyla alındı.'
          : 'Ürün sayfası okundu ancak fiyat JS ile yüklendiği için otomatik tespit edilemedi; fiyatı elle girebilirsiniz.',
    });
  } catch {
    res.json({
      store,
      title: '',
      imageUrl: '',
      price: null,
      currency: 'EUR' as CurrencyCode,
      blocked: true,
      message: `${store} bağlantısı zaman aşımına uğradı veya engellendi; bilgileri manuel girebilirsiniz.`,
    });
  }
});

router.post('/deals', (req, res) => {
  const dek = getActiveDek();
  const body = req.body as Partial<TrackedProduct>;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Ürün adı zorunludur.' });
    return;
  }
  const now = new Date().toISOString();
  const currentPrice = Number(body.currentPrice) || 0;
  const originalPrice = Number(body.originalPrice) || currentPrice;
  const targetPrice = Number(body.targetPrice) || (currentPrice > 0 ? Number((currentPrice * 0.85).toFixed(2)) : 0);

  const entry: TrackedProduct = {
    id: newId(),
    name: body.name.trim(),
    store: body.store || detectStoreFromUrl(body.url || ''),
    url: body.url || '',
    imageUrl: body.imageUrl || '',
    currency: body.currency || 'EUR',
    currentPrice,
    originalPrice,
    targetPrice,
    priceHistory: currentPrice > 0 ? [{ date: now, price: currentPrice }] : [],
    lastCheckedAt: now,
    lastCheckStatus: body.lastCheckStatus || 'manual',
    lastCheckMessage: body.lastCheckMessage || 'Takibe eklendi',
    notes: body.notes || '',
    createdAt: now,
    updatedAt: now,
  };
  res.status(201).json(saveTrackedProduct(entry, dek));
});

router.put('/deals/:id', (req, res) => {
  const dek = getActiveDek();
  const existing = listTrackedProducts(dek).find((p) => p.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Ürün bulunamadı.' });
    return;
  }
  const body = req.body as Partial<TrackedProduct>;
  const now = new Date().toISOString();
  const nextPrice = body.currentPrice !== undefined ? Number(body.currentPrice) : existing.currentPrice;
  const history = [...(existing.priceHistory || [])];
  if (nextPrice > 0 && nextPrice !== existing.currentPrice) {
    history.push({ date: now, price: nextPrice });
  }

  const updated: TrackedProduct = {
    ...existing,
    ...body,
    id: existing.id,
    currentPrice: nextPrice,
    originalPrice: body.originalPrice !== undefined ? Number(body.originalPrice) : Math.max(existing.originalPrice, nextPrice),
    targetPrice: body.targetPrice !== undefined ? Number(body.targetPrice) : existing.targetPrice,
    priceHistory: history.slice(-60),
    lastCheckedAt: body.currentPrice !== undefined ? now : existing.lastCheckedAt,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  res.json(saveTrackedProduct(updated, dek));
});

router.post('/deals/:id/check', async (req, res) => {
  const dek = getActiveDek();
  const existing = listTrackedProducts(dek).find((p) => p.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Ürün bulunamadı.' });
    return;
  }
  if (!existing.url) {
    res.status(400).json({ error: 'Bu ürün için link eklenmemiş.' });
    return;
  }
  const now = new Date().toISOString();
  try {
    const normalizedUrl = /^https?:\/\//i.test(existing.url) ? existing.url : `https://${existing.url}`;
    const { status, text } = await fetchTextWithTimeout(normalizedUrl, 8500);
    if (status >= 400) {
      const updated = saveTrackedProduct(
        {
          ...existing,
          lastCheckedAt: now,
          lastCheckStatus: 'blocked',
          lastCheckMessage: `${existing.store} otomatik okumayı engelledi (HTTP ${status}) — Hızlı Güncelle ile güncel fiyatı girebilirsiniz.`,
          updatedAt: now,
        },
        dek,
      );
      res.json(updated);
      return;
    }

    const meta = extractPublicProductMetadata(text, normalizedUrl);
    if (meta.blocked || !meta.price) {
      const updated = saveTrackedProduct(
        {
          ...existing,
          lastCheckedAt: now,
          lastCheckStatus: 'blocked',
          lastCheckMessage: `${existing.store} bot koruması/dinamik fiyat nedeniyle otomatik fiyat vermedi — ürünü açıp güncel fiyatı hızlıca girebilirsiniz.`,
          updatedAt: now,
        },
        dek,
      );
      res.json(updated);
      return;
    }

    const history = [...(existing.priceHistory || [])];
    if (history.length === 0 || history[history.length - 1].price !== meta.price) {
      history.push({ date: now, price: meta.price });
    }
    const updated = saveTrackedProduct(
      {
        ...existing,
        currentPrice: meta.price,
        originalPrice: Math.max(existing.originalPrice || meta.price, meta.price),
        imageUrl: existing.imageUrl || meta.imageUrl,
        priceHistory: history.slice(-60),
        lastCheckedAt: now,
        lastCheckStatus: 'ok',
        lastCheckMessage: `Otomatik güncellendi: ${meta.price} ${existing.currency}`,
        updatedAt: now,
      },
      dek,
    );
    res.json(updated);
  } catch {
    const updated = saveTrackedProduct(
      {
        ...existing,
        lastCheckedAt: now,
        lastCheckStatus: 'blocked',
        lastCheckMessage: 'Bağlantı zaman aşımına uğradı; manuel güncelleyebilirsiniz.',
        updatedAt: now,
      },
      dek,
    );
    res.json(updated);
  }
});

router.delete('/deals/:id', (req, res) => {
  res.json({ ok: deleteTrackedProduct(req.params.id) });
});

export default router;
