import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBlackPlan,cleanBlackBatch } from './trading.js';

const slots=[
  {_id:'aaaaaaaaaaaaaaaaaaaaaaaa',subscriptionName:'Vice',collectionName:'Vice Cream',modelNames:[],backdropNames:['Black'],numberPattern:'',portalsAutobuy:true,portalsAutobuyMaxPrice:13,portalsAutobuyQuantity:1,autobuyTg:true,autobuyPortals:true,autobuyTonnel:true,autobuyMrkt:true},
  {_id:'bbbbbbbbbbbbbbbbbbbbbbbb',subscriptionName:'Chill',collectionName:'Chill Flame',modelNames:[],backdropNames:['Black'],portalsAutobuy:true,portalsAutobuyMaxPrice:12,portalsAutobuyQuantity:1,autobuyTg:true,autobuyPortals:true,autobuyTonnel:true,autobuyMrkt:true},
  {_id:'dddddddddddddddddddddddd',subscriptionName:'Xmas',collectionName:'Xmas Stocking',modelNames:[],backdropNames:['Black'],portalsAutobuy:true,portalsAutobuyMaxPrice:11,portalsAutobuyQuantity:1,autobuyTg:true,autobuyPortals:true,autobuyTonnel:true,autobuyMrkt:true},
];
const floor=path=>path.includes('Vice%20Cream')?20.79:path.includes('Chill%20Flame')?22.44:20.27;
const reply=(data,status=200)=>({ok:status===200,status,json:async()=>data});

test('updates existing Black slots at least five TON below live floor and verifies readback',async()=>{
  const state=structuredClone(slots),writes=[];
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(state);
    if(path.endsWith('/user/me'))return reply({tonBalance:42.23,isAutobuyEnabled:true});
    if(path.includes('/search/'))return reply([{backdropName:'Black',normalizedPrice:floor(path),currency:'ton'}]);
    if(path.includes('/update-subscription/')){
      assert.equal(options.method,'PUT');
      const id=path.split('/').at(-1),body=JSON.parse(options.body),slot=state.find(s=>s._id===id);
      assert.ok(slot);Object.assign(slot,body);writes.push(body);return reply(null);
    }
    throw new Error(path);
  };
  let guards=0;
  const result=await applyBlackPlan('test',{fetcher,beforeWrite:async()=>{guards++;},pause:async()=>{},modelReader:async()=>({ok:false})});
  assert.equal(result.changed,3);assert.equal(guards,3);
  assert.deepEqual(writes.map(x=>x.portalsAutobuyMaxPrice),[15.79,17.44,15.27]);
  assert.deepEqual(writes.map(x=>x.backdropNames),[['Black'],['Black'],['Black']]);
  assert.deepEqual(writes.map(x=>x.modelNames.length),[6,5,4]);
  assert.deepEqual(writes.map(x=>x.symbolNames),[[],[],[]]);
  assert.equal('numberPattern' in writes[0],false);
});

test('pause guard blocks writes',async()=>{
  let writes=0;
  const fetcher=async(url)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(structuredClone(slots));
    if(path.endsWith('/user/me'))return reply({tonBalance:42.23,isAutobuyEnabled:true});
    if(path.includes('/search/'))return reply([{backdropName:'Black',normalizedPrice:25,currency:'ton'}]);
    if(path.includes('/update-subscription/'))writes++;
    return reply(null);
  };
  await assert.rejects(applyBlackPlan('test',{fetcher,beforeWrite:async()=>{throw new Error('AUTOMATION_PAUSED');},pause:async()=>{},modelReader:async()=>({ok:false})}),/AUTOMATION_PAUSED/);
  assert.equal(writes,0);
});

test('cleanup disables legacy autobuy without changing target collections',async()=>{
  const state=[...structuredClone(slots),{...structuredClone(slots[0]),_id:'cccccccccccccccccccccccc',collectionName:'Lol Pop',backdropNames:[],portalsAutobuyMaxPrice:17}];
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(state);
    if(path.includes('/update-subscription/')){Object.assign(state[3],JSON.parse(options.body));return reply(null);}
    throw new Error(path);
  };
  const result=await cleanBlackBatch('test',0,{fetcher,beforeWrite:async()=>{},pause:async()=>{}});
  assert.equal(result.processed,1);
  assert.equal(state[3].portalsAutobuy,false);
  assert.equal(state[0].portalsAutobuy,true);
  assert.equal(state[1].portalsAutobuy,true);
});

