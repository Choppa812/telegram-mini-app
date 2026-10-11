import { readSatellite } from './satellite.js';

export function summarizeTurnover(rows, period) {
  if (!Array.isArray(rows)) throw new Error('INVALID_TURNOVER_RESPONSE');
  return rows.flatMap(row => {
    if (typeof row?.collectionName !== 'string' || !Array.isArray(row.values)) return [];
    const quantity = row.values.reduce((sum, point) => sum + (Number.isFinite(point?.quantity) && point.quantity >= 0 ? point.quantity : 0), 0);
    const volume = row.values.reduce((sum, point) => sum + (Number.isFinite(point?.volume) && point.volume >= 0 ? point.volume : 0), 0);
    return [{ collection: row.collectionName, quantity, volume: Math.round(volume), period }];
  }).sort((a, b) => b.quantity - a.quantity).map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function readTurnover(key, fetcher = fetch) {
  const periods = {};
  for (const period of ['24h', '7d']) {
    const response = await readSatellite('/history/collections', { period }, key, 'token', fetcher);
    if (!response.ok) return { ok: false, period, status: response.status };
    periods[period] = summarizeTurnover(response.data, period);
  }
  const weekly = new Map(periods['7d'].map(row => [row.collection, row]));
  return { ok: true, observed: { day: periods['24h'].length, week: periods['7d'].length }, rows: periods['24h'].map(day => ({ collection: day.collection, day: day.quantity, dayRank: day.rank, week: weekly.get(day.collection)?.quantity ?? 0, weekRank: weekly.get(day.collection)?.rank ?? null, volumeDay: day.volume })).sort((a,b) => b.day - a.day || b.week - a.week) };
}

export function turnoverText(result) {
  if (!result?.ok) return `Оборот коллекций недоступен: ${result?.period ?? '?'} HTTP ${result?.status ?? '?'}. Слоты не менялись.`;
  return [`Gift Satellite — частота продаж всех фонов`, `Коллекций: ${result.observed.day} за 24 ч, ${result.observed.week} за 7 дней.`, ...result.rows.slice(0,25).map(row => `${row.dayRank}. ${row.collection}: ${row.day} за 24 ч, ${row.week} за 7 дн (#${row.weekRank ?? '—'}), объём ${row.volumeDay} TON/24 ч`), 'Число сделок относится ко всем фонам; для Black нужна отдельная проверка. Слоты не менялись.'].join('\n');
}
