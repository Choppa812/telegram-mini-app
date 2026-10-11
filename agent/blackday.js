const BASE = 'https://gift-satellite.dev/api';

export async function countBlackSales(collection, token, fetcher = fetch, now = new Date(), pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (typeof collection !== 'string' || !/^[\p{L}\p{N} .'-]{2,80}$/u.test(collection) || !token) throw new Error('INVALID_BLACKDAY_REQUEST');
  const threshold = now.getTime() - 86400000;
  let count = 0;
  for (let page = 0; page < 12; page++) {
    if (page) await pause(650);
    const response = await fetcher(new URL(`${BASE}/history/${encodeURIComponent(collection)}`), {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, pageSize:20, sortBy:'date', backdrops:['Black'] }),
      redirect: 'error', signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { ok:false, collection, status:response.status };
    const data = await response.json();
    if (!Array.isArray(data?.content)) throw new Error('INVALID_HISTORY_RESPONSE');
    const timestamps = data.content.map(item => Date.parse(item?.soldAt || ''));
    if (timestamps.some(time => !Number.isFinite(time))) throw new Error('INVALID_HISTORY_DATE');
    for (let i=1;i<timestamps.length;i++) if (timestamps[i]>timestamps[i-1]) throw new Error('UNSORTED_HISTORY');
    count += timestamps.filter(time => time >= threshold && time <= now.getTime()).length;
    if (data.content.length < 20 || !timestamps.length || timestamps[timestamps.length-1] < threshold) return { ok:true, collection, count, complete:true, pages:page+1, writesPerformed:0 };
  }
  return { ok:true, collection, count, complete:false, pages:12, writesPerformed:0 };
}

export function blackSalesText(result) {
  if (!result?.ok) return `Black-продажи ${result?.collection ?? ''} недоступны: HTTP ${result?.status ?? '?'}. Слоты не менялись.`;
  return `Gift Satellite — ${result.collection} Black\nПродаж за последние 24 ч: ${result.count}${result.complete?'':'+'}. Страниц истории: ${result.pages}. ${result.complete?'Подсчёт завершён.':'Достигнут лимит страниц; число минимальное.'} Слоты не менялись.`;
}
