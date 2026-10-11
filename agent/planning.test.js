import test from 'node:test';
import assert from 'node:assert/strict';
import {readPositions,positionsText,readBlackModels,blackModelsText} from './planning.js';

test('model analysis counts Black sales and groups by model',async()=>{
  const fetcher=async(url,options)=>{
    assert.match(String(url),/\/history\/Vice%20Cream$/);
    assert.equal(options.headers.Authorization,'Token secret');
    assert.deepEqual(JSON.parse(options.body).backdrops,['Black']);
    return {ok:true,status:200,json:async()=>({content:[{soldAt:'2026-10-11T15:00:00Z',modelName:'A',normalizedPrice:20},{soldAt:'2026-10-11T14:00:00Z',modelName:'A',normalizedPrice:22},{soldAt:'2026-10-11T13:00:00Z',modelName:'B',normalizedPrice:19}]})};
  };
  const result=await readBlackModels('Vice Cream','secret',fetcher,new Date('2026-10-11T16:00:00Z'));
  assert.equal(result.total,3);assert.deepEqual(result.rows.map(r=>[r.model,r.count]),[['A',2],['B',1]]);
  assert.match(blackModelsText(result),/модели Vice Cream Black/);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('position overview exposes existing exposure without changing it',async()=>{
  const fetcher=async(url,options)=>({ok:true,status:200,json:async()=>String(url).includes('subscriptions')?[{subscriptionName:'One',collectionName:'Vice Cream',modelNames:['A'],backdropNames:['Black'],portalsAutobuy:true,portalsAutobuyMaxPrice:15,portalsAutobuyQuantity:1,autobuyPortals:true}]:{tonBalance:42,subscriptionLimit:30,isAutobuyEnabled:true}});
  const result=await readPositions('secret',fetcher);
  assert.equal(result.rows.length,1);assert.equal(result.balance,42);
  assert.match(positionsText(result),/Vice Cream/);
});
