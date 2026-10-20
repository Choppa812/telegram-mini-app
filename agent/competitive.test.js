import test from 'node:test';
import assert from 'node:assert/strict';
import { competitivePrice } from './competitive.js';
import { applyPortfolioSlot } from './portfolio.js';

test('competitive bid respects completed-sale margin, listing floor and the approved ceiling',()=>{
  assert.equal(competitivePrice({ceiling:18.90,day:22.81,week:22.24,floor:23.97}),18.90);
  assert.equal(competitivePrice({ceiling:25,day:22,week:21,floor:24}),18.52);
  assert.equal(competitivePrice({ceiling:25,day:40,week:40,floor:20}),19.50);
});

test('changed exact model requires the expected previous inactive model',async()=>{
  const plan={slot:17,original:'Chill Flame',previousModel:'Oracle',collection:'Chill Flame',model:'Carousel',ceiling:20.20,minWeek:8,pricing:'competitive'};
  const slots=Array.from({length:28},(_,i)=>({_id:(i+1).toString(16).padStart(24,'0'),collectionName:i===16?'Chill Flame':'Other',modelNames:i===16?['Oracle']:[],backdropNames:['Black'],portalsAutobuy:false,portalsAutobuyQuantity:0}));
  let writes=0;
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return {ok:true,json:async()=>slots};
    if(path.endsWith('/user/me'))return {ok:true,json:async()=>({tonBalance:100,isAutobuyEnabled:true})};
    if(path.includes('/update-subscription/')){Object.assign(slots[16],JSON.parse(options.body));writes++;return {ok:true,json:async()=>({})};}
    throw Error(path);
  };
  const options={portfolio:[plan],fetcher,pause:async()=>{},beforeWrite:async()=>{},variantReader:async()=>({ok:true,complete:true,day:{count:7,q1:23.74},week:{count:11,q1:23.70}}),marketReader:async()=>({ok:true,model:'Carousel',backdrop:'Black',rows:['tg','portals','tonnel','mrkt','getgems'].map(market=>({market,floor:24.38}))})};
  const result=await applyPortfolioSlot(17,'test',options);
  assert.equal(result.price,20.20);assert.equal(writes,1);assert.deepEqual(slots[16].modelNames,['Carousel']);
  const repeated=await applyPortfolioSlot(17,'test',options);
  assert.equal(repeated.reason,'ALREADY_SET');assert.equal(writes,1);
  slots[16].modelNames=['Unrelated'];
  await assert.rejects(applyPortfolioSlot(17,'test',options),/SLOT_CHANGED/);
  assert.equal(writes,1);
});