test('daily run skips a consumed slot after a purchase instead of failing',async()=>{
  const state=structuredClone(slots);state[0].portalsAutobuyQuantity=0;
  state[1].modelNames=['Signal Flare','Olympia','Ionic Column','Eternal Flame','Oil Lamp'];
  state[1].portalsAutobuyMaxPrice=17.44;
  state[2].modelNames=['Vintage','Hot Winter','Fairy Tale','Lime Treats'];
  state[2].portalsAutobuyMaxPrice=15.27;
  const fetcher=async(url)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(state);
    if(path.endsWith('/user/me'))return reply({tonBalance:25.95,isAutobuyEnabled:true});
    if(path.includes('/search/'))return reply([{backdropName:'Black',normalizedPrice:floor(path),currency:'ton'}]);
    throw new Error(path);
  };
  const result=await applyBlackPlan('test',{fetcher,beforeWrite:async()=>{throw new Error('unexpected write');},pause:async()=>{},modelReader:async()=>({ok:false})});
  assert.equal(result.changed,0);assert.equal(result.skipped,3);
  assert.match(result.details[0],/исчерпан/);
});

test('daily model selection favors frequent profitable Black sales',async()=>{
  const state=structuredClone(slots),writes=[];
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(state);
    if(path.endsWith('/user/me'))return reply({tonBalance:42.23,isAutobuyEnabled:true});
    if(path.includes('/search/'))return reply([{backdropName:'Black',normalizedPrice:floor(path),currency:'ton'}]);
    if(path.includes('/update-subscription/')){const body=JSON.parse(options.body);Object.assign(state.find(s=>s._id===path.split('/').at(-1)),body);writes.push(body);return reply(null);}
    throw new Error(path);
  };
  const modelReader=async collection=>({ok:true,complete:true,total:55,rows:collection==='Vice Cream'?
    [{model:'Birthday',count:12,p25:20},{model:'Rare',count:1,p25:100},{model:'Cheap',count:8,p25:16},{model:'Sushi',count:5,p25:20}]:
    [{model:'Olympia',count:7,p25:22},{model:'Signal Flare',count:4,p25:40},{model:'Illiquid',count:1,p25:90}]
  });
  await applyBlackPlan('test',{fetcher,beforeWrite:async()=>{},pause:async()=>{},modelReader});
  assert.deepEqual(writes.slice(0,2).map(w=>w.modelNames),[['Birthday','Sushi'],['Olympia','Signal Flare']]);
});

test('activates a previously disabled slot for Xmas Stocking',async()=>{
  const state=structuredClone(slots);
  Object.assign(state[2],{subscriptionName:'Lol Pop',collectionName:'Lol Pop',portalsAutobuy:false,portalsAutobuyQuantity:0,backdropNames:[],modelNames:[],portalsAutobuyMaxPrice:null});
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(state);
    if(path.endsWith('/user/me'))return reply({tonBalance:42.23,isAutobuyEnabled:true});
    if(path.includes('/search/'))return reply([{backdropName:'Black',normalizedPrice:floor(path),currency:'ton'}]);
    if(path.includes('/update-subscription/')){Object.assign(state.find(s=>s._id===path.split('/').at(-1)),JSON.parse(options.body));return reply(null);}
    throw new Error(path);
  };
  const result=await applyBlackPlan('test',{fetcher,beforeWrite:async()=>{},pause:async()=>{},modelReader:async()=>({ok:false})});
  assert.equal(result.changed,3);
  assert.equal(state[2].collectionName,'Xmas Stocking');
  assert.equal(state[2].portalsAutobuy,true);
  assert.equal(state[2].portalsAutobuyQuantity,1);
  assert.equal(state[2].portalsAutobuyMaxPrice,15.27);
  assert.deepEqual(state[2].modelNames,['Vintage','Hot Winter','Fairy Tale','Lime Treats']);
});
