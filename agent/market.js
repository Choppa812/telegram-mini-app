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

export async function readFloorOverview(key, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const datasets = {};
  const statuses = {};
  for (const market of ['portals', 'mrkt']) {
    for (const type of ['base', 'black']) {
      const result = await readSatellite('/history/floors', {market, ...(type === 'black' ? {black:true} : {})}, key, 'token', fetcher);
      const name = `${market}_${type}`;
      statuses[name] = result.status;
      if (!result.ok || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return {ok:false,statuses};
      datasets[name] = result.data;
      await pause(1050);
    }
  }
  const names = new Set(Object.values(datasets).flatMap(data => Object.keys(data)));
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const min = (...values) => { const valid = values.map(positive).filter(value => value !== null); return valid.length ? Math.min(...valid) : null; };
  const rows = [...names].map(collection => ({collection,base:min(datasets.portals_base[collection],datasets.mrkt_base[collection]),black:min(datasets.portals_black[collection],datasets.mrkt_black[collection])}));
  const candidates = rows.filter(row => row.black !== null && row.black <= 50).sort((a,b)=>a.black-b.black).slice(0,30);
  return {ok:true,statuses,baseCount:rows.filter(row=>row.base!==null).length,blackCount:rows.filter(row=>row.black!==null).length,under50Black:rows.filter(row=>row.black!==null&&row.black<=50).length,candidates};
}

export function floorOverviewText(result) {
  if (!result?.ok) return `Минимальные цены недоступны: ${Object.entries(result?.statuses || {}).map(([market,status])=>`${market} HTTP ${status}`).join(', ')}. Слоты не менялись.`;
  const lines = result.candidates.map(row=>`${row.collection}: Black ${row.black.toFixed(2)}, общий ${row.base?.toFixed(2) ?? '—'} TON`);
  return [`Gift Satellite — минимальные цены Portals/MRKT`, `Коллекций: ${result.baseCount}; с Black: ${result.blackCount}; Black до 50 TON: ${result.under50Black}.`,...lines,'Это показания API, перед установкой лимита нужны проверка листингов и продаж. Слоты не менялись.'].join('\n');
}

export async function readHighBlackFloors(key, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const datasets = [];
  for (const market of ['portals', 'mrkt']) {
    const result = await readSatellite('/history/floors', { market, black: true }, key, 'token', fetcher);
    if (!result.ok || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return { ok: false, market, status: result.status };
    datasets.push(result.data);
    await pause(550);
  }
  const names = new Set(datasets.flatMap(data => Object.keys(data)));
  const rows = [...names].map(collection => {
    const prices = datasets.map(data => Number(data[collection])).filter(price => Number.isFinite(price) && price > 0);
    return { collection, floor: prices.length ? Math.min(...prices) : null };
  }).filter(row => row.floor !== null && row.floor >= 50).sort((a, b) => a.floor - b.floor);
  return { ok: true, rows };
}

export function highBlackFloorsText(result) {
  if (!result?.ok) return `Флоры Black от 50 TON недоступны: ${result?.market || '?'} HTTP ${result?.status ?? '?'}. Слоты не менялись.`;
  return [`Gift Satellite — Black от 50 TON, Portals/MRKT; коллекций ${result.rows.length}.`, ...result.rows.map(row => `${row.collection}: ${row.floor.toFixed(2)} TON`), 'Это флор коллекции, а не конкретной модели. Слоты не менялись.'].join('\n');
}
