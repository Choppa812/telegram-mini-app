import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyResearch} from './daily-research.js';
import {startResearch,processResearchStep,researchText} from './portfolio-research.js';

function fixture(previous=null){
 let run=previous;const queued=[],sent=[];
 const store={isPaused:async()=>false,getActiveResearchPlan:async()=>({status:'completed'}),
  getDayReport:async()=>({status:'completed'}),acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},
  getResearchRun:async()=>run,saveResearchRun:async value=>{run=value;}};
 const deps={store,key:'test',send:async text=>sent.push(text),enqueue:async(t,m)=>queued.push(m),
  all:true,scheduledDay:'2026-11-15',accountReader:async path=>({ok:true,data:path==='/user/me'?{tonBalance:50}:Array.from({length:28},()=>({portalsAutobuy:false}))})};
 return {deps,queued,sent,get run(){return run;}};
}
test('daily discovery waits for the completed Moscow-day trading check and respects pause',async()=>{
 const f=fixture();let calls=0;
 const options={...f.deps,now:new Date('2026-11-15T22:30:00Z'),start:async args=>{calls++;assert.equal(args.scheduledDay,'2026-11-16');assert.equal(args.all,true);return 'started';}};
 f.deps.store.getDayReport=async day=>{assert.equal(day,'2026-11-16');return null;};
 assert.equal((await dailyResearch(options)).status,'waiting_for_daily_check');assert.equal(calls,0);
 f.deps.store.isPaused=async()=>true;assert.equal((await dailyResearch(options)).status,'paused');assert.equal(calls,0);
 f.deps.store.isPaused=async()=>false;f.deps.store.getDayReport=async()=>({status:'completed'});
 assert.equal((await dailyResearch(options)).status,'running');assert.equal(calls,1);
});
test('scheduled discovery creates a fresh full-catalog run and timer resumes the same checkpoint',async()=>{
 const f=fixture();await startResearch(f.deps);const id=f.run.id;
 assert.equal(f.run.fullCatalog,true);assert.equal(f.run.scope,'Black');assert.equal(f.run.scheduledDay,'2026-11-15');
 assert.equal(f.run.collectionCaps['Chill Flame'],3);
 f.run.discoveryIndex=12;
 await startResearch(f.deps);assert.equal(f.run.id,id);assert.equal(f.queued.at(-1).discoveryIndex,12);
});
test('completed daily scan is not restarted, but the following day gets a new run',async()=>{
 const f=fixture({id:'done',scheduledDay:'2026-11-15',status:'completed',notifiedAt:1});
 assert.equal((await startResearch(f.deps)).duplicate,true);assert.equal(f.queued.length,0);
 await startResearch({...f.deps,scheduledDay:'2026-11-16'});assert.notEqual(f.run.id,'done');assert.equal(f.run.scheduledDay,'2026-11-16');
});
test('timer never overwrites manual discovery or an applying financial plan',async()=>{
 const f=fixture({id:'manual',status:'running'});
 assert.equal((await startResearch(f.deps)).status,'busy');assert.equal(f.run.id,'manual');
 f.deps.store.getActiveResearchPlan=async()=>({status:'applying'});
 assert.equal((await startResearch(f.deps)).status,'busy');assert.equal(f.queued.length,0);
});
test('scheduled worker makes no API calls or notifications while paused',async()=>{
 const f=fixture({id:'r',scheduledDay:'2026-11-15',status:'discovering'});f.deps.store.isPaused=async()=>true;
 await processResearchStep({run:'r'}, {...f.deps,scan:async()=>assert.fail('scan while paused')});
 assert.equal(f.sent.length,0);assert.equal(f.queued.length,0);
});
test('scheduled worker checks discovered candidates and reports only on completion, without trading writes',async()=>{
 const f=fixture({id:'r',scheduledDay:'2026-11-15',fullCatalog:true,status:'discovering',startedAt:Date.now(),index:0,discoveryIndex:0,balance:50,slots:[],candidates:[],qualified:[],selected:[],rejected:[],coverage:[],collectionCaps:{'Chill Flame':3}});
 const scan=async()=>({catalogTotal:1,startedAt:new Date().toISOString(),collections:[{collection:'New Gift',complete:true,combinations:[{model:'Liquid',backdrop:'Black',day:{count:3,q1:20},week:{count:10}}]}]});
 await processResearchStep({run:'r',discoveryIndex:0},{...f.deps,scan});
 assert.equal(f.sent.length,0);assert.equal(f.run.status,'running');
 await processResearchStep({run:'r',index:0},{...f.deps,variantReader:async()=>({ok:true,complete:true,day:{count:3,q1:20},week:{count:10,q1:20,median:21}}),marketReader:async()=>({ok:true,rows:Array.from({length:5},()=>({floor:22}))})});
 assert.equal(f.run.status,'insufficient');assert.equal(f.run.selected.length,1);assert.equal(f.sent.length,1);
 assert.match(f.sent[0],/Новых сочетаний в подборке: 1/);assert.match(f.sent[0],/только после вашего согласования/);
 await processResearchStep({run:'r',index:0},f.deps);assert.equal(f.sent.length,1);
});
test('failed final notification is retried from the saved terminal checkpoint',async()=>{
 const f=fixture({id:'r',scheduledDay:'2026-11-15',fullCatalog:true,status:'insufficient',startedAt:Date.now(),balance:50,slots:[],index:0,candidates:[],selected:[],coverage:[]});
 await assert.rejects(processResearchStep({run:'r'},{...f.deps,send:async()=>{throw Error('offline');}}),/offline/);
 assert.equal(f.run.notifiedAt,undefined);
 await processResearchStep({run:'r'},f.deps);assert.equal(f.sent.length,1);assert.ok(f.run.notifiedAt);
});
test('a timer retries a pending final report instead of scanning the catalog again',async()=>{
 const f=fixture({id:'r',scheduledDay:'2026-11-15',fullCatalog:true,status:'insufficient',startedAt:Date.now(),balance:50,slots:[],index:0,candidates:[],selected:[],coverage:[]});
 await startResearch(f.deps);assert.equal(f.sent.length,1);assert.equal(f.queued.length,0);
 await startResearch(f.deps);assert.equal(f.sent.length,1);
});
