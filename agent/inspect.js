const BASE = 'https://gift-satellite.dev/api';

async function request(path, token, {body, query, fetcher = fetch} = {}) {
  if (!token) throw new Error('API_KEY_MISSING');
  const url = new URL(BASE + path);
  if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetcher(url, { method:body ? 'POST' : 'GET', headers:{Authorization:`Token ${token}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})}, ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(12000) });
  if (!response.ok) return {status:response.status,data:null};
  return {status:response.status,data:await response.json()};
}

function ask(data) {
  if (!Array.isArray(data)) return null;
  const prices = data.filter(item => !item?.currency || item.currency === 'ton').map(item => Number(item?.normalizedPrice)).filter(n => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : null;
}

function sales(data, now) {
  const records = Array.isArray(data?.content) ? data.content : [];
  const recent = records.filter(item => {
    const time = Date.parse(item?.soldAt || '');
    return Number.isFinite(time) && time <= now.getTime() && time >= now.getTime() - 7*86400000;
  });
  const prices = recent.map(item=>Number(item.normalizedPrice)).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
  const oldest = records.length ? Date.parse(records[records.length-1]?.soldAt || '') : null;
  return {lastPage:records.length, sevenDays:recent.length, min:prices[0]??null, median:prices.length?prices[Math.floor((prices.length-1)/2)]:null, complete:records.length<20 || (Number.isFinite(oldest)&&oldest<now.getTime()-7*86400000)};
}

export async function inspectCollection(collection, token, fetcher = fetch, now = new Date(), pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (typeof collection !== 'string' || !/^[\p{L}\p{N} .'-]{2,80}$/u.test(collection)) throw new Error('INVALID_COLLECTION');
  const segment = encodeURIComponent(collection);
  const batch = async black => Promise.all([
    request(`/search/portals/${segment}`,token,{query:black?{backdrops:'Black'}:undefined,fetcher}),
    request(`/search/mrkt/${segment}`,token,{query:black?{backdrops:'Black'}:undefined,fetcher}),
    request(`/history/${segment}`,token,{body:{page:0,pageSize:20,sortBy:'date',...(black?{backdrops:['Black']}:{})},fetcher}),
  ]);
  const base=await batch(false);
  await pause(650);
  const black=await batch(true);
  const section = results => ({floor:[ask(results[0].data),ask(results[1].data)].filter(x=>x!==null).reduce((a,b)=>Math.min(a,b),Infinity),sales:sales(results[2].data,now),statuses:results.map(item=>item.status)});
  const normal=section(base),dark=section(black);
  if (!Number.isFinite(normal.floor)) normal.floor=null;
  if (!Number.isFinite(dark.floor)) dark.floor=null;
  return {collection,normal,dark,checkedAt:now.toISOString(),writesPerformed:0};
}

export function inspectText(result) {
  const price=n=>n===null?'—':n.toFixed(2);
  const line=(label,row)=>`${label}: предложение от ${price(row.floor)} TON; продажи за 7 дн. ${row.sales.sevenDays}${row.sales.complete?'':'+'}; медиана продаж ${price(row.sales.median)} TON; HTTP ${row.statuses.join('/')}`;
  const cap=row=>row.floor===null?'—':price(Math.max(0,row.floor-5));
  return [`Gift Satellite — ${result.collection}`,line('Все фоны',result.normal),line('Black',result.dark),`Верхняя граница покупки по правилу «минус 5 TON»: ${cap(result.normal)} / Black ${cap(result.dark)} TON.`, 'Расчёт предварительный: не учтены комиссии, ликвидность моделей и других площадок. Слоты не менялись.'].join('\n');
}
