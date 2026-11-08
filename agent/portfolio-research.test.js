import test from 'node:test';
import assert from 'node:assert/strict';
import {researchCandidates,processResearchStep} from './portfolio-research.js';
test('retrying a failed collection preserves coverage and verifies only newly discovered candidates',async()=>{
 const run={id:'retry',fullCatalog:true,status:'discovering',index:1,discoveryIndex:1,retryIndices:[1],retryCursor:0,balance:100,candidates:[{collection:'Kept',model:'A',backdrop:'Black'}],selected:[],qualified:[],rejected:[],coverage:[{collection:'Kept',complete:true},{collection:'Retry',complete:false}]};
 const queued=[];
 await processResearchStep({run:'retry',index:1,discoveryIndex:1},{key:'test',send:async()=>{},enqueue:async(t,m)=>queued.push(m),store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},scan:async(k,o)=>{assert.equal(o.offset,1);return {catalogTotal:2,collections:[{collection:'Retry',complete:true,combinations:[{model:'New',backdrop:'Black',day:{count:3,q1:20},week:{count:12}}]}]};}});
 assert.equal(run.coverage.length,2);assert.equal(run.coverage[1].complete,true);assert.equal(run.status,'running');assert.equal(run.index,1);assert.equal(queued[0].index,1);
});
test('full catalog research visits every collection before exact verification',async()=>{
 const run={id:'all',fullCatalog:true,status:'discovering',index:0,discoveryIndex:0,balance:100,candidates:[],selected:[],qualified:[],rejected:[],coverage:[]};
 const queued=[];
 const deps={key:'test',send:async()=>{},enqueue:async(t,m)=>queued.push(m),store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},scan:async()=>({catalogTotal:2,startedAt:'2026-11-08T12:00:00Z',collections:[{collection:'Gift',complete:false,error:'PAGE_LIMIT_REACHED',combinations:[{model:'Model',backdrop:'Black',day:{count:2,q1:20},week:{count:10}}]}]})};
 await processResearchStep({run:'all',index:0,discoveryIndex:0},deps);
 assert.equal(run.status,'discovering');assert.equal(run.selected.length,0);assert.equal(queued[0].discoveryIndex,1);
 await processResearchStep({run:'all',index:0,discoveryIndex:1},deps);
 assert.equal(run.status,'running');assert.equal(run.coverage.length,2);assert.equal(run.coverage[0].complete,false);
});
test('full research continues past 28 qualifying models and compares the last candidate',async()=>{
 const row=i=>({collection:'Gift',model:'M'+i,backdrop:'Black',history:{day:{count:2,q1:20},week:{count:8,q1:20}},ceiling:10});
 const run={id:'all',fullCatalog:true,status:'running',index:0,balance:100,candidates:[{collection:'New',model:'Liquid',backdrop:'Black'},{collection:'Last',model:'Last',backdrop:'Black'}],selected:Array.from({length:28},(_,i)=>row(i)),qualified:Array.from({length:28},(_,i)=>row(i)),rejected:[]};
 const deps={key:'test',send:async()=>{},enqueue:async()=>{},store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},variantReader:async()=>({ok:true,complete:true,day:{count:10,q1:20},week:{count:70,q1:20}}),marketReader:async()=>({ok:true,rows:Array.from({length:5},()=>({floor:22}))})};
 await processResearchStep({run:'all',index:0},deps);
 assert.equal(run.status,'running');assert.equal(run.selected[0].collection,'New');
 await processResearchStep({run:'all',index:1},deps);
 assert.equal(run.status,'completed');assert.equal(run.selected.length,28);assert.equal(run.qualified.length,30);assert.ok(run.selected.some(r=>r.collection==='Last'));
});
test('research preserves active exact targets and diversifies new collections',()=>{
 const combo=model=>({model,backdrop:'Black',day:{count:9,q1:20},week:{count:12}});
 const rows=[{runId:'run',collection:'Popular',combinations:[combo('One'),combo('Two')]},{runId:'run',collection:'Other',combinations:[combo('Three')]}];
 const result=researchCandidates(rows,100,'run',[{portalsAutobuy:true,collectionName:'Existing',modelNames:['Kept'],backdropNames:['Black']}]);
 assert.equal(result[0].collection,'Existing');assert.notEqual(result[1].collection,result[2].collection);assert.equal(result.length,4);
});
test('Black-only research excludes liquid colored variants and active non-Black orders',()=>{
 const combination=backdrop=>({model:'Model',backdrop,day:{count:99,q1:20},week:{count:100}});
 const result=researchCandidates([{runId:'run',collection:'Gift',combinations:[combination('Black'),combination('Desert Sand')]}],100,'run',[
  {portalsAutobuy:true,collectionName:'Trapped Heart',modelNames:['Heartworm'],backdropNames:['Desert Sand']},
 ]);
 assert.equal(result.length,1);assert.equal(result[0].backdrop,'Black');
});
test('research checkpoints and resumes without repeating a completed candidate',async()=>{
 const run={id:'r',status:'running',index:0,balance:100,candidates:[{collection:'Gift',model:'Model',backdrop:'Black'},{collection:'Next'}],selected:[],rejected:[]};
 let reads=0,queued=0;
 const deps={key:'test',send:async()=>{},enqueue:async()=>{queued++;},store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},
 variantReader:async()=>{reads++;return {ok:true,complete:true,day:{count:4,q1:20},week:{count:12,q1:20}};},
 marketReader:async()=>({ok:true,rows:Array.from({length:5},()=>({floor:22}))})};
 await processResearchStep({run:'r',index:0},deps);
 await processResearchStep({run:'r',index:0},deps);
 assert.equal(reads,1);assert.equal(queued,2);assert.equal(run.selected.length,1);
 assert.equal(run.selected[0].ceiling,17.57);
});
test('incomplete exact history never produces a proposed purchase',async()=>{
 const run={id:'r',status:'running',index:0,balance:100,candidates:[{collection:'Gift',model:'Model',backdrop:'Black'}],selected:[],rejected:[]};
 await processResearchStep({run:'r',index:0},{key:'test',send:async()=>{},enqueue:async()=>{},store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},variantReader:async()=>({ok:true,complete:false}),marketReader:async()=>{throw Error('must not query');}});
 assert.equal(run.status,'discovering');assert.equal(run.selected.length,0);
});
test('Black discovery finds missing models and queues exact verification without selecting partial data',async()=>{
 const run={id:'r',scope:'Black',status:'discovering',index:0,discoveryIndex:0,balance:100,candidates:[],selected:[],rejected:[]};
 const queued=[];
 await processResearchStep({run:'r',index:0,discoveryIndex:0},{key:'test',send:async()=>{},enqueue:async(topic,message)=>queued.push(message),store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},scan:async(key,options)=>{
 assert.equal(options.backdrop,'Black');
 return {catalogTotal:132,complete:false,collections:[{collection:'Hidden',combinations:[{model:'Model',backdrop:'Black',day:{count:2,q1:20},week:{count:9}},{model:'Other',backdrop:'White',day:{count:9,q1:20},week:{count:20}}]}]};
 }});
 assert.equal(run.candidates.length,1);assert.equal(run.selected.length,0);
 assert.equal(run.status,'running');assert.equal(queued[0].index,0);assert.equal(queued[0].discoveryIndex,undefined);
});


 test('catalog model names with punctuation are encoded and control characters are rejected',async()=>{
 const {readVariant}=await import('./variants.js');
 let calls=0;
 const result=await readVariant('Gift','Model (OG)','Blue: Grey','test',{pause:async()=>{},fetcher:async(url,options)=>{
 calls++;assert.equal(JSON.parse(options.body).models[0],'Model (OG)');return {ok:true,json:async()=>({content:[]})};
 }});
 assert.equal(result.complete,true);assert.equal(calls,1);
 await assert.rejects(readVariant('Gift','bad\nmodel','Black','test'),/INVALID_VARIANT_REQUEST/);
 });



 test('diversification retains the three Chill models with the strongest daily and weekly turnover',async()=>{
 const {diversifySelection}=await import('./portfolio-research.js');
 const row=(model,day,week,collection='Chill Flame')=>({collection,model,backdrop:'Black',history:{day:{count:day},week:{count:week}}});
 const result=diversifySelection([row('Tribal Totem',2,13),row('Bowl of Hygeia',5,8),row('Spaceship',5,14),row('Oracle',6,10),row('Other',9,12,'Other collection')]);
 assert.deepEqual(result.filter(r=>r.collection==='Chill Flame').map(r=>r.model),['Bowl of Hygeia','Spaceship','Oracle']);
 assert.equal(result.length,4);
 });
 test('collection cap blocks a fourth Chill model without querying markets or changing slots',async()=>{
 const run={id:'r',status:'running',index:0,balance:100,collectionCaps:{'Chill Flame':3},candidates:[{collection:'Chill Flame',model:'Fourth',backdrop:'Black'}],selected:Array.from({length:3},(_,i)=>({collection:'Chill Flame',model:String(i),backdrop:'Black',ceiling:10,history:{day:{count:4},week:{count:12}}})),rejected:[]};
 let calls=0;
 await processResearchStep({run:'r',index:0},{key:'test',send:async()=>{},enqueue:async()=>{},store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},variantReader:async()=>{calls++;},marketReader:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(run.selected.length,3);assert.equal(run.rejected[0].reason,'COLLECTION_LIMIT');
 });

test('research of an already active exact model never raises its existing approved price',async()=>{
 const run={id:'r',status:'running',index:0,balance:100,candidates:[{collection:'Gift',model:'Model',backdrop:'Black',approvedCeiling:10}],selected:[],rejected:[]};
 await processResearchStep({run:'r',index:0},{key:'test',send:async()=>{},enqueue:async()=>{},store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},variantReader:async()=>({ok:true,complete:true,day:{count:4,q1:30},week:{count:12,q1:30}}),marketReader:async()=>({ok:true,rows:Array.from({length:5},()=>({floor:35}))})});
 assert.equal(run.selected[0].ceiling,10);
});

