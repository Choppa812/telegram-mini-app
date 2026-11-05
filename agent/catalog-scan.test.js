import test from 'node:test';
import assert from 'node:assert/strict';
import { scanCatalog } from './catalog-scan.js';

test('scans all collections and includes Black, other backgrounds and unsold catalog models',async()=>{
  const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push({path:url.pathname,method:opts.method});
    const data=url.pathname.endsWith('/gift/collections')?[{name:'Gift One'},{name:'Gift Two'}]:
      url.pathname.includes('/gift/collection/')?{models:[{name:'Sold'},{name:'Unsold'}],backdrops:[{name:'Black'},{name:'White'}]}:
      {content:['Black','White'].map((backdropName,i)=>({_id:String(i),soldAt:new Date(Date.now()-3600000).toISOString(),modelName:'Sold',backdropName,normalizedPrice:20+i}))};
    return {ok:true,json:async()=>data};
  };
  const r=await scanCatalog('secret',{fetcher,pause:async()=>{}});
  assert.equal(r.complete,true);assert.equal(r.collections.length,2);
  assert.equal(r.collections[0].combinations.length,2);
  assert.equal(r.collections[0].models[1].week.count,0);
  assert.ok(calls.every(c=>!c.path.includes('/user/')));
});

test('page cap and invalid dates never look like complete analysis',async()=>{
  const fetcher=async(url)=>({ok:true,json:async()=>url.pathname.endsWith('/gift/collections')?[{name:'Example'}]:
    url.pathname.includes('/gift/collection/')?{models:[],backdrops:[]}:
    {content:Array.from({length:20},(_,i)=>({_id:String(i),soldAt:'2026-11-04T00:00:00.000Z',modelName:'Model',backdropName:'Black',normalizedPrice:10}))}});
  const r=await scanCatalog('secret',{fetcher,pause:async()=>{},maxPages:1,now:Date.parse('2026-11-04T01:00:00Z')});
  assert.equal(r.complete,false);assert.equal(r.collections[0].error,'PAGE_LIMIT_REACHED');
});

