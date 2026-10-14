import { readSatellite } from './satellite.js';

const BASE = 'https://gift-satellite.dev/api';

export async function readPositions(key, fetcher=fetch) {
  const [slots,profile] = await Promise.all([readSatellite('/user/subscriptions',{},key,'token',fetcher),readSatellite('/user/me',{},key,'token',fetcher)]);
  if (!slots.ok || !Array.isArray(slots.data) || !profile.ok) return {ok:false,statuses:[slots.status,profile.status]};
  return {ok:true,balance:profile.data?.tonBalance??null,limit:profile.data?.subscriptionLimit??null,autobuyEnabled:profile.data?.isAutobuyEnabled??null,rows:slots.data.map(s=>({name:s.subscriptionName??'',collection:s.collectionName,models:s.modelNames??[],backdrops:s.backdropNames??[],active:s.portalsAutobuy===true,maxPrice:s.portalsAutobuyMaxPrice,quantity:s.portalsAutobuyQuantity,markets:['Tg','Portals','Tonnel','Mrkt'].filter((name,i)=>[s.autobuyTg,s.autobuyPortals,s.autobuyTonnel,s.autobuyMrkt][i])})),writesPerformed:0};
}

export function positionsText(result, filter='') {
  if (!result?.ok) return `Слоты не удалось прочитать: HTTP ${(result?.statuses||[]).join('/')}.`;
  const f=n=>Number.isFinite(n)?n.toFixed(2):'—';
  const rows=result.rows.map((s,i)=>({s,i})).filter(({s})=>!filter||s.collection.toLowerCase().includes(filter.toLowerCase()));
  return [`Gift Satellite — текущие слоты. Баланс ${f(result.balance)} TON; слотов ${result.rows.length}/${result.limit??'?'}, глобальный автобай ${result.autobuyEnabled===null?'?':result.autobuyEnabled?'вкл':'выкл'}.`,...rows.map(({s,i})=>`${i+1}. ${s.collection}, фон ${s.backdrops.join(',')||'любой'}, модели ${filter?(s.models.join(',')||'любые'):`${s.models.length||'все'} шт.`}, ${s.active?'автобай':'без автобая'} ${f(s.maxPrice)} TON × ${s.quantity??'?'} [${s.markets.join(',')}]`),'Чтение без изменений.'].join('\n').slice(0,3900);
}

export async function readBlackModels(collection,key,fetcher=fetch,now=new Date(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  if(typeof collection!=='string'||!/^[\p{L}\p{N} .'-]{2,80}$/u.test(collection)||!key)throw new Error('INVALID_MODELS_REQUEST');
  const cutoff=now.getTime()-86400000, byModel=new Map(), markets={};
  let total=0,complete=false,pages=0;
  for(let page=0;page<12;page++){
    if(page)await pause(650);
    const response=await fetcher(new URL(`${BASE}/history/${encodeURIComponent(collection)}`),{method:'POST',headers:{Authorization:`Token ${key}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({page,pageSize:20,sortBy:'date',backdrops:['Black']}),redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok)return {ok:false,status:response.status};
    const data=await response.json();if(!Array.isArray(data?.content))throw new Error('INVALID_HISTORY');
    pages++;
    const times=data.content.map(row=>Date.parse(row?.soldAt||''));
    if(times.some(t=>!Number.isFinite(t)))throw new Error('INVALID_HISTORY_DATE');
    for(let i=1;i<times.length;i++)if(times[i]>times[i-1])throw new Error('UNSORTED_HISTORY');
    for(let i=0;i<data.content.length;i++){
      if(times[i]<cutoff||times[i]>now.getTime())continue;
      const row=data.content[i],model=row.modelName||'(без модели)',price=Number(row.normalizedPrice);
      if(!byModel.has(model))byModel.set(model,{prices:[],markets:{}});
      const record=byModel.get(model);record.prices.push(price);
      if(typeof row.market==='string'&&row.market){record.markets[row.market]=(record.markets[row.market]||0)+1;markets[row.market]=(markets[row.market]||0)+1;}
      total++;
    }
    if(data.content.length<20||!times.length||times[times.length-1]<cutoff){complete=true;break;}
  }
  const rows=[...byModel].map(([model,record])=>{const sorted=record.prices.filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);return {model,count:record.prices.length,p25:sorted.length?sorted[Math.floor((sorted.length-1)*.25)]:null,median:sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null,markets:record.markets};}).sort((a,b)=>b.count-a.count);
  return {ok:true,collection,total,complete,pages,rows,markets,writesPerformed:0};
}

export function blackModelsText(result){
  if(!result?.ok)return `Модели Black недоступны: HTTP ${result?.status??'?'}.`;
  const f=n=>Number.isFinite(n)?n.toFixed(2):'—';
  return [`Gift Satellite — модели ${result.collection} Black: ${result.total}${result.complete?'':'+'} продаж за 24 ч, ${result.pages} стр.`,...result.rows.slice(0,30).map(r=>`${r.model}: ${r.count} сделок, Q1/медиана ${f(r.p25)}/${f(r.median)} TON`),'Исторические цены не гарантируют перепродажу. Слоты не менялись.'].join('\n');
}

export function modelMarketsText(result){
  if(!result?.ok)return `Продажи Black по площадкам недоступны: HTTP ${result?.status??'?'}. Слоты не менялись.`;
  const parts=markets=>Object.entries(markets||{}).sort((a,b)=>b[1]-a[1]).map(([market,count])=>`${market} ${count}`).join(', ')||'площадка не указана';
  return [`Gift Satellite — продажи ${result.collection} Black по площадкам за 24 ч: ${result.total}${result.complete?'':'+'}.`, `Всего: ${parts(result.markets)}.`, ...result.rows.slice(0,8).map(row=>`${row.model}: ${row.count}, ${parts(row.markets)}`), 'Слоты не менялись.'].join('\n');
}
