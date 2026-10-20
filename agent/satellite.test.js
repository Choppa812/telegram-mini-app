import test from 'node:test';
import assert from 'node:assert/strict';
import { probeSatellite, readSatellite } from './satellite.js';
test('API probe uses documented read endpoints and Token authorization', async()=>{
  const calls=[];
  const result=await probeSatellite('secret',async(url,options)=>{
    calls.push({url:String(url),options});
    const data=String(url).includes('/user/subscriptions')?[{_id:'one',collectionName:'Lol Pop',portalsAutobuy:false,portalsAutobuyMaxPrice:1}]:[];
    return {ok:true,status:200,json:async()=>data};
  });
  assert.equal(result.slots,1); assert.equal(result.collections.status,200); assert.equal(result.offers.status,200); assert.equal(result.writesPerformed,0);
  assert.ok(calls.every(c=>c.options.method==='GET'&&!c.url.includes('secret')&&c.options.redirect==='error'&&c.options.headers.Authorization==='Token secret'));
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('authorization failure is reported without market requests or exposing provider response', async()=>{
  let calls=0;
  const result=await probeSatellite('secret',async()=>{calls++;return {ok:false,status:401};});
  assert.equal(result.ok,false); assert.equal(calls,1); assert.equal(result.attempts.length,1);
});
test('probe retries transient provider failures and blocks unsupported paths', async()=>{
  let calls=0;
  const result=await probeSatellite('secret',async()=>{calls++;return {ok:false,status:429};});
  assert.equal(result.ok,false); assert.equal(calls,3);
  await assert.rejects(readSatellite('/user/buy',{},'secret','token'),/UNSUPPORTED_READ_PATH/);
});
test('documented Token header is supported and error diagnostics redact the key', async()=>{
  const result=await readSatellite('/user/subscriptions',{},'sensitive-key','token',async(url,options)=>{
    assert.equal(options.headers.Authorization,'Token sensitive-key');
    return {ok:false,status:401,json:async()=>({message:'Invalid sensitive-key'})};
  });
  assert.equal(result.message,'Invalid [REDACTED]');
});
