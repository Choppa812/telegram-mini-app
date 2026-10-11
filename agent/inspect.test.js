import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCollection, inspectText } from './inspect.js';

test('collection inspection compares asks and recent sales for all backgrounds and Black', async()=>{
  const calls=[];
  const now=new Date('2026-10-11T15:00:00Z');
  const result=await inspectCollection('B-Day Candle','secret',async(url,options)=>{
    calls.push({url:String(url),options});
    assert.equal(options.headers.Authorization,'Token secret');
    const isBlack=String(url).includes('backdrops=Black') || (options.body||'').includes('Black');
    const data=String(url).includes('/history/')?{content:[{normalizedPrice:isBlack?32:20,soldAt:'2026-10-11T14:00:00Z'}]}:[{normalizedPrice:isBlack?31:19,currency:'ton'}];
    return {ok:true,status:200,json:async()=>data};
  },now,async()=>{});
  assert.equal(calls.length,6);
  assert.ok(calls.every(c=>!c.url.includes('secret')));
  assert.equal(result.normal.floor,19);
  assert.equal(result.dark.floor,31);
  assert.equal(result.normal.sales.sevenDays,1);
  assert.equal(result.dark.sales.median,32);
  assert.match(inspectText(result),/Black: предложение от 31\.00/);
  assert.equal(result.writesPerformed,0);
});
