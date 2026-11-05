import test from 'node:test';
import assert from 'node:assert/strict';
import {researchCandidates,processResearchStep} from './portfolio-research.js';
test('research preserves active exact targets and diversifies new collections',()=>{
 const combo=model=>({model,backdrop:'White',day:{count:9,q1:20},week:{count:12}});
 const rows=[{runId:'run',collection:'Popular',combinations:[combo('One'),combo('Two')]},{runId:'run',collection:'Other',combinations:[combo('Three')]}];
 const result=researchCandidates(rows,100,'run',[{portalsAutobuy:true,collectionName:'Existing',modelNames:['Kept'],backdropNames:['Black']}]);
 assert.equal(result[0].collection,'Existing');assert.notEqual(result[1].collection,result[2].collection);assert.equal(result.length,4);
});
test('research checkpoints and resumes without repeating a completed candidate',async()=>{
 const run={id:'r',status:'running',index:0,balance:100,candidates:[{collection:'Gift',model:'Model',backdrop:'White'},{collection:'Next'}],selected:[],rejected:[]};
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
 const run={id:'r',status:'running',index:0,balance:100,candidates:[{collection:'Gift',model:'Model',backdrop:'White'}],selected:[],rejected:[]};
 await processResearchStep({run:'r',index:0},{key:'test',send:async()=>{},enqueue:async()=>{},store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getResearchRun:async()=>run,saveResearchRun:async()=>{}},variantReader:async()=>({ok:true,complete:false}),marketReader:async()=>{throw Error('must not query');}});
 assert.equal(run.status,'insufficient');assert.equal(run.selected.length,0);
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
