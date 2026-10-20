const BASE = 'https://gift-satellite.dev/api';
const MARKETS = ['tg', 'portals', 'tonnel', 'mrkt', 'getgems'];
import { fetchReadWithRetry } from './read-retry.js';

export async function readCrossMarket(collection, key, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), backdrop = 'Black', model = '') {
  if (typeof collection !== 'string' || !/^[\p{L}\p{N} .'-]{2,80}$/u.test(collection) || !key) throw new Error('INVALID_CROSS_REQUEST');
  if (typeof backdrop !== 'string' || !/^[\p{L}\p{N} .'-]{2,80}$/u.test(backdrop)) throw new Error('INVALID_BACKDROP');
  if (model && (typeof model !== 'string' || !/^[\p{L}\p{N} .!'-]{2,80}$/u.test(model))) throw new Error('INVALID_MODEL');
  const rows = [];
  for (const market of MARKETS) {
    const url = new URL(`${BASE}/search/${market}/${encodeURIComponent(collection)}`);
    url.searchParams.set('backdrops', backdrop);
    if (model) url.searchParams.set('models', model);
    const response = await fetchReadWithRetry(url, { method: 'GET', headers: { Authorization: `Token ${key}`, Accept: 'application/json' }, redirect: 'error' }, fetcher, pause);
    if (!response.ok) return { ok: false, market, status: response.status, rows, writesPerformed: 0 };
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('INVALID_CROSS_RESPONSE');
    const listings = data.filter(item => item?.backdropName === backdrop && (!model || item?.modelName === model) && (!item.currency || item.currency === 'ton') && Number.isFinite(Number(item.normalizedPrice)) && Number(item.normalizedPrice) > 0)
      .map(item => ({ model: item.modelName, price: Number(item.normalizedPrice) })).sort((a, b) => a.price - b.price);
    rows.push({ market, count: listings.length, floor: listings[0]?.price ?? null, fifth: listings[4]?.price ?? null, listings });
    await pause(market === 'tg' ? 1500 : 550);
  }
  return { ok: true, collection, backdrop, model, rows, writesPerformed: 0 };
}

export function crossMarketText(result, models = []) {
  if (!result?.ok) return `Цены по площадкам: ${result?.market ?? '?'} HTTP ${result?.status ?? '?'}. Слоты не менялись.`;
  const price = value => Number.isFinite(value) ? value.toFixed(2) : '—';
  const lines = result.rows.map(row => `${row.market}: ${price(row.floor)} / ${price(row.fifth)} TON (1-е / 5-е), листингов ${row.count}${row.count === 50 ? '+' : ''}`);
  for (const model of models.slice(0, 8)) {
    const byMarket = result.rows.map(row => ({ market: row.market, price: row.listings.find(item => item.model === model)?.price ?? null })).filter(row => row.price !== null);
    lines.push(`${model}: ${byMarket.length ? byMarket.map(row => `${row.market} ${price(row.price)}`).join(', ') : 'нет среди первых 50 листингов площадок'}`);
  }
  return [`Gift Satellite — ${result.collection} ${result.model ? `${result.model} / ` : ''}${result.backdrop || 'Black'} по площадкам`, ...lines, result.model ? 'Поиск отфильтрован по конкретной модели и фону. Слоты не менялись.' : 'Отсутствие модели среди первых 50 листингов не означает отсутствия предложения. Слоты не менялись.'].join('\n');
}
