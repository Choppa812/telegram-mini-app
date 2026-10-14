import test from 'node:test';
import assert from 'node:assert/strict';
import { scanBlackBatch, blackScanText } from './blackscan.js';

test('scans only affordable Black collections and marks page-limited counts', async () => {
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push(String(url));
    assert.equal(options.headers.Authorization,'Token secret');
    if(String(url).includes('/history/floors')) return {ok:true,status:200,json:async()=>({A:30,B:80})};
    assert.deepEqual(JSON.parse(options.body).backdrops,['Black']);
    return {ok:true,status:200,json:async()=>({content:Array.from({length:20},()=>({soldAt:'2026-10-11T15:00:00Z'}))})};
  };
  const result=await scanBlackBatch(0,'secret',fetcher,new Date('2026-10-11T16:00:00Z'),async()=>{});
  assert.equal(result.total,1);
  assert.deepEqual(result.rows,[{collection:'A',count:20,complete:false}]);
  assert.equal(calls.length,3);
  assert.match(blackScanText(result),/20\+/);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('larger balance scan includes Black floors up to 90 TON', async () => {
  const fetcher=async url=>String(url).includes('/history/floors')
    ? {ok:true,status:200,json:async()=>({A:30,B:80,C:95})}
    : {ok:true,status:200,json:async()=>({content:[]})};
  const result=await scanBlackBatch(0,'secret',fetcher,new Date('2026-10-11T16:00:00Z'),async()=>{},90);
  assert.equal(result.total,2);
  assert.match(blackScanText(result),/до 90 TON/);
});
