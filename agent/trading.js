import { readSatellite } from './satellite.js';
import { readBlackModels } from './planning.js';

const BASE = 'https://gift-satellite.dev/api';
export const BLACK_PLAN = [
  { collection: 'Vice Cream', models: ['Bamboo Ice', 'Birthday', 'Cherry On Top', 'Iceman', 'Mermaid', 'Dreamland'], ceiling: 15.34, minModelSales:2, maxModels:6 },
  { collection: 'Chill Flame', models: ['Dungeon', 'Tribal Totem', 'Dark Relic', 'Druid Flame', 'Birthday Cake'], ceiling: 17.13, minModelSales:2, maxModels:5 },
  { collection: 'Xmas Stocking', models: ['Frozen Moss', 'Toffee', 'Cherry', 'Poison Ivy'], ceiling: 15.94, minModelSales:2, maxModels:4 },
  { collection: 'B-Day Candle', sourceCollection: 'Record Player', models: ['Be Awesome!', 'Fresh Mint', 'Best Wishes'], ceiling: 15.81, minModelSales:2, maxModels:3 },
  { collection: 'Lol Pop', sourceCollection: 'Snoop Dogg', models: ['Cosmic Green', 'Spectrum', 'Old Liqueur', 'Holidaze'], ceiling: 20.00, minModelSales:3, maxModels:4 },
  { collection: 'Instant Ramen', models: ['Chicken', 'Sunny Loops', 'Spicy Beef', 'Classic Ramen', 'Sacred Grove'], ceiling: 15.50, minModelSales:3, maxModels:5 },
];
const RETIRED_COLLECTIONS = ['Whip Cupcake'];

function subscriptionBody(slot, plan, price) {
  const keys = ['subscriptionName','collectionName','numberPattern','portalsNotifyMaxPrice','notifyTg','notifyPortals','notifyTonnel','notifyMrkt','notifyGetgems','portalsAutobuy','portalsAutobuyQuantity','autobuyTg','autobuyPortals','autobuyTonnel','autobuyMrkt','forwardToChat','forwardToTopic'];
  const body = Object.fromEntries(keys.filter(key => slot[key] !== undefined).map(key => [key,slot[key]]));
  if(typeof body.numberPattern!=='string'||!/^[A-Za-z0-9]{1,6}$/.test(body.numberPattern))delete body.numberPattern;
  for(const optional of ['forwardToChat','forwardToTopic'])if(body[optional]===''||body[optional]===null)delete body[optional];
  return { ...body, modelNames:plan.models, backdropNames:['Black'], symbolNames:slot.symbolNames||[], portalsAutobuyMaxPrice:price };
}

