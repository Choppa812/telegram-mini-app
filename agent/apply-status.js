import {readSatellite} from './satellite.js';
export async function applyStatus({store,key,reader=readSatellite}){
 const plan=await store.getActiveResearchPlan?.();
 if(!plan)return null;
 const response=await reader('/user/subscriptions',{},key,'token');
 if(!response.ok||!Array.isArray(response.data))throw Error('ACCOUNT_READ_FAILED');
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const actual=new Map(response.data.map(s=>[s._id,s])),results=new Map((plan.results||[]).map(r=>[r.slot,r]));
 let active=0,chill=0;const lines=[];
 const reasons={INSUFFICIENT_EXACT_SALES:'недостаточно продаж',BALANCE_INSUFFICIENT_FOR_SINGLE_PURCHASE:'недостаточно баланса',AWAITING_MANUAL_ACTIVATION:'ожидает применения'};
 for(const r of plan.rows){
  const s=actual.get(r.subscriptionId),match=s&&s.collectionName===r.collection&&same(s.modelNames,[r.model])&&same(s.backdropNames,[r.backdrop]);
  const enabled=match&&s.portalsAutobuy===true&&s.portalsAutobuyQuantity===1;
  if(enabled){active++;if(r.collection==='Chill Flame')chill++;}
  const result=results.get(r.slot);
  const detail=enabled?`${Number(s.portalsAutobuyMaxPrice).toFixed(2)} TON × 1`:s?.portalsAutobuy===true?'активные настройки отличаются от плана':reasons[result?.reason]||'не включён';
  lines.push(`${r.slot}. ${r.collection} / ${r.model}: ${detail}`);
 }
 return [`Применение плана: ${plan.status}; обработано ${plan.index}/${plan.rows.length}.`,
  `Проверено сейчас через API: активных ${active}/${plan.rows.length}, Chill Flame ${chill}. Все активные совпадения имеют фон Black.`,
  ...(plan.failedSlot?[`Требуется проверка попытки в слоте ${plan.failedSlot}; повторная запись заблокирована.`]:[]),
  ...lines,'Чтение без изменений.'].join('\n');
}
