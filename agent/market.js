import { readSatellite } from './satellite.js';

const MARKETS = ['portals', 'getgems', 'mrkt', 'tonnel', 'telegram'];

export function summarizeRecentOffers(offers, now = new Date()) {
  if (!Array.isArray(offers)) throw new Error('INVALID_MARKET_RESPONSE');
  const rows = offers.flatMap(item => {
    if (!item || typeof item.collectionName !== 'string') return [];
    const prices = MARKETS.flatMap(market => {
      const offer = item[market];
      const price = Number(offer?.price);
      const timestamp = Date.parse(offer?.timestamp || '');
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) return [];
      return [{ market, price, timestamp }];
    });
    if (!prices.length) return [];
    const lowestRecent = prices.reduce((a, b) => a.price <= b.price ? a : b);
    return [{ collection: item.collectionName, ...lowestRecent, ageHours: Math.max(0, Math.round((now.getTime() - lowestRecent.timestamp) / 3600000)) }];
  }).sort((a, b) => a.price - b.price);
  const prices = rows.map(row => row.price);
  const percentile = fraction => prices.length ? prices[Math.min(prices.length - 1, Math.floor((prices.length - 1) * fraction))] : null;
  return { observed: offers.length, priced: rows.length, under50: rows.filter(row => row.price <= 50).length, fresh24h: rows.filter(row => row.ageHours <= 24).length, p10: percentile(.1), median: percentile(.5), p90: percentile(.9), candidates: rows.filter(row => row.price <= 50 && row.ageHours <= 24).slice(0, 20) };
}

export async function readMarketOverview(key, fetcher = fetch, now = new Date()) {
  const response = await readSatellite('/history/collection-offers', {}, key, 'token', fetcher);
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, ...summarizeRecentOffers(response.data, now) };
}

export function marketOverviewText(result) {
  if (!result?.ok) return `Обзор рынка недоступен: HTTP ${result?.status ?? '?'}. Слоты не менялись.`;
  const f = price => Number.isFinite(price) ? price.toFixed(2) : '—';
  const lines = result.candidates.map(row => `${row.collection}: ${f(row.price)} TON, ${row.market}, ${row.ageHours} ч назад`);
  return [`Gift Satellite — обзор последних офферов`, `Коллекций с ценами: ${result.priced}/${result.observed}; до 50 TON: ${result.under50}; свежих за сутки: ${result.fresh24h}.`, `Децили P10/P50/P90: ${f(result.p10)} / ${f(result.median)} / ${f(result.p90)} TON.`, ...lines, `Это последние офферы, а не минимальные текущие цены. Лимиты и покупки не менялись.`].join('\n');
}
