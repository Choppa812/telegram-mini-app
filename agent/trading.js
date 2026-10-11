import { readSatellite } from './satellite.js';

const BASE = 'https://gift-satellite.dev/api';
export const BLACK_PLAN = [
  { collection: 'Vice Cream', models: ['Birthday', 'Sushi', 'Bamboo Ice', 'Pine Cone', 'Cavendish', 'Vanilla'], ceiling: 15.79 },
  { collection: 'Chill Flame', models: ['Signal Flare', 'Olympia', 'Ionic Column', 'Eternal Flame', 'Oil Lamp'], ceiling: 17.44 },
];

function subscriptionBody(slot, plan, price) {
  const keys = ['subscriptionName','collectionName','numberPattern','portalsNotifyMaxPrice','notifyTg','notifyPortals','notifyTonnel','notifyMrkt','notifyGetgems','portalsAutobuy','portalsAutobuyQuantity','autobuyTg','autobuyPortals','autobuyTonnel','autobuyMrkt','forwardToChat','forwardToTopic'];
  const body = Object.fromEntries(keys.filter(key => slot[key] !== undefined).map(key => [key,slot[key]]));
  return { ...body, modelNames:plan.models, backdropNames:['Black'], portalsAutobuyMaxPrice:price };
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
  for (const market of ['portals','mrkt']) {
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
  if(!response.ok)throw new Error(`UPDATE_${response.status}`);
}

export async function applyBlackPlan(key, {beforeWrite, fetcher=fetch, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  if(!key||typeof beforeWrite!=='function')throw new Error('TRADING_CONFIGURATION_MISSING');
  const result={checked:0,changed:0,skipped:0,details:[]};
  const [slotsResult,profileResult]=await Promise.all([readSatellite('/user/subscriptions',{},key,'token',fetcher),readSatellite('/user/me',{},key,'token',fetcher)]);
  if(!slotsResult.ok||!Array.isArray(slotsResult.data)||!profileResult.ok)throw new Error('ACCOUNT_READ_FAILED');
  const slots=slotsResult.data,profile=profileResult.data;
  if(profile.isAutobuyEnabled!==true)throw new Error('GLOBAL_AUTOBUY_DISABLED');
  const available=Number(profile.tonBalance);
  if(!Number.isFinite(available)||available<36)throw new Error('BALANCE_BELOW_PLAN');
  for(const plan of BLACK_PLAN){
    result.checked++;
    const matches=slots.filter(s=>s.collectionName===plan.collection&&Array.isArray(s.backdropNames)&&s.backdropNames.length===1&&s.backdropNames[0]==='Black');
    if(matches.length!==1)throw new Error(`SLOT_NOT_UNIQUE_${plan.collection}`);
    const slot=matches[0];
    if(slot.portalsAutobuy!==true||slot.portalsAutobuyQuantity!==1)throw new Error(`SLOT_NOT_READY_${plan.collection}`);
    const floor=await blackFloor(plan.collection,key,fetcher);
    const price=Math.floor(Math.min(plan.ceiling,floor-5)*100)/100;
    if(!Number.isFinite(price)||price<=0)throw new Error('INVALID_PRICE');
    const samePrice=Math.abs(Number(slot.portalsAutobuyMaxPrice)-price)<0.001;
    const sameModels=JSON.stringify(slot.modelNames||[])===JSON.stringify(plan.models);
    if(samePrice&&sameModels){result.skipped++;result.details.push(`${plan.collection}: без изменений, ${price.toFixed(2)} TON, floor ${floor.toFixed(2)}`);continue;}
    const body=subscriptionBody(slot,plan,price);
    await beforeWrite();
    await writeSubscription(slot._id,body,key,fetcher);
    await pause(600);
    const verify=await readSatellite('/user/subscriptions',{},key,'token',fetcher);
    const current=verify.ok&&Array.isArray(verify.data)?verify.data.find(s=>s._id===slot._id):null;
    if(!current||Math.abs(Number(current.portalsAutobuyMaxPrice)-price)>0.001||JSON.stringify(current.modelNames)!==JSON.stringify(plan.models)||JSON.stringify(current.backdropNames)!=='["Black"]')throw new Error(`UPDATE_NOT_VERIFIED_${plan.collection}`);
    result.changed++;
    result.details.push(`${plan.collection}: ${Number(slot.portalsAutobuyMaxPrice).toFixed(2)} → ${price.toFixed(2)} TON; ${plan.models.length} моделей; floor ${floor.toFixed(2)}`);
    await pause(600);
  }
  return result;
}
