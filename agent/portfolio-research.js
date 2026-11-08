import { randomUUID } from 'node:crypto';
import { readVariant } from './variants.js';
import { readCrossMarket } from './cross.js';
import { readSatellite } from './satellite.js';
import { competitivePrice } from './competitive.js';
import { scanCatalog } from './catalog-scan.js';

const identity=r=>JSON.stringify([r.collection,r.model,r.backdrop]);
export function consistentPrices(history){
 const day=history?.day?.q1,week=history?.week?.q1,median=history?.week?.median;
 return Number.isFinite(day)&&Number.isFinite(week)&&day>0&&week>0&&day>=week*.5&&
  (!(Number.isFinite(median)&&median>0)||week>=median*.5);
}
export function diversifySelection(rows,collection='Chill Flame',limit=3){
 const retained=new Set(rows.filter(r=>r.collection===collection)
  .sort((a,b)=>b.history.day.count-a.history.day.count||b.history.week.count-a.history.week.count)
  .slice(0,limit).map(identity));
 return rows.filter(r=>r.collection!==collection||retained.has(identity(r)));
}
export function researchCandidates(rows,balance,runId,slots){
 // Discovery may use a partial observation. Every proposed bid still needs
 // complete exact-model history with multiple daily and weekly sales below.
 const ranked=rows.filter(r=>r?.runId===runId).flatMap(r=>(r.combinations||[])
  .filter(c=>c.backdrop==='Black'&&c.day?.count>=1&&c.week?.count>=3&&c.day.q1>0&&c.day.q1<=balance)
  .map(c=>({...c,collection:r.collection})))
  .sort((a,b)=>b.day.count-a.day.count||b.week.count-a.week.count||a.collection.localeCompare(b.collection)),seen=new Set(),result=[];
 const add=r=>{const id=identity(r);if(!seen.has(id)){seen.add(id);result.push(r);}};
 for(const s of slots.filter(s=>s.portalsAutobuy&&s.modelNames?.length===1&&s.backdropNames?.length===1&&s.backdropNames[0]==='Black'))
  add({collection:s.collectionName,model:s.modelNames[0],backdrop:s.backdropNames[0],...(Number(s.portalsAutobuyMaxPrice)>0?{approvedCeiling:Number(s.portalsAutobuyMaxPrice)}:{})});
 const groups=new Map();
 for(const r of ranked){if(!groups.has(r.collection))groups.set(r.collection,[]);groups.get(r.collection).push(r);}
 // Round-robin prevents one newly popular collection from filling the portfolio.
 while([...groups.values()].some(g=>g.length)&&result.length<160)
  for(const group of groups.values())if(group.length&&result.length<160)add(group.shift());
 return result;
}
export function rankResearch(rows){
 return diversifySelection([...rows].sort((a,b)=>
  Math.min(b.history.day.count,b.history.week.count/7)-Math.min(a.history.day.count,a.history.week.count/7)||
  b.history.week.count-a.history.week.count||a.collection.localeCompare(b.collection))).slice(0,28);
}
export async function startResearch({store,key,enqueue,diversify=false,audit=false,fill=false,all=false,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 // Queue sends are pinned to the sending deployment. A correction must acquire
 // the shared checkpoint between steps and resume from the current deployment,
 // rather than letting an old running worker overwrite the revised proposal.
 let lease;
 for(let attempt=0;attempt<60&&!lease;attempt++){
  lease=await store.acquireCatalogLease();if(!lease)await wait(500);
 }
 if(!lease)throw Error('RESEARCH_BUSY');
 try{
  let previous=await store.getResearchRun();
  if(all){
   if(previous?.fullCatalog&&['running','discovering'].includes(previous.status)){
    await store.releaseCatalogLease(lease);
    await enqueue('catalog-scan',{kind:'research',run:previous.id,index:previous.index,...(previous.status==='discovering'?{discoveryIndex:previous.discoveryIndex}:{})},{idempotencyKey:previous.id+':all-resume:'+previous.index+':'+previous.discoveryIndex+':'+Math.floor(Date.now()/60000),retentionSeconds:604800});
    return researchText(previous);
   }
   const [profile,subs]=await Promise.all([readSatellite('/user/me',{},key,'token'),readSatellite('/user/subscriptions',{},key,'token')]);
   if(!profile.ok||!subs.ok||!Array.isArray(subs.data)||subs.data.length!==28)throw Error('ACCOUNT_READ_FAILED');
   const balance=Number(profile.data.tonBalance);if(!Number.isFinite(balance)||balance<=0)throw Error('INVALID_BALANCE');
   const run={id:randomUUID(),scope:'Black',fullCatalog:true,status:'discovering',startedAt:Date.now(),index:0,balance,slots:subs.data,candidates:[],selected:[],qualified:[],rejected:[],coverage:[],collectionCaps:{'Chill Flame':3},discoveryIndex:0};
   await store.saveResearchRun(run);await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research',run:run.id,index:0,discoveryIndex:0},{idempotencyKey:run.id+':all:0',retentionSeconds:604800});
   return researchText(run);
  }
  if(fill){
   if(previous?.preserveExisting&&['running','discovering'].includes(previous.status)){
    await store.releaseCatalogLease(lease);
    await enqueue('catalog-scan',{kind:'research',run:previous.id,index:previous.index,...(previous.status==='discovering'?{discoveryIndex:previous.discoveryIndex}:{})},{idempotencyKey:previous.id+':fill-resume:'+previous.index,retentionSeconds:604800});
    return researchText(previous);
   }
   const [profile,subs]=await Promise.all([readSatellite('/user/me',{},key,'token'),readSatellite('/user/subscriptions',{},key,'token')]);
   if(!profile.ok||!subs.ok||!Array.isArray(subs.data)||subs.data.length!==28)throw Error('ACCOUNT_READ_FAILED');
   const balance=Number(profile.data.tonBalance);if(!Number.isFinite(balance)||balance<=0)throw Error('INVALID_BALANCE');
   const selected=[];
   for(const s of subs.data.filter(s=>s.portalsAutobuy===true&&s.portalsAutobuyQuantity===1)){
    if(s.modelNames?.length!==1||JSON.stringify(s.backdropNames)!=='["Black"]')throw Error('UNEXPECTED_ACTIVE_ORDER');
    const r=previous?.selected.find(r=>r.collection===s.collectionName&&r.model===s.modelNames[0]&&r.backdrop==='Black');
    if(!r)throw Error('ACTIVE_ORDER_NOT_IN_RESEARCH');
    selected.push({...r,ceiling:Number(s.portalsAutobuyMaxPrice),retained:true});
   }
   if(selected.length===28)return 'Все 28 слотов уже активны.';
   const occupied=new Set(subs.data.filter(s=>s.modelNames?.length===1&&s.backdropNames?.length===1).map(s=>identity({collection:s.collectionName,model:s.modelNames[0],backdrop:s.backdropNames[0]})));
   const candidates=(previous?.candidates||[]).filter(r=>r.backdrop==='Black'&&!occupied.has(identity(r))).sort((a,b)=>(b.day?.count||0)-(a.day?.count||0));
   const run={id:randomUUID(),scope:'Black',status:candidates.length?'running':'discovering',startedAt:Date.now(),index:0,balance,slots:subs.data,candidates,selected,rejected:[],collectionCaps:{'Chill Flame':3},preserveExisting:true,discoveryIndex:previous?.discoveryIndex??0,discoveryTotal:previous?.discoveryTotal??132};
   await store.saveResearchRun(run);await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research',run:run.id,index:0,...(run.status==='discovering'?{discoveryIndex:run.discoveryIndex}:{})},{idempotencyKey:run.id+':fill:0',retentionSeconds:604800});
   return researchText(run);
  }
  if(audit&&previous?.scope==='Black'){
   const selected=[];
   for(const r of previous.selected){
    if(!consistentPrices(r.history))continue;
    const floors=(r.market?.rows||[]).map(m=>m.floor).filter(f=>Number.isFinite(f)&&f>0);
    if(!floors.length)continue;
    const ceiling=competitivePrice({ceiling:r.ceiling,day:r.history.day.q1,week:r.history.week.q1,floor:Math.min(...floors)});
    if(ceiling>0)selected.push({...r,ceiling});
   }
   previous={...previous,id:randomUUID(),revisedAt:Date.now(),selected};
   previous.status=selected.length===28?'completed':previous.index<previous.candidates.length?'running':(previous.discoveryIndex??0)<(previous.discoveryTotal??132)?'discovering':'insufficient';
   previous.discoveryIndex??=0;await store.saveResearchRun(previous);
   if(previous.status==='completed')return researchText(previous);
  }
  if(previous?.scope==='Black'&&previous.selected?.some(r=>!consistentPrices(r.history))){
   const removed=previous.selected.filter(r=>!consistentPrices(r.history));
   previous={...previous,id:randomUUID(),revisedAt:Date.now(),selected:previous.selected.filter(r=>consistentPrices(r.history)),
    rejected:[...previous.rejected,...removed.map(r=>({collection:r.collection,model:r.model,backdrop:r.backdrop,reason:'INCONSISTENT_EXACT_PRICES'}))]};
   previous.status=previous.index<previous.candidates.length?'running':(previous.discoveryIndex??0)<(previous.discoveryTotal??132)?'discovering':'insufficient';
   previous.discoveryIndex??=0;await store.saveResearchRun(previous);
  }
  if(diversify&&previous?.scope==='Black'&&previous.selected?.length&&previous.collectionCaps?.['Chill Flame']!==3){
   const profile=await readSatellite('/user/me',{},key,'token');
   const balance=Number(profile.data?.tonBalance);
   if(!profile.ok||!Number.isFinite(balance)||balance<=0)throw Error('INVALID_BALANCE');
   previous={...previous,id:randomUUID(),balance,revisedAt:Date.now(),collectionCaps:{'Chill Flame':3},selected:diversifySelection(previous.selected).filter(r=>r.ceiling*1.03<=balance)};
   previous.status=previous.index<previous.candidates.length?'running':(previous.discoveryIndex??0)<(previous.discoveryTotal??132)?'discovering':'insufficient';
   previous.discoveryIndex??=0;
   await store.saveResearchRun(previous);
  }
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
   candidates:researchCandidates(rows,balance,catalog.id,subs.data),selected:[],rejected:[],collectionCaps:{'Chill Flame':3}};
  // Reuse discoveries as candidates, never as sales evidence. Each is checked
  // again against current complete exact history and all five marketplaces.
  const seen=new Set(run.candidates.map(identity));
  for(const r of previous?.scope==='Black'?previous.candidates||[]:[]){
   if(r.backdrop==='Black'&&!seen.has(identity(r))){run.candidates.push(r);seen.add(identity(r));}
  }
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
    if(run.fullCatalog){
     run.coverage.push(...result.collections.map(r=>({collection:r.collection,complete:r.complete,error:r.error,observedSales:r.observedSales,date:result.startedAt})));
     run.status=run.discoveryIndex<result.catalogTotal?'discovering':run.candidates.length?'running':'insufficient';
    }else run.status=run.index<run.candidates.length?'running':run.discoveryIndex<result.catalogTotal?'discovering':'insufficient';
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
   const cap=run.collectionCaps?.[collection];
   let reason='INSUFFICIENT_EXACT_SALES',selected;
   if(!run.fullCatalog&&cap!==undefined&&run.selected.filter(r=>r.collection===collection).length>=cap){
    reason='COLLECTION_LIMIT';
   }else{
   let history;
   try{history=await variantReader(collection,model,backdrop,key,{maxPages:100});}
   catch(error){if(error.message==='INVALID_VARIANT_REQUEST')history={ok:false,complete:false};else throw error;}
   if(history.ok&&history.complete&&history.day.count>=2&&history.week.count>=8&&!consistentPrices(history))reason='INCONSISTENT_EXACT_PRICES';
   if(history.ok&&history.complete&&history.day.count>=2&&history.week.count>=8&&consistentPrices(history)){
    const market=await marketReader(collection,key,undefined,undefined,backdrop,model);
    const floors=(market.rows||[]).map(r=>r.floor).filter(f=>Number.isFinite(f)&&f>0);
    reason='EXACT_MARKET_UNAVAILABLE';
    if(market.ok&&market.rows.length===5&&floors.length){
     const floor=Math.min(...floors),price=competitivePrice({ceiling:Math.min(run.balance/1.03,candidate.approvedCeiling??Infinity),day:history.day.q1,week:history.week.q1,floor});
     reason='NO_POSITIVE_MARGIN';
     if(price>0&&price*1.03<=run.balance)selected={collection,model,backdrop,ceiling:price,minWeek:8,pricing:'competitive',history,market,checkedAt:Date.now()};
    }
   }
   }
   if(selected){
    if(run.fullCatalog){run.qualified.push(selected);run.selected=rankResearch(run.qualified);}
    else run.selected.push(selected);
   }else run.rejected.push({collection,model,backdrop,reason});
   run.index++;
   run.status=run.fullCatalog?(run.index<run.candidates.length?'running':run.selected.length===28?'completed':'insufficient'):
    run.selected.length===28?'completed':run.index===run.candidates.length?(run.discoveryIndex===undefined||run.discoveryIndex<run.discoveryTotal?'discovering':'insufficient'):'running';
   if(['completed','insufficient'].includes(run.status))run.finishedAt=Date.now();
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
  ...(run.fullCatalog?[`Новый обход всех коллекций: ${run.discoveryIndex}/${run.discoveryTotal??'?'}; полная история у ${run.coverage.filter(r=>r.complete).length}, неполная у ${run.coverage.filter(r=>!r.complete).length}.`,
   `Данные с ${new Date(run.startedAt).toISOString()}${run.finishedAt?' по '+new Date(run.finishedAt).toISOString():''}; баланс при запуске ${run.balance.toFixed(2)} TON.`,
   'Сравниваются все найденные кандидаты; список предварительный до завершения. Приоритет — устойчивый оборот точного сочетания.']:[]),
  ...(run.preserveExisting?[`Действующих ставок сохраняется: ${run.selected.filter(r=>r.retained).length}; изменения только для свободных мест.`]:[]),
  ...(run.collectionCaps?.['Chill Flame']===3?['Chill Flame: максимум 3 слота; остальные — другие коллекции.']:[]),
  ...(run.discoveryIndex!==undefined?[`Дополнительный сбор Black: ${run.discoveryIndex}/${run.discoveryTotal??132} коллекций.`]:[]),
  ...(run.status==='running'?[`Следующий: ${run.candidates[run.index]?.collection} / ${run.candidates[run.index]?.model} / ${run.candidates[run.index]?.backdrop}.`]:[]),
  ...run.selected.map((r,i)=>`${i+1}. ${r.collection} / ${r.model} / ${r.backdrop}: до ${r.ceiling.toFixed(2)} TON; ${r.history.day.count}/${r.history.week.count} продаж.`),
  'Требуется полная точная история: минимум 2 продажи за сутки и 8 за неделю. Ценовые расхождения более чем вдвое исключаются. Покупка: 3%; продажа: резерв 2%; запас 1,5 TON. Это анализ; слоты не изменялись.'];
 return lines.join('\n');
}

