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
    let response;
    try {
      response = await fetchReadWithRetry(url, { method: 'GET', headers: { Authorization: `Token ${key}`, Accept: 'application/json' }, redirect: 'error' }, fetcher, pause);
    } catch {
      rows.push({market,error:'NETWORK_OR_TIMEOUT'}); continue;
    }
    if (!response.ok) { rows.push({market,error:'HTTP_'+response.status}); continue; }
    let data;
    try { data = await response.json(); } catch {
      rows.push({market,error:'INVALID_JSON'}); continue;
    }
    if (!Array.isArray(data)) { rows.push({market,error:'INVALID_RESPONSE_SHAPE'}); continue; }
    const listings = data.filter(item => item?.backdropName === backdrop && (!model || item?.modelName === model) && (!item.currency || item.currency === 'ton') && Number.isFinite(Number(item.normalizedPrice)) && Number(item.normalizedPrice) > 0)
      .map(item => ({ model: item.modelName, price: Number(item.normalizedPrice) })).sort((a, b) => a.price - b.price);
    rows.push({ market, count: listings.length, floor: listings[0]?.price ?? null, fifth: listings[4]?.price ?? null, listings });
    await pause(market === 'tg' ? 1500 : 550);
  }
  return { ok: rows.every(row=>!row.error), collection, backdrop, model, rows, writesPerformed: 0 };
}

export function crossMarketText(result, models = []) {
  if (!result?.ok && result?.rows?.length===5) return ["Проверка цен неполная — автопокупка не менялась.",...result.rows.map(row=>row.error ? `${row.market}: ${row.error}` : `${row.market}: ${row.floor ?? "нет предложений"} TON, листингов ${row.count}`)].join("\n");
  if (!result?.ok) return `Цены по площадкам: ${result?.market ?? '?'} ${result?.reason || `HTTP ${result?.status ?? '?'}`}. Проверено площадок: ${result?.rows?.length || 0}/5. Слоты не менялись.`;
  const price = value => Number.isFinite(value) ? value.toFixed(2) : '—';
  const lines = result.rows.map(row => `${row.market}: ${price(row.floor)} / ${price(row.fifth)} TON (1-е / 5-е), листингов ${row.count}${row.count === 50 ? '+' : ''}`);
  for (const model of models.slice(0, 8)) {
    const byMarket = result.rows.map(row => ({ market: row.market, price: row.listings.find(item => item.model === model)?.price ?? null })).filter(row => row.price !== null);
    lines.push(`${model}: ${byMarket.length ? byMarket.map(row => `${row.market} ${price(row.price)}`).join(', ') : 'нет среди первых 50 листингов площадок'}`);
  }
  return [`Gift Satellite — ${result.collection} ${result.model ? `${result.model} / ` : ''}${result.backdrop || 'Black'} по площадкам`, ...lines, result.model ? 'Поиск отфильтрован по конкретной модели и фону. Слоты не менялись.' : 'Отсутствие модели среди первых 50 листингов не означает отсутствия предложения. Слоты не менялись.'].join('\n');
}
