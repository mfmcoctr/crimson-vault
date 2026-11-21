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
  StoreName,
  TrackedProduct,
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

const FUEL_LOCATIONS = {
  hallein: { label: 'Hallein (5400)', lat: 47.6833, lon: 13.1 },
  salzburg: { label: 'Salzburg (5020)', lat: 47.8095, lon: 13.055 },
} as const;

// Simple in-memory caches
const marketsCache = new Map<string, { at: number; data: MarketsSnapshot }>();
const newsCache = { at: 0, data: null as LocalNewsSnapshot | null };

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

// --- 1. MARKETS + GOLD + FUEL (HALLEIN / SALZBURG) ---
router.get('/markets', async (req, res) => {
  const settings = getSettings(getActiveDek());
  const cityParam = req.query.city === 'salzburg' ? 'salzburg' : req.query.city === 'hallein' ? 'hallein' : settings.fuelCity || 'hallein';
  const forceRefresh = req.query.refresh === '1';
  const watchlist = settings.cryptoWatchlist?.length ? settings.cryptoWatchlist : ['bitcoin', 'ethereum', 'solana'];
  const cacheKey = `${cityParam}:${watchlist.join(',')}`;

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

  const loc = FUEL_LOCATIONS[cityParam];

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
      city: cityParam,
      cityLabel: loc.label,
      super95,
      diesel,
    },
    warnings,
  };

  marketsCache.set(cacheKey, { at: Date.now(), data: snapshot });
  res.json(snapshot);
});

// --- 2. HALLEIN & SALZBURG TOP 10 NEWS (LAST 24H) ---
function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
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
}[] {
  const items: { title: string; link: string; source: string; pubDateMs: number; summary: string }[] = [];
  const matches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of matches) {
    let title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    let source = extractTag(block, 'source') || fallbackSource;
    const pubDateStr = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    const description = extractTag(block, 'description');

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

    // Avoid redundant summary identical to title
    const cleanSummary = description && !description.startsWith(title.slice(0, 25)) ? description.slice(0, 220) : '';
    items.push({ title, link, source, pubDateMs, summary: cleanSummary });
  }
  return items;
}

router.get('/news', async (req, res) => {
  const forceRefresh = req.query.refresh === '1';
  if (!forceRefresh && newsCache.data && Date.now() - newsCache.at < 10 * 60 * 1000) {
    res.json(newsCache.data);
    return;
  }

  const feeds = [
    { name: 'ORF Salzburg', url: 'https://rss.orf.at/salzburg.xml', weight: 3 },
    {
      name: 'Google News',
      url: 'https://news.google.com/rss/search?q=Hallein+OR+Tennengau+when:1d&hl=de-AT&gl=AT&ceid=AT:de',
      weight: 3,
    },
    {
      name: 'Google News',
      url: 'https://news.google.com/rss/search?q=Salzburg+when:1d&hl=de-AT&gl=AT&ceid=AT:de',
      weight: 2,
    },
  ];

  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const { text } = await fetchTextWithTimeout(f.url, 8000);
      return { weight: f.weight, items: parseRssItems(text, f.name) };
    }),
  );

  const now = Date.now();
  const seen = new Set<string>();
  const scored: (LocalNewsItem & { score: number })[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value.items) {
      const ageHours = Math.max(0, (now - item.pubDateMs) / (1000 * 60 * 60));
      if (ageHours > 48) continue; // drop stale items
      const normKey = item.title
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, '')
        .slice(0, 48);
      if (!normKey || seen.has(normKey)) continue;
      seen.add(normKey);

      const isHallein = /(hallein|tennengau|kuchl|golling|puch|oberalm|adnet|bad dürrnberg|abtenau)/i.test(
        `${item.title} ${item.summary}`,
      );
      const isTrusted = /(orf|salzburger nachrichten|meinbezirk|salzburg24|krone|derstandard|kurier)/i.test(
        item.source,
      );

      // Importance ranking: last 24h boosted + Hallein/ORF/SN boosted + fresher boosted
      let score = r.value.weight * 10;
      if (ageHours <= 24) score += 25;
      if (isHallein) score += 12;
      if (isTrusted) score += 8;
      score += Math.max(0, 24 - ageHours);

      scored.push({
        id: normKey,
        title: item.title,
        link: item.link,
        source: item.source,
        publishedAt: new Date(item.pubDateMs).toISOString(),
        ageHours: Number(ageHours.toFixed(1)),
        region: isHallein ? 'Hallein' : 'Salzburg',
        summary: item.summary,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const last24h = scored.filter((x) => x.ageHours <= 24);
  const picked = (last24h.length >= 10 ? last24h : scored)
    .slice(0, 10)
    .map(({ score: _s, ...item }) => item);

  const snapshot: LocalNewsSnapshot = {
    updatedAt: new Date().toISOString(),
    items: picked,
    last24hCount: last24h.length,
  };
  newsCache.at = Date.now();
  newsCache.data = snapshot;
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