export function researchDetails(run,page){
 if(!run||!Number.isInteger(page)||page<0||page>3)return 'Укажите страницу /researchdetails 0–3.';
 const fixed=n=>Number.isFinite(n)?n.toFixed(2):'нет';
 return [`Детали нового подбора; ${run.status}; страница ${page+1}/4.`,
  ...run.selected.slice(page*7,page*7+7).map((r,i)=>{
   const floors=r.market.rows.map(m=>m.floor).filter(f=>Number.isFinite(f)&&f>0);
   const exit=Math.min(r.history.day.q1,r.history.week.q1,...floors);
   return `${page*7+i+1}. ${r.collection} / ${r.model} / ${r.backdrop}: лимит ${fixed(r.ceiling)} TON.\nПродажи 24ч/7д: ${r.history.day.count}/${r.history.week.count}; Q1 ${fixed(r.history.day.q1)}/${fixed(r.history.week.q1)}; медиана ${fixed(r.history.day.median)}/${fixed(r.history.week.median)}.\nФлоры: ${r.market.rows.map(m=>m.market+' '+fixed(m.floor)).join('; ')}.\nРасчётный выход ${fixed(exit)}, остаток после 3% покупки и 2% продажи ${fixed(exit*.98-r.ceiling*1.03)} TON до переводов. Проверено ${new Date(r.checkedAt).toISOString()}.`;
  }), 'Только анализ. Цена выхода и срок продажи не гарантированы. Слоты не менялись.'].join('\n');
}


