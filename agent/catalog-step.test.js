import test from 'node:test';
import assert from 'node:assert/strict';
import { processCatalogStep } from './catalog-step.js';
test('queue retry after checkpoint republishes next index without rescanning',async()=>{
 let run={id:'r',engine:'queue',status:'running',index:4,checked:4,incomplete:0,startedAt:1};let scans=0,publishes=0,releases=0;
 const deps={key:'test',store:{acquireCatalogLease:async()=> 'l',releaseCatalogLease:async()=>{releases++;},getCatalogRun:async()=>structuredClone(run),saveCatalogRun:async r=>{run=structuredClone(r);},saveCatalogCollection:async()=>{}},send:async()=>{},scan:async()=>{scans++;return {collections:[{collection:'Example'}],complete:true,catalogTotal:132,nextOffset:5};},enqueue:async(_topic,message)=>{publishes++;assert.equal(message.index,5);if(publishes===1)throw new Error('temporary');}};
 await assert.rejects(processCatalogStep({run:'r',index:4},deps));
 await processCatalogStep({run:'r',index:4},deps);
 assert.equal(scans,1);assert.equal(publishes,2);assert.equal(releases,2);assert.equal(run.checked,5);
});
test('stale runs do not scan or publish',async()=>{await processCatalogStep({run:'old',index:0},{store:{acquireCatalogLease:async()=> 'l',releaseCatalogLease:async()=>{},getCatalogRun:async()=>({id:'new',engine:'queue'})},scan:()=>{throw new Error('must not scan');},enqueue:()=>{throw new Error('must not enqueue');}});});
