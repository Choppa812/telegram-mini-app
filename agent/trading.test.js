import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBlackPlan,cleanBlackBatch } from './trading.js';

const slots=[
  {_id:'aaaaaaaaaaaaaaaaaaaaaaaa',subscriptionName:'Vice',collectionName:'Vice Cream',modelNames:[],backdropNames:['Black'],portalsAutobuy:true,portalsAutobuyMaxPrice:13,portalsAutobuyQuantity:1,autobuyTg:true,autobuyPortals:true,autobuyTonnel:true,autobuyMrkt:true},
  {_id:'bbbbbbbbbbbbbbbbbbbbbbbb',subscriptionName:'Chill',collectionName:'Chill Flame',modelNames:[],backdropNames:['Black'],portalsAutobuy:true,portalsAutobuyMaxPrice:12,portalsAutobuyQuantity:1,autobuyTg:true,autobuyPortals:true,autobuyTonnel:true,autobuyMrkt:true},
];
const reply=(data,status=200)=>({ok:status===200,status,json:async()=>data});

test('updates existing Black slots at least five TON below live floor and verifies readback',async()=>{
  const state=structuredClone(slots),writes=[];
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(state);
    if(path.endsWith('/user/me'))return reply({tonBalance:42.23,isAutobuyEnabled:true});
    if(path.includes('/search/'))return reply([{backdropName:'Black',normalizedPrice:path.includes('Vice%20Cream')?20.79:22.44,currency:'ton'}]);
    if(path.includes('/update-subscription/')){
      assert.equal(options.method,'PUT');
      const id=path.split('/').at(-1),body=JSON.parse(options.body),slot=state.find(s=>s._id===id);
      assert.ok(slot);Object.assign(slot,body);writes.push(body);return reply(null);
    }
    throw new Error(path);
  };
  let guards=0;
  const result=await applyBlackPlan('test',{fetcher,beforeWrite:async()=>{guards++;},pause:async()=>{}});
  assert.equal(result.changed,2);assert.equal(guards,2);
  assert.deepEqual(writes.map(x=>x.portalsAutobuyMaxPrice),[15.79,17.44]);
  assert.deepEqual(writes.map(x=>x.backdropNames),[['Black'],['Black']]);
  assert.deepEqual(writes.map(x=>x.modelNames.length),[6,5]);
  assert.deepEqual(writes.map(x=>x.symbolNames),[[],[]]);
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
  await assert.rejects(applyBlackPlan('test',{fetcher,beforeWrite:async()=>{throw new Error('AUTOMATION_PAUSED');},pause:async()=>{}}),/AUTOMATION_PAUSED/);
  assert.equal(writes,0);
});

test('cleanup disables legacy autobuy without changing target collections',async()=>{
  const state=[...structuredClone(slots),{...structuredClone(slots[0]),_id:'cccccccccccccccccccccccc',collectionName:'Lol Pop',backdropNames:[],portalsAutobuyMaxPrice:17}];
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(state);
    if(path.includes('/update-subscription/')){Object.assign(state[2],JSON.parse(options.body));return reply(null);}
    throw new Error(path);
  };
  const result=await cleanBlackBatch('test',0,{fetcher,beforeWrite:async()=>{},pause:async()=>{}});
  assert.equal(result.processed,1);
  assert.equal(state[2].portalsAutobuy,false);
  assert.equal(state[0].portalsAutobuy,true);
  assert.equal(state[1].portalsAutobuy,true);
});
