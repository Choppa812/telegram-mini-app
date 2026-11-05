import { randomUUID } from 'node:crypto';
import { readVariant } from './variants.js';
import { readCrossMarket } from './cross.js';
import { readSatellite } from './satellite.js';
import { competitivePrice } from './competitive.js';
import { scanCatalog } from './catalog-scan.js';

const identity=r=>JSON.stringify([r.collection,r.model,r.backdrop]);
export function researchCandidates(rows,balance,runId,slots){
 // Discovery may use a partial observation. Every proposed bid still needs
 // complete exact-model history with multiple daily and weekly sales below.
 const ranked=rows.filter(r=>r?.runId===runId).flatMap(r=>(r.combinations||[])
  .filter(c=>c.backdrop==='Black'&&c.day?.count>=1&&c.week?.count>=3&&c.day.q1>0&&c.day.q1<=balance)
  .map(c=>({...c,collection:r.collection})))
  .sort((a,b)=>b.day.count-a.day.count||b.week.count-a.week.count||a.collection.localeCompare(b.collection)),seen=new Set(),result=[];
 const add=r=>{const id=identity(r);if(!seen.has(id)){seen.add(id);result.push(r);}};
 for(const s of slots.filter(s=>s.portalsAutobuy&&s.modelNames?.length===1&&s.backdropNames?.length===1&&s.backdropNames[0]==='Black'))
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
  if(previous?.status==='insufficient'&&previous.scope==='Black'&&previous.discoveryIndex===undefined){
   previous.status='discovering';previous.discoveryIndex=0;await store.saveResearchRun(previous);
  }
  if(['running','discovering'].includes(previous?.status)&&previous.scope==='Black'){
   await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research',run:previous.id,index:previous.index,...(previous.status==='discovering'?{discoveryIndex:previous.discoveryIndex}:{})},{idempotencyKey:previous.id+':resume:'+previous.index+':'+(previous.discoveryIndex??0)+':'+Math.floor(Date.now()/60000),retentionSeconds:604800});
   return researchText(previous);
  }
  const catalog=await store.getCatalogRun();if(!catalog?.total)throw Error('NO_CATALOG');
  const [profile,subs]=await Promise.all([readSatellite('/user/me',{},key,'token'),readSatellite('/user/subscriptions',{},key,'token')]);
  if(!profile.ok||!subs.ok||!Array.isArray(subs.data)||subs.data.length!==28)throw Error('ACCOUNT_READ_FAILED');
  const balance=Number(profile.data.tonBalance);if(!Number.isFinite(balance)||balance<=0)throw Error('INVALID_BALANCE');
  const rows=await store.getCatalogRows(catalog.total);
  const run={id:randomUUID(),scope:'Black',status:'running',startedAt:Date.now(),index:0,balance,slots:subs.data,
   candidates:researchCandidates(rows,balance,catalog.id,subs.data),selected:[],rejected:[]};
  if(!run.candidates.length){run.status='discovering';run.discoveryIndex=0;}
  await store.saveResearchRun(run);
  await store.releaseCatalogLease(lease);
  await enqueue('catalog-scan',{kind:'research',run:run.id,index:0,...(run.status==='discovering'?{discoveryIndex:0}:{})},{idempotencyKey:run.id+':0',retentionSeconds:604800});
  return researchText(run);
 }finally{await store.releaseCatalogLease(lease);}
}
export async function processResearchStep(message,{store,key,send,enqueue,variantReader=readVariant,marketReader=readCrossMarket,scan=scanCatalog}){
 const lease=await store.acquireCatalogLease();if(!lease)throw Error('RESEARCH_BUSY');
 try{
  const run=await store.getResearchRun();if(!run||run.id!==message.run||!['running','discovering'].includes(run.status))return;
  if(run.status==='discovering'){
   if(message.discoveryIndex===run.discoveryIndex){
    const result=await scan(key,{offset:run.discoveryIndex,limit:1,maxPages:60,backdrop:'Black'});
    const seen=new Set(run.candidates.map(identity));
    for(const row of result.collections)for(const c of row.combinations||[]){
     const candidate={...c,collection:row.collection};
     if(c.backdrop==='Black'&&c.day.count>=1&&c.week.count>=3&&c.day.q1>0&&c.day.q1<=run.balance&&!seen.has(identity(candidate))){run.candidates.push(candidate);seen.add(identity(candidate));}
    }
    run.discoveryIndex++;run.discoveryTotal=result.catalogTotal;
    run.status=run.index<run.candidates.length?'running':run.discoveryIndex<result.catalogTotal?'discovering':'insufficient';
    await store.saveResearchRun(run);
    if(run.status==='insufficient'||run.discoveryIndex%10===0)try{await send(researchText(run));}catch{}
   }
   await store.releaseCatalogLease(lease);
   if(run.status==='discovering')await enqueue('catalog-scan',{kind:'research',run:run.id,index:run.index,discoveryIndex:run.discoveryIndex},{idempotencyKey:run.id+':discover:'+run.discoveryIndex,retentionSeconds:604800});
   else if(run.status==='running')await enqueue('catalog-scan',{kind:'research',run:run.id,index:run.index},{idempotencyKey:run.id+':'+run.index,retentionSeconds:604800});
   return;
  }
  if(run.index===message.index){
   const candidate=run.candidates[run.index];
   if(!candidate)throw Error('EMPTY_RESEARCH');
   const {collection,model,backdrop}=candidate;
   if(backdrop!=='Black')throw Error('BLACK_ONLY_RESEARCH');
   let history;
   try{history=await variantReader(collection,model,backdrop,key,{maxPages:100});}
   catch(error){if(error.message==='INVALID_VARIANT_REQUEST')history={ok:false,complete:false};else throw error;}
   let reason='INSUFFICIENT_EXACT_SALES',selected;
   if(history.ok&&history.complete&&history.day.count>=2&&history.week.count>=8&&history.day.q1>0&&history.week.q1>0){
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
   run.status=run.selected.length===28?'completed':run.index===run.candidates.length?(run.discoveryIndex===undefined||run.discoveryIndex<run.discoveryTotal?'discovering':'insufficient'):'running';
   if(run.status==='discovering'&&run.discoveryIndex===undefined)run.discoveryIndex=0;
   await store.saveResearchRun(run);
   if(run.status!=='running'||run.index%10===0)try{await send(researchText(run));}catch{}
  }
  if(run.status==='discovering'){
   await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research',run:run.id,index:run.index,discoveryIndex:run.discoveryIndex},{idempotencyKey:run.id+':discover:'+run.discoveryIndex,retentionSeconds:604800});
  }else if(run.status==='running'){
   // Release before publishing: fast delivery can otherwise collide with our
   // own lease and impose a full queue retry interval on the following step.
   await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research',run:run.id,index:run.index},{idempotencyKey:run.id+':'+run.index,retentionSeconds:604800});
  }
 }finally{await store.releaseCatalogLease(lease);}
}
export function researchText(run){
 if(!run)return 'Подбор портфеля ещё не запущен.';
 const lines=[`Подбор 28 слотов только Black: ${run.status}; проверено ${run.index}/${run.candidates.length}; подтверждено ${run.selected.length}/28.`,
  ...(run.discoveryIndex!==undefined?[`Дополнительный сбор Black: ${run.discoveryIndex}/${run.discoveryTotal??132} коллекций.`]:[]),
  ...(run.status==='running'?[`Следующий: ${run.candidates[run.index]?.collection} / ${run.candidates[run.index]?.model} / ${run.candidates[run.index]?.backdrop}.`]:[]),
  ...run.selected.map((r,i)=>`${i+1}. ${r.collection} / ${r.model} / ${r.backdrop}: до ${r.ceiling.toFixed(2)} TON; ${r.history.day.count}/${r.history.week.count} продаж.`),
  'Требуется полная точная история: минимум 2 продажи за сутки и 8 за неделю. Покупка: 3%; продажа: резерв 2%; расчётный запас 1,5 TON. Это анализ; слоты не изменялись.'];
 return lines.join('\n');
}

