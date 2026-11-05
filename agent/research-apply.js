import { readSatellite } from './satellite.js';
import { applyPortfolioSlot } from './portfolio.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fits=(s,r)=>s.collectionName===r.collection&&same(s.modelNames,[r.model])&&same(s.backdropNames,[r.backdrop]);
export function assignResearchSlots(selected,slots){
 if(selected.length!==28||slots.length!==28||new Set(slots.map(s=>s._id)).size!==28)throw Error('FULL_PLAN_REQUIRED');
 if(selected.some(r=>r.backdrop!=='Black'))throw Error('BLACK_ONLY_PLAN_REQUIRED');
 if(selected.filter(r=>r.collection==='Chill Flame').length>3)throw Error('COLLECTION_LIMIT');
 const used=new Set(),assigned=[];
 for(const row of selected){
  const exact=slots.find(s=>!used.has(s._id)&&fits(s,row));
  if(exact){used.add(exact._id);assigned.push({row,slot:exact});}else assigned.push({row});
 }
 const priority=s=>same(s.backdropNames,['Black'])?(s.portalsAutobuy===true?2:1):0;
 const free=slots.filter(s=>!used.has(s._id)).sort((a,b)=>priority(a)-priority(b));
 return assigned.map(({row,slot})=>{
  slot=slot||free.shift();
  const replaces=Object.fromEntries(['collectionName','modelNames','backdropNames','portalsAutobuy','portalsAutobuyQuantity','portalsAutobuyMaxPrice'].filter(k=>slot[k]!==undefined).map(k=>[k,slot[k]]));
  return {slot:slots.indexOf(slot)+1,subscriptionId:slot._id,original:slot.collectionName,
   collection:row.collection,model:row.model,backdrop:row.backdrop,ceiling:row.ceiling,minDay:2,minWeek:8,pricing:'competitive',manualActivation:true,preserveExisting:row.retained===true,replaces};
 }).sort((a,b)=>a.slot-b.slot);
}
export async function startResearchApply({store,key,enqueue}){
 const lease=await store.acquireCatalogLease();if(!lease)throw Error('BUSY');
 try{
  if(await store.isPaused())return 'Автонастройка на паузе. Слоты не менялись.';
  const existing=await store.getActiveResearchPlan();
  if(existing?.status==='blocked')return `Применение остановлено на слоте ${existing.failedSlot??'?'}. Повторная запись заблокирована до проверки фактического состояния через API. /positions — текущие настройки.`;
  if(existing?.status==='applying'){
   await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research-apply',run:existing.id,index:existing.index},{idempotencyKey:'apply:'+existing.id+':resume:'+existing.index+':'+Math.floor(Date.now()/60000),retentionSeconds:604800});
   return 'Применение полного портфеля уже выполняется.';
  }
  const research=await store.getResearchRun();
  // The approved composition and ceilings remain fixed. Fresh complete sales,
  // offers and account balance are required by applyPortfolioSlot before EVERY
  // write, including when the owner activates a morning plan in the evening.
  if(research?.scope!=='Black'||research?.collectionCaps?.['Chill Flame']!==3||research?.status!=='completed'||research.selected?.length!==28)throw Error('FRESH_FULL_RESEARCH_REQUIRED');
  if(existing?.id===research.id)return 'Этот портфель уже применён. Проверьте /positions.';
  const response=await readSatellite('/user/subscriptions',{},key,'token');
  if(!response.ok||!Array.isArray(response.data))throw Error('ACCOUNT_READ_FAILED');
  if(research.preserveExisting&&research.selected.filter(r=>r.retained).some(r=>!response.data.some(s=>fits(s,r)&&s.portalsAutobuy===true&&s.portalsAutobuyQuantity===1&&Math.abs(Number(s.portalsAutobuyMaxPrice)-r.ceiling)<.001)))throw Error('PRESERVED_SLOT_CHANGED');
  const plan={id:research.id,status:'applying',index:0,rows:assignResearchSlots(research.selected,response.data),results:[]};
  if(await store.isPaused())throw Error('AUTOMATION_PAUSED');
  // Publish the canonical plan before the first financial write. Daily uses it
  // instead of the legacy environment plan, so it cannot restore old models.
  await store.saveActiveResearchPlan(plan);
  await store.releaseCatalogLease(lease);
  await enqueue('catalog-scan',{kind:'research-apply',run:plan.id,index:0},{idempotencyKey:'apply:'+plan.id+':0',retentionSeconds:604800});
  return 'Запущено применение 28 слотов. Перед каждой записью заново проверяются рынок, баланс и пауза; результат читается из API.';
 }finally{await store.releaseCatalogLease(lease);}
}
export async function processResearchApply(message,{store,key,send,enqueue,apply=applyPortfolioSlot}){
 const lease=await store.acquireCatalogLease();if(!lease)throw Error('BUSY');
 try{
  const plan=await store.getActiveResearchPlan();if(!plan||plan.id!==message.run||plan.status!=='applying')return;
  if(await store.isPaused())return;
  if(plan.index===message.index){
   const row=plan.rows[plan.index];
   const block=async()=>{
    plan.status='blocked';plan.failedSlot=row.slot;await store.saveActiveResearchPlan(plan);
    await send(`Применение остановлено на слоте ${row.slot}. Успешно проверено ранее: ${plan.results.length}. Результат текущей попытки требует чтения API; повторное включение не выполняется. /positions — фактические настройки.`);
   };
   if(plan.inFlight===plan.index){await block();return;}
   // Persist before attempting the operation: a crash or unverified write must
   // never silently re-arm an order which may already have bought one gift.
   plan.inFlight=plan.index;await store.saveActiveResearchPlan(plan);
   let result;
   try{result=row.preserveExisting?{slot:row.slot,changed:false,reason:'PRESERVED_EXISTING',price:row.ceiling}:await apply(row.slot,key,{portfolio:plan.rows,allowManualActivation:true,allowApprovedReplacement:true,beforeWrite:async()=>{if(await store.isPaused())throw Error('AUTOMATION_PAUSED');}});}
   catch(error){
    if(error?.message==='AUTOMATION_PAUSED'){delete plan.inFlight;await store.saveActiveResearchPlan(plan);return;}
    await block();return;
   }
   delete plan.inFlight;
   plan.results.push(result);plan.index++;plan.status=plan.index===28?'completed':'applying';
   await store.saveActiveResearchPlan(plan);
   if(plan.status==='completed'){
    const verified=await readSatellite('/user/subscriptions',{},key,'token');
    const active=verified.ok&&Array.isArray(verified.data)?plan.rows.filter(r=>verified.data.some(s=>s._id===r.subscriptionId&&fits(s,r)&&s.portalsAutobuy===true&&s.portalsAutobuyQuantity===1)).length:null;
    await send(`Полный портфель: проверено 28 слотов; активных совпадений ${active??'не удалось проверить'}/28. Изменено ${plan.results.filter(r=>r.changed).length}. /positions — фактические настройки. Лимиты пересчитаны по рынку и проверены API.`);
   }
  }
  if(plan.status==='applying'){
   await store.releaseCatalogLease(lease);
   await enqueue('catalog-scan',{kind:'research-apply',run:plan.id,index:plan.index},{idempotencyKey:'apply:'+plan.id+':'+plan.index,retentionSeconds:604800});
  }
 }finally{await store.releaseCatalogLease(lease);}
}