export async function cleanBlackBatch(key, batch, {beforeWrite,fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  if(!key||typeof beforeWrite!=='function'||!Number.isInteger(batch)||batch<0||batch>10)throw new Error('CLEAN_CONFIGURATION_MISSING');
  const response=await readSatellite('/user/subscriptions',{},key,'token',fetcher);
  if(!response.ok||!Array.isArray(response.data))throw new Error('ACCOUNT_READ_FAILED');
  const keep=new Set(BLACK_PLAN.map(p=>p.collection));
  const legacy=response.data.filter(s=>!keep.has(s.collectionName)||JSON.stringify(s.backdropNames)!=='["Black"]');
  const selected=legacy.slice(batch*4,batch*4+4);
  const details=[];
  for(const slot of selected){
    if(slot.portalsAutobuy!==true){details.push(`${slot.collectionName}: уже выключен`);continue;}
    const body=subscriptionBody(slot,{models:slot.modelNames||[]},slot.portalsAutobuyMaxPrice);
    body.backdropNames=slot.backdropNames||[];
    body.portalsAutobuy=false;
    await beforeWrite();
    await writeSubscription(slot._id,body,key,fetcher);
    await pause(600);
    const verify=await readSatellite('/user/subscriptions',{},key,'token',fetcher);
    const current=verify.ok&&Array.isArray(verify.data)?verify.data.find(s=>s._id===slot._id):null;
    if(!current||current.portalsAutobuy!==false)throw new Error(`CLEAN_NOT_VERIFIED_${slot.collectionName}`);
    details.push(`${slot.collectionName}: автобай выключен`);
    await pause(600);
  }
  return {batch,totals:legacy.length,processed:selected.length,remaining:Math.max(0,legacy.length-(batch+1)*4),details};
}

async function blackFloor(collection, key, fetcher) {
  const prices=[];
  for (const market of ['tg','portals','tonnel','mrkt','getgems']) {
    const url=new URL(`${BASE}/search/${market}/${encodeURIComponent(collection)}`);
    url.searchParams.set('backdrops','Black');
    const response=await fetcher(url,{method:'GET',headers:{Authorization:`Token ${key}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`MARKET_${response.status}`);
    const rows=await response.json();
    if(!Array.isArray(rows))throw new Error('INVALID_MARKET');
    for(const row of rows){
      if(row.backdropName!=='Black')throw new Error('INVALID_MARKET_BACKDROP');
      const price=Number(row.normalizedPrice);
      if((!row.currency||row.currency==='ton')&&Number.isFinite(price)&&price>0)prices.push(price);
    }
  }
  if(!prices.length)throw new Error('BLACK_MARKET_EMPTY');
  return Math.min(...prices);
}

async function writeSubscription(id, body, key, fetcher) {
  if(!/^[a-f0-9]{24}$/i.test(id||''))throw new Error('INVALID_SUBSCRIPTION_ID');
  const response=await fetcher(new URL(`${BASE}/user/update-subscription/${id}`),{method:'PUT',headers:{Authorization:`Token ${key}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok){
    let detail='';
    try { const body=await response.json(); detail=String(body?.message||body?.error||JSON.stringify(body)).replaceAll(key,'[REDACTED]').replace(/[^\p{L}\p{N} _.,:;()\[\]-]/gu,'').slice(0,120); } catch {}
    throw new Error(`UPDATE_${response.status}${detail?`_${detail}`:''}`);
  }
}

export async function applyBlackPlan(key, {beforeWrite, fetcher=fetch, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)), modelReader=readBlackModels}={}) {
  if(!key||typeof beforeWrite!=='function')throw new Error('TRADING_CONFIGURATION_MISSING');
  const result={checked:0,changed:0,skipped:0,details:[]};
  const [slotsResult,profileResult]=await Promise.all([readSatellite('/user/subscriptions',{},key,'token',fetcher),readSatellite('/user/me',{},key,'token',fetcher)]);
  if(!slotsResult.ok||!Array.isArray(slotsResult.data)||!profileResult.ok)throw new Error('ACCOUNT_READ_FAILED');
  const slots=slotsResult.data,profile=profileResult.data;
  const available=Number(profile.tonBalance);
  if(!Number.isFinite(available)||available<0)throw new Error('INVALID_BALANCE');
  if(profile.isAutobuyEnabled!==true)return {checked:BLACK_PLAN.length,changed:0,skipped:BLACK_PLAN.length,details:['Глобальная автопокупка выключена; лимиты не изменялись.']};
  const plannedNames=new Set(BLACK_PLAN.map(plan=>plan.collection));
  const otherExposure=slots.filter(slot=>slot.portalsAutobuy===true&&!plannedNames.has(slot.collectionName))
    .reduce((sum,slot)=>sum+Number(slot.portalsAutobuyMaxPrice||0)*Number(slot.portalsAutobuyQuantity||0),0);
  const maximumExposure=(otherExposure+BLACK_PLAN.reduce((sum,plan)=>sum+plan.ceiling,0))*1.03;
  if(!Number.isFinite(maximumExposure)||maximumExposure>available+0.0001)
    return {checked:BLACK_PLAN.length,changed:0,skipped:BLACK_PLAN.length,details:[`Баланс ${available.toFixed(2)} TON недостаточен для плана с резервом комиссии (${maximumExposure.toFixed(2)} TON); слоты не менялись.`]};
  async function verifyBudgetBeforeWrite(slot, body) {
    const [latestSlots,latestProfile]=await Promise.all([readSatellite('/user/subscriptions',{},key,'token',fetcher),readSatellite('/user/me',{},key,'token',fetcher)]);
    if(!latestSlots.ok||!Array.isArray(latestSlots.data)||!latestProfile.ok)throw new Error('ACCOUNT_REREAD_FAILED');
    const current=latestSlots.data.find(s=>s._id===slot._id);
    if(!current||current.collectionName!==slot.collectionName||current.portalsAutobuy!==slot.portalsAutobuy)throw new Error('SLOT_CHANGED_DURING_ANALYSIS');
    const currentBalance=Number(latestProfile.data?.tonBalance);
    if(!Number.isFinite(currentBalance)||currentBalance<0)throw new Error('INVALID_BALANCE');
    let exposure=0;
    for(const s of latestSlots.data){
      const proposed=s._id===slot._id?body:s;
      if(proposed.portalsAutobuy!==true)continue;
      const price=Number(proposed.portalsAutobuyMaxPrice),quantity=Number(proposed.portalsAutobuyQuantity);
      if(!Number.isFinite(price)||price<0||!Number.isInteger(quantity)||quantity<1)throw new Error('INVALID_ACTIVE_SLOT');
      exposure+=price*quantity;
    }
    if(exposure*1.03>currentBalance+0.0001)throw new Error('BALANCE_CHANGED_BEFORE_WRITE');
  }
  async function disable(slot, reason) {
    const body=subscriptionBody(slot,{models:slot.modelNames||[]},slot.portalsAutobuyMaxPrice);
    Object.assign(body,{portalsAutobuy:false,portalsAutobuyQuantity:0,autobuyTg:false,autobuyPortals:false,autobuyTonnel:false,autobuyMrkt:false});
    await verifyBudgetBeforeWrite(slot,body);
    await beforeWrite();
    await writeSubscription(slot._id,body,key,fetcher);
    await pause(600);
    const verify=await readSatellite('/user/subscriptions',{},key,'token',fetcher);
    const current=verify.ok&&Array.isArray(verify.data)?verify.data.find(s=>s._id===slot._id):null;
    if(!current||current.portalsAutobuy!==false||current.portalsAutobuyQuantity!==0)throw new Error(`DISABLE_NOT_VERIFIED_${slot.collectionName}`);
    result.changed++;
    result.details.push(`${slot.collectionName}: автобай выключен — ${reason}`);
    await pause(600);
  }
  for(const collection of RETIRED_COLLECTIONS){
    const matches=slots.filter(s=>s.collectionName===collection&&JSON.stringify(s.backdropNames)==='["Black"]');
    if(matches.length>1)throw new Error(`SLOT_NOT_UNIQUE_${collection}`);
    if(matches[0]?.portalsAutobuy===true){result.checked++;await disable(matches[0],'нет подтверждённой ликвидности текущих моделей Black');}
  }
  for(const plan of BLACK_PLAN){
    result.checked++;
    const matches=slots.filter(s=>s.collectionName===plan.collection&&Array.isArray(s.backdropNames)&&s.backdropNames.length===1&&s.backdropNames[0]==='Black');
    if(matches.length>1)throw new Error(`SLOT_NOT_UNIQUE_${plan.collection}`);
    const source=!matches.length&&plan.sourceCollection?slots.filter(s=>s.collectionName===plan.sourceCollection&&s.portalsAutobuy===false&&s.portalsAutobuyQuantity===0):[];
    if(!matches.length&&source.length!==1)throw new Error(`SLOT_NOT_UNIQUE_${plan.collection}`);
    const slot=matches[0]||source[0];
    const activation=source.length===1||(slot.portalsAutobuy===false&&slot.portalsAutobuyQuantity===0);
    if(!activation&&(slot.portalsAutobuy!==true||slot.portalsAutobuyQuantity!==1)){result.skipped++;result.details.push(`${plan.collection}: слот выключен или лимит покупок исчерпан`);continue;}
    const floor=await blackFloor(plan.collection,key,fetcher);
    const history=await modelReader(plan.collection,key,fetcher,new Date(),pause);
    const candidates=history?.ok&&history.complete&&history.total>=20
      ?history.rows.filter(row=>plan.models.includes(row.model)&&row.count>=plan.minModelSales&&Number.isFinite(row.p25)&&row.p25>0)
        .sort((a,b)=>b.count-a.count||b.p25-a.p25||a.model.localeCompare(b.model,'en'))
        .slice(0,plan.maxModels)
      :[];
    if(!candidates.length){
      if(slot.portalsAutobuy===true)await disable(slot,'недостаточно проверенных продаж моделей Black');
      else {result.skipped++;result.details.push(`${plan.collection}: недостаточно проверенных продаж моделей Black`);}
      continue;
    }
    const modelLimit=Math.floor(((Math.min(...candidates.map(row=>row.p25))*0.95-3)/1.03)*100)/100;
    const price=Math.floor(Math.min(plan.ceiling,modelLimit,floor-2)*100)/100;
    if(!Number.isFinite(price)||price<=0)throw new Error('INVALID_PRICE');
    if(available<price*1.03){result.skipped++;result.details.push(`${plan.collection}: недостаточный баланс для лимита ${price.toFixed(2)} TON`);continue;}
    const models=candidates.filter(row=>row.p25*0.95-price*1.03>=3).map(row=>row.model);
    if(!models.length){
      if(slot.portalsAutobuy===true)await disable(slot,'нет моделей с достаточным запасом после расходов');
      else {result.skipped++;result.details.push(`${plan.collection}: нет моделей с достаточным запасом после расходов`);}
      continue;
    }
    const samePrice=Math.abs(Number(slot.portalsAutobuyMaxPrice)-price)<0.001;
    const sameModels=JSON.stringify(slot.modelNames||[])===JSON.stringify(models);
    if(!activation&&samePrice&&sameModels){result.skipped++;result.details.push(`${plan.collection}: без изменений, ${price.toFixed(2)} TON, floor ${floor.toFixed(2)}`);continue;}
    const body=subscriptionBody(slot,{models},price);
    if(activation){Object.assign(body,{subscriptionName:`${plan.collection} Black`,collectionName:plan.collection,portalsAutobuy:true,portalsAutobuyQuantity:1,symbolNames:[],autobuyTg:true,autobuyPortals:true,autobuyTonnel:true,autobuyMrkt:true});}
    await verifyBudgetBeforeWrite(slot,body);
    await beforeWrite();
    await writeSubscription(slot._id,body,key,fetcher);
    await pause(600);
    const verify=await readSatellite('/user/subscriptions',{},key,'token',fetcher);
    const current=verify.ok&&Array.isArray(verify.data)?verify.data.find(s=>s._id===slot._id):null;
    if(!current||current.collectionName!==plan.collection||current.portalsAutobuy!==true||current.portalsAutobuyQuantity!==1||Math.abs(Number(current.portalsAutobuyMaxPrice)-price)>0.001||JSON.stringify(current.modelNames)!==JSON.stringify(models)||JSON.stringify(current.backdropNames)!=='["Black"]')throw new Error(`UPDATE_NOT_VERIFIED_${plan.collection}`);
    result.changed++;
    result.details.push(`${plan.collection}: ${activation?'новый слот':`${Number(slot.portalsAutobuyMaxPrice).toFixed(2)} →`} ${price.toFixed(2)} TON; ${models.length} моделей; floor ${floor.toFixed(2)}; Black-сделок ${history?.total??'?'}`);
    await pause(600);
  }
  return result;
}