test('inconsistent exact prices cannot create an implausibly tiny replacement bid',async()=>{
 const {consistentPrices}=await import('./portfolio-research.js');
 assert.equal(consistentPrices({day:{q1:1.72},week:{q1:24.26,median:25.75}}),false);
 assert.equal(consistentPrices({day:{q1:25},week:{q1:3,median:25}}),false);
 const run={id:'r',status:'running',index:0,balance:100,candidates:[{collection:'Gift',model:'Model',backdrop:'Black'}],selected:[],rejected:[]};let markets=0;
 await processResearchStep({run:'r',index:0},{key:'test',send:async()=>{},enqueue:async()=>{},store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},variantReader:async()=>({ok:true,complete:true,day:{count:2,q1:1.72},week:{count:16,q1:24.26,median:25.75}}),marketReader:async()=>{markets++;}});
 assert.equal(run.selected.length,0);assert.equal(markets,0);assert.equal(run.rejected[0].reason,'INCONSISTENT_EXACT_PRICES');
});

test('research revision waits for a safe checkpoint instead of racing the running worker',async()=>{
 const {startResearch}=await import('./portfolio-research.js');let claims=0,waits=0,enqueued=0;
 const run={scope:'Black',status:'running',id:'r',index:0,candidates:[],selected:[],collectionCaps:{'Chill Flame':3}};
 const text=await startResearch({key:'test',wait:async()=>{waits++;},enqueue:async()=>{enqueued++;},store:{acquireCatalogLease:async()=>++claims<3?null:'lease',releaseCatalogLease:async token=>assert.equal(token,'lease'),getResearchRun:async()=>run}});
 assert.equal(waits,2);assert.equal(enqueued,1);assert.match(text,/running/);
});

test('proposal audit caps bids by live listing economics without touching active orders',async()=>{
 const {startResearch}=await import('./portfolio-research.js');
 const rows=Array.from({length:28},(_,i)=>({collection:'Gift',model:'Model '+i,backdrop:'Black',ceiling:i===0?10:19.5,checkedAt:123,history:{day:{count:3,q1:40},week:{count:12,q1:40,median:40}},market:{rows:[{floor:20}]}}));
 const old={id:'old',scope:'Black',status:'completed',index:28,candidates:rows,selected:rows,rejected:[],collectionCaps:{'Chill Flame':3},discoveryIndex:46,discoveryTotal:132};let saved;
 const text=await startResearch({key:'test',audit:true,enqueue:async()=>{throw Error('must not enqueue');},store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>old,saveResearchRun:async r=>{saved=r;},saveActiveResearchPlan:async()=>{throw Error('must not modify active plan');}}});
 assert.notEqual(saved.id,old.id);assert.equal(saved.selected.length,28);assert.equal(saved.selected[0].ceiling,10);assert.equal(saved.selected[1].ceiling,17.57);assert.equal(saved.selected[1].checkedAt,123);assert.match(text,/completed/);
});
