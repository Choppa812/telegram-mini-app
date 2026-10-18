import { readSatellite } from './satellite.js';
import { readVariant } from './variants.js';
import { readCrossMarket } from './cross.js';
import { subscriptionBody, writeSubscription } from './trading.js';

// The user's slot assignments and trading limits are stored only in a private
// Vercel environment variable, never in the public repository.
export function loadPortfolio(raw=process.env.PRIVATE_PORTFOLIO_PLAN) {
  let rows;
  try { rows=JSON.parse(raw); } catch { throw new Error('PRIVATE_PORTFOLIO_PLAN_MISSING'); }
  if(!Array.isArray(rows)||rows.length!==21)throw new Error('INVALID_PRIVATE_PORTFOLIO_PLAN');
  const slots=new Set();
  for(const row of rows){
    if(!Number.isInteger(row.slot)||row.slot<1||row.slot>28||slots.has(row.slot)||
       !['original','collection','model'].every(key=>typeof row[key]==='string'&&row[key].length>1&&row[key].length<81)||
       !Number.isFinite(row.ceiling)||row.ceiling<=0||!Number.isInteger(row.minWeek)||row.minWeek<3)
      throw new Error('INVALID_PRIVATE_PORTFOLIO_PLAN');
    slots.add(row.slot);
  }
  return rows;
}

