import { readSatellite } from './satellite.js';

const BASE = 'https://gift-satellite.dev/api';
const BATCH = 8;

export async function scanBlackBatch(index, token, fetcher = fetch, now = new Date(), pause = ms => new Promise(resolve => setTimeout(resolve, ms)), floorLimit = 50) {
  if (!Number.isInteger(index) || index < 0 || index > 30 || !token || ![50,90].includes(floorLimit)) throw new Error('INVALID_BLACK_SCAN');
  const a = await readSatellite('/history/floors',{market:'portals',black:true},token,'token',fetcher);
  await pause(550);
  const b = await readSatellite('/history/floors',{market:'mrkt',black:true},token,'token',fetcher);
  if (!a.ok || !b.ok || typeof a.data !== 'object' || typeof b.data !== 'object') return {ok:false,statuses:[a.status,b.status]};
  const names = [...new Set([...Object.keys(a.data),...Object.keys(b.data)])].filter(name=>{
    const prices = [Number(a.data[name]),Number(b.data[name])].filter(n=>Number.isFinite(n)&&n>0);
    return prices.length && Math.min(...prices)<=floorLimit;
  }).sort((x,y)=>x.localeCompare(y,'en'));
  const selected = names.slice(index*BATCH,(index+1)*BATCH);
  const rows=[];
  for (const collection of selected) {
    await pause(550);
    const response = await fetcher(new URL(`${BASE}/history/${encodeURIComponent(collection)}`),{method:'POST',headers:{Authorization:`Token ${token}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({page:0,pageSize:20,sortBy:'date',backdrops:['Black']}),redirect:'error',signal:AbortSignal.timeout(12000)});
    if (!response.ok) return {ok:false,statuses:[a.status,b.status,response.status],collection};
    const data=await response.json();
    if (!Array.isArray(data?.content)) throw new Error('INVALID_BLACK_HISTORY');
    const cutoff=now.getTime()-86400000;
    const times=data.content.map(item=>Date.parse(item?.soldAt||''));
    if (times.some(time=>!Number.isFinite(time))) throw new Error('INVALID_BLACK_HISTORY_DATE');
    const count=times.filter(time=>time>=cutoff&&time<=now.getTime()).length;
    const complete=data.content.length<20 || !times.length || times[times.length-1]<cutoff;
    rows.push({collection,count,complete});
  }
  return {ok:true,index,total:names.length,batchSize:BATCH,floorLimit,rows,writesPerformed:0};
}

export function blackScanText(result) {
  if (!result?.ok) return `Сканирование Black не завершено: ${result?.collection??''} HTTP ${(result?.statuses||[]).join('/')}. Слоты не менялись.`;
  return [`Gift Satellite — скан Black до ${result.floorLimit} TON, пакет ${result.index+1}/${Math.ceil(result.total/result.batchSize)}; коллекций ${result.total}.`,...result.rows.map(row=>`${row.collection}: ${row.count}${row.complete?'':'+'} продаж за 24 ч`),'«+» означает минимум: первая страница ограничена 20 сделками. Слоты не менялись.'].join('\n');
}
