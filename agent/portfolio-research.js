import { randomUUID } from 'node:crypto';
import { rankCatalog } from './catalog-review.js';
import { readVariant } from './variants.js';
import { readCrossMarket } from './cross.js';
import { readSatellite } from './satellite.js';
import { competitivePrice } from './competitive.js';

const identity=r=>JSON.stringify([r.collection,r.model,r.backdrop]);
export function researchCandidates(rows,balance,runId,slots){
 const ranked=rankCatalog(rows,balance,runId),seen=new Set(),result=[];
 const add=r=>{const id=identity(r);if(!seen.has(id)){seen.add(id);result.push(r);}};
 for(const s of slots.filter(s=>s.portalsAutobuy&&s.modelNames?.length===1&&s.backdropNames?.length===1))
  add({collection:s.collectionName,model:s.modelNames[0],backdrop:s.backdropNames[0]});
 const groups=new Map();
 for(const r of ranked){if(!groups.has(r.collection))groups.set(r.collection,[]);groups.get(r.collection).push(r);}
 // Round-robin prevents one newly popular collection from filling the portfolio.
 while([...groups.values()].some(g=>g.length)&&result.length<160)
  for(const group of groups.values())if(group.length&&result.length<160)add(group.shift());
 return result;
}
export async function startResearch({store,key,enqueue}){
 const lease=await store.acquireCatalogLease();if(!lease)throw Error('RESEARCH_BUSY');
 try{
  let previous=await store.getResearchRun();
  if(previous?.status==='running'){
   await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research',run:previous.id,index:previous.index},{idempotencyKey:previous.id+':'+previous.index,retentionSeconds:604800});
   return researchText(previous);
  }
  const catalog=await store.getCatalogRun();if(!catalog?.total)throw Error('NO_CATALOG');
  const [profile,subs]=await Promise.all([readSatellite('/user/me',{},key,'token'),readSatellite('/user/subscriptions',{},key,'token')]);
  if(!profile.ok||!subs.ok||!Array.isArray(subs.data)||subs.data.length!==28)throw Error('ACCOUNT_READ_FAILED');
  const balance=Number(profile.data.tonBalance);if(!Number.isFinite(balance)||balance<=0)throw Error('INVALID_BALANCE');
  const rows=await store.getCatalogRows(catalog.total);
  const run={id:randomUUID(),status:'running',startedAt:Date.now(),index:0,balance,slots:subs.data,
   candidates:researchCandidates(rows,balance,catalog.id,subs.data),selected:[],rejected:[]};
  await store.saveResearchRun(run);
  await store.releaseCatalogLease(lease);
  await enqueue('catalog-scan',{kind:'research',run:run.id,index:0},{idempotencyKey:run.id+':0',retentionSeconds:604800});
  return researchText(run);
 }finally{await store.releaseCatalogLease(lease);}
}
export async function processResearchStep(message,{store,key,send,enqueue,variantReader=readVariant,marketReader=readCrossMarket}){
 const lease=await store.acquireCatalogLease();if(!lease)throw Error('RESEARCH_BUSY');
 try{
  const run=await store.getResearchRun();if(!run||run.id!==message.run||run.status!=='running')return;
  if(run.index===message.index){
   const candidate=run.candidates[run.index];
   if(!candidate)throw Error('EMPTY_RESEARCH');
   const {collection,model,backdrop}=candidate;
   let history;
   try{history=await variantReader(collection,model,backdrop,key,{maxPages:100});}
   catch(error){if(error.message==='INVALID_VARIANT_REQUEST')history={ok:false,complete:false};else throw error;}
   let reason='INSUFFICIENT_EXACT_SALES',selected;
   if(history.ok&&history.complete&&history.day.count>=3&&history.week.count>=8&&history.day.q1>0&&history.week.q1>0){
    const market=await marketReader(collection,key,undefined,undefined,backdrop,model);
    const floors=(market.rows||[]).map(r=>r.floor).filter(f=>Number.isFinite(f)&&f>0);
    reason='EXACT_MARKET_UNAVAILABLE';
    if(market.ok&&market.rows.length===5&&floors.length){
     const floor=Math.min(...floors),price=competitivePrice({ceiling:run.balance/1.03,day:history.day.q1,week:history.week.q1,floor});
     reason='NO_POSITIVE_MARGIN';
     if(price>0&&price*1.03<=run.balance)selected={collection,model,backdrop,ceiling:price,minWeek:8,pricing:'competitive',history,market,checkedAt:Date.now()};
    }
   }
   if(selected)run.selected.push(selected);else run.rejected.push({collection,model,backdrop,reason});
   run.index++;
   run.status=run.selected.length===28?'completed':run.index===run.candidates.length?'insufficient':'running';
   await store.saveResearchRun(run);
   if(run.status!=='running'||run.index%10===0)try{await send(researchText(run));}catch{}
  }
  if(run.status==='running'){
   // Release before publishing: fast delivery can otherwise collide with our
   // own lease and impose a full queue retry interval on the following step.
   await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research',run:run.id,index:run.index},{idempotencyKey:run.id+':'+run.index,retentionSeconds:604800});
  }
 }finally{await store.releaseCatalogLease(lease);}
}
export function researchText(run){
 if(!run)return 'Подбор портфеля ещё не запущен.';
 const lines=[`Подбор 28 слотов: ${run.status}; проверено ${run.index}/${run.candidates.length}; подтверждено ${run.selected.length}/28.`,
  ...(run.status==='running'?[`Следующий: ${run.candidates[run.index]?.collection} / ${run.candidates[run.index]?.model} / ${run.candidates[run.index]?.backdrop}.`]:[]),
  ...run.selected.map((r,i)=>`${i+1}. ${r.collection} / ${r.model} / ${r.backdrop}: до ${r.ceiling.toFixed(2)} TON; ${r.history.day.count}/${r.history.week.count} продаж.`),
  'Покупка: 3%; продажа: резерв 2%; расчётный запас 1,5 TON. Это анализ; слоты не изменялись.'];
 return lines.join('\n');
}
