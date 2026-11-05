import { readVariant } from './variants.js';
import { readCrossMarket } from './cross.js';
import { competitivePrice } from './competitive.js';

export function rankCatalog(rows,balance,runId){
 return rows.filter(r=>r&&r.runId===runId).flatMap(r=>(r.combinations||[]).filter(c=>c.day?.count>=3&&c.week?.count>=8&&c.day.q1>0&&c.day.q1<=balance).map(c=>({...c,collection:r.collection,complete:r.complete})))
 .sort((a,b)=>b.day.count-a.day.count||b.week.count-a.week.count||a.collection.localeCompare(b.collection));
}
export async function catalogReview(index,{store,key,readProfile}){
 const run=await store.getCatalogRun();if(!run?.total)throw new Error('NO_CATALOG');
 const profile=await readProfile();if(!profile.ok)throw new Error('NO_BALANCE');
 const balance=Number(profile.data.tonBalance);if(!Number.isFinite(balance)||balance<=0)throw new Error('INVALID_BALANCE');
 const rows=await store.getCatalogRows(run.total),ranked=rankCatalog(rows,balance,run.id);
 const heading=`Каталог ${run.checked}/${run.total}; баланс ${balance.toFixed(2)} TON; кандидатов ${ranked.length}. Снимок ${new Date(run.startedAt).toISOString()}.`;
 if(index===null)return [heading,...ranked.slice(0,12).map((r,i)=>`${i}. ${r.collection} | ${r.model} | ${r.backdrop}: сутки ${r.day.count}, неделя ${r.week.count}${r.complete?'':'+'}; Q1 ${r.day.q1.toFixed(2)} TON`),'Неполные выборки — только кандидаты. /catalogreview N проверяет точную историю и предложения. Слоты не менялись.'].join('\n');
 if(!Number.isInteger(index)||index<0||!ranked[index])throw new Error('INVALID_INDEX');
 const r=ranked[index],history=await readVariant(r.collection,r.model,r.backdrop,key,{maxPages:100});
 if(!history.ok||!history.complete)return `${r.collection} | ${r.model} | ${r.backdrop}: точная история не завершена; рекомендация покупки не сформирована.`;
 const market=await readCrossMarket(r.collection,key,undefined,undefined,r.backdrop,r.model);
 const lines=[heading,`${r.collection} | ${r.model} | ${r.backdrop}`,`Продажи сутки/неделя: ${history.day.count}/${history.week.count}; Q1 ${history.day.q1}/${history.week.q1}; медиана ${history.day.median}/${history.week.median}.`,...market.rows.map(m=>`${m.market}: ${m.error||m.floor||'нет предложений'}${m.error?'':' TON; листингов '+m.count}`)];
 const floors=market.rows.map(m=>m.floor).filter(v=>Number.isFinite(v)&&v>0);
 if(market.ok&&floors.length&&history.day.count>=3&&history.week.count>=8){
 const price=competitivePrice({ceiling:balance/1.03,day:history.day.q1,week:history.week.q1,floor:Math.min(...floors)});
 lines.push(`Расчётный предел ${price.toFixed(2)} TON. Допущения: покупка 3%, продажа 2%, запас 1.5 TON. Требуется подтверждение действующих комиссий и владельца.`);
 }else lines.push('Недостаточно подтверждений для цены входа.');
 return [...lines,'Только анализ. Слоты не менялись.'].join('\n');
}
