const BASE = 'https://gift-satellite.dev/api';
import { fetchReadWithRetry } from './read-retry.js';
const validName = value => typeof value === 'string' && /^[\p{L}\p{N} .!'-]{2,80}$/u.test(value);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function history(collection, key, { model, backdrop, days, maxPages = 12, fetcher = fetch, pause = wait }) {
  if (!validName(collection) || (model && !validName(model)) || (backdrop && !validName(backdrop)) || !key) throw new Error('INVALID_VARIANT_REQUEST');
  const now = Date.now(), cutoff = now - days * 86400000;
  const sales = [];
  let complete = false;
  for (let page = 0; page < maxPages; page++) {
    if (page) await pause(600);
    const response = await fetchReadWithRetry(new URL(`${BASE}/history/${encodeURIComponent(collection)}`), {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, pageSize: 20, sortBy: 'date', ...(model ? { models: [model] } : {}), ...(backdrop ? { backdrops: [backdrop] } : {}) }),
      redirect: 'error',
    }, fetcher, pause);
    if (!response.ok) return { ok: false, status: response.status };
    const data = await response.json();
    if (!Array.isArray(data?.content)) throw new Error('INVALID_VARIANT_HISTORY');
    const times = data.content.map(row => Date.parse(row.soldAt || ''));
    if (times.some(time => !Number.isFinite(time))) throw new Error('INVALID_VARIANT_DATE');
    for (let i = 1; i < times.length; i++) if (times[i] > times[i - 1]) throw new Error('UNSORTED_VARIANT_HISTORY');
    for (let i = 0; i < data.content.length; i++) {
      const row = data.content[i];
      if (times[i] >= cutoff && times[i] <= now && Number(row.normalizedPrice) > 0 && (!model || row.modelName === model) && (!backdrop || row.backdropName === backdrop)) sales.push(row);
    }
    if (data.content.length < 20 || !times.length || times.at(-1) < cutoff) { complete = true; break; }
  }
  return { ok: true, sales, complete };
}

const stats = rows => {
  const prices = rows.map(row => Number(row.normalizedPrice)).sort((a, b) => a - b);
  const markets = {};
  for (const row of rows) markets[row.market || '?'] = (markets[row.market || '?'] || 0) + 1;
  return { count: prices.length, q1: prices.length ? prices[Math.floor((prices.length - 1) * 0.25)] : null, median: prices.length ? prices[Math.floor((prices.length - 1) / 2)] : null, markets };
};

export async function readVariantLeads(collection, key, options = {}) {
  const result = await history(collection, key, { days: 1, maxPages: 12, ...options });
  if (!result.ok) return result;
  const groups = new Map();
  for (const row of result.sales) {
    if (!row.modelName || !row.backdropName || row.backdropName === 'Black') continue;
    const label = `${row.modelName} | ${row.backdropName}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  return { ok: true, collection, complete: result.complete, sampled: result.sales.length, leads: [...groups].map(([label, rows]) => ({ label, ...stats(rows) })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 12) };
}

export function variantLeadsText(result) {
  if (!result?.ok) return `Варианты недоступны: HTTP ${result?.status ?? '?'}. Слоты не менялись.`;
  return [`${result.collection}: сочетания модели и фона кроме Black за 24 ч${result.complete ? '' : ' (НЕПОЛНАЯ выборка последних продаж)'}, просмотрено ${result.sampled}.`, ...result.leads.map(row => `${row.label}: ${row.count}, Q1 ${row.q1.toFixed(2)} TON`), 'Это только кандидаты; для решения проверьте /variant. Слоты не менялись.'].join('\n');
}

export async function readVariant(collection, model, backdrop, key, options = {}) {
  if (!validName(model) || !validName(backdrop)) throw new Error('INVALID_VARIANT_REQUEST');
  const result = await history(collection, key, { model, backdrop, days: 7, maxPages: 12, ...options });
  if (!result.ok) return result;
  const dailyCutoff = Date.now() - 86400000;
  return { ok: true, collection, model, backdrop, complete: result.complete, day: stats(result.sales.filter(row => Date.parse(row.soldAt) >= dailyCutoff)), week: stats(result.sales) };
}

export function variantText(result) {
  if (!result?.ok) return `Вариант недоступен: HTTP ${result?.status ?? '?'}. Слоты не менялись.`;
  const line = (label, row) => `${label}: ${row.count}, Q1/медиана ${row.q1?.toFixed(2) ?? '—'}/${row.median?.toFixed(2) ?? '—'} TON; ${Object.entries(row.markets).map(([m,n])=>`${m} ${n}`).join(', ') || 'нет'}`;
  return [`${result.collection} / ${result.model} / ${result.backdrop}${result.complete ? '' : ' (НЕПОЛНАЯ выборка)'}`, line('24 ч', result.day), line('7 дней', result.week), 'Завершённые продажи не гарантируют перепродажу. Слоты не менялись.'].join('\n');
}