const roundDown = number => Math.floor((number + 1e-9) * 100) / 100;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export async function applyPortfolioSlot(slotNumber, key, {
  beforeWrite, fetcher=fetch, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  variantReader=readVariant, marketReader=readCrossMarket, portfolio=loadPortfolio(),
}={}) {
  const plan=portfolio.find(item=>item.slot===slotNumber);
  if(!plan||!key||typeof beforeWrite!=='function')throw new Error('PORTFOLIO_CONFIGURATION_MISSING');
  const [slotsResponse,profileResponse]=await Promise.all([
    readSatellite('/user/subscriptions',{},key,'token',fetcher),
    readSatellite('/user/me',{},key,'token',fetcher),
  ]);
  if(!slotsResponse.ok||!Array.isArray(slotsResponse.data)||!profileResponse.ok)throw new Error('ACCOUNT_READ_FAILED');
  if(profileResponse.data?.isAutobuyEnabled!==true)throw new Error('GLOBAL_AUTOBUY_DISABLED');
  const slot=slotsResponse.data[slotNumber-1];
  if(!slot||slot.collectionName!==plan.original&&!(slot.collectionName===plan.collection&&same(slot.modelNames,[plan.model])&&same(slot.backdropNames,['Black'])))throw new Error('SLOT_CHANGED');
  if(slot.portalsAutobuy===true&&slot.collectionName!==plan.collection)throw new Error('SLOT_ALREADY_ACTIVE');
  if(slot.portalsAutobuy===true&&!same(slot.modelNames,[plan.model]))throw new Error('ACTIVE_MODELS_CHANGED');
  if(slot.portalsAutobuyQuantity>1)throw new Error('SLOT_QUANTITY_CHANGED');
  const history=await variantReader(plan.collection,plan.model,'Black',key,{fetcher,pause});
  if(!history?.ok||!history.complete)throw new Error('EXACT_SALES_UNAVAILABLE');
  if(history.week.count<plan.minWeek||history.day.count<2||!Number.isFinite(history.week.q1)){
    if(slot.portalsAutobuy!==true)return {slot:slotNumber,changed:false,reason:'INSUFFICIENT_EXACT_SALES'};
    const body=subscriptionBody(slot,{models:[plan.model]},slot.portalsAutobuyMaxPrice);
    Object.assign(body,{portalsAutobuy:false,portalsAutobuyQuantity:0,autobuyTg:false,autobuyPortals:false,autobuyTonnel:false,autobuyMrkt:false});
    const latest=await readSatellite('/user/subscriptions',{},key,'token',fetcher);
    const current=latest.ok&&Array.isArray(latest.data)?latest.data[slotNumber-1]:null;
    if(!current||current._id!==slot._id||current.portalsAutobuy!==true||!same(current.modelNames,[plan.model]))throw new Error('SLOT_CHANGED_DURING_ANALYSIS');
    await beforeWrite();
    await writeSubscription(slot._id,body,key,fetcher);
    await pause(600);
    const verify=await readSatellite('/user/subscriptions',{},key,'token',fetcher);
    const saved=verify.ok&&Array.isArray(verify.data)?verify.data.find(item=>item._id===slot._id):null;
    if(!saved||saved.portalsAutobuy!==false||saved.portalsAutobuyQuantity!==0)throw new Error('DISABLE_NOT_VERIFIED');
    return {slot:slotNumber,changed:true,collection:plan.collection,model:plan.model,disabled:true,reason:'INSUFFICIENT_EXACT_SALES'};
  }
  const market=await marketReader(plan.collection,key,fetcher,pause,'Black',plan.model);
  if(!market?.ok||market.model!==plan.model||market.backdrop!=='Black'||!Array.isArray(market.rows)||market.rows.length!==5)
    throw new Error('EXACT_MARKET_UNAVAILABLE');
  const floors=market.rows.map(row=>Number(row.floor)).filter(value=>Number.isFinite(value)&&value>0);
  if(!floors.length)throw new Error('EXACT_MARKET_EMPTY');
  const floor=Math.min(...floors);
  const price=roundDown(Math.min(plan.ceiling,(history.week.q1*.92-3)/1.03,floor-2));
  if(!Number.isFinite(price)||price<=0)throw new Error('INVALID_PRICE');
  const [latestSlots,latestProfile]=await Promise.all([
    readSatellite('/user/subscriptions',{},key,'token',fetcher),
    readSatellite('/user/me',{},key,'token',fetcher),
  ]);
  if(!latestSlots.ok||!Array.isArray(latestSlots.data)||!latestProfile.ok)throw new Error('ACCOUNT_REREAD_FAILED');
  const current=latestSlots.data[slotNumber-1],balance=Number(latestProfile.data?.tonBalance);
  if(!current||current._id!==slot._id||current.collectionName!==slot.collectionName||current.portalsAutobuy!==slot.portalsAutobuy)throw new Error('SLOT_CHANGED_DURING_ANALYSIS');
  if(!Number.isFinite(balance))throw new Error('INVALID_BALANCE');
  if(balance<price*1.03)return {slot:slotNumber,changed:false,reason:'BALANCE_INSUFFICIENT_FOR_SINGLE_PURCHASE'};
  const body=subscriptionBody(current,{models:[plan.model]},price);
  Object.assign(body,{subscriptionName:`${plan.collection} / ${plan.model} / Black`,collectionName:plan.collection,
    modelNames:[plan.model],backdropNames:['Black'],symbolNames:[],portalsAutobuy:true,portalsAutobuyQuantity:1,
    autobuyTg:true,autobuyPortals:true,autobuyTonnel:true,autobuyMrkt:true});
  if(current.portalsAutobuy===true&&current.collectionName===plan.collection&&
     Math.abs(Number(current.portalsAutobuyMaxPrice)-price)<.001&&same(current.modelNames,[plan.model])&&same(current.backdropNames,['Black']))
    return {slot:slotNumber,changed:false,reason:'ALREADY_SET',price};
  await beforeWrite();
  await writeSubscription(current._id,body,key,fetcher);
  await pause(600);
  const verify=await readSatellite('/user/subscriptions',{},key,'token',fetcher);
  const saved=verify.ok&&Array.isArray(verify.data)?verify.data.find(item=>item._id===current._id):null;
  if(!saved||saved.collectionName!==plan.collection||!same(saved.modelNames,[plan.model])||!same(saved.backdropNames,['Black'])||
     saved.portalsAutobuy!==true||saved.portalsAutobuyQuantity!==1||Math.abs(Number(saved.portalsAutobuyMaxPrice)-price)>.001)
    throw new Error('PORTFOLIO_WRITE_NOT_VERIFIED');
  return {slot:slotNumber,changed:true,collection:plan.collection,model:plan.model,price,floor,
    daySales:history.day.count,weekSales:history.week.count,balance};
}

export async function applyPortfolio(key, options={}) {
  const result={checked:0,changed:0,skipped:0,details:[]};
  const portfolio=options.portfolio||loadPortfolio();
  const selected=options.batch===undefined?portfolio:portfolio.slice(options.batch*3,options.batch*3+3);
  if(!selected.length)throw new Error('INVALID_PORTFOLIO_BATCH');
  for(const plan of selected){
    const row=await applyPortfolioSlot(plan.slot,key,{...options,portfolio});
    result.checked++;
    if(row.changed)result.changed++;else result.skipped++;
    result.details.push(row.changed
      ? row.disabled ? `#${row.slot} ${row.collection} / ${row.model}: выключен — мало точных продаж`
      : `#${row.slot} ${row.collection} / ${row.model} / Black: ${row.price.toFixed(2)} TON; ${row.daySales}/${row.weekSales} продаж`
      : `#${row.slot} ${plan.collection} / ${plan.model}: ${row.reason}`);
  }
  return result;
}
