import test from 'node:test';
import assert from 'node:assert/strict';
import {assignResearchSlots,processResearchApply} from './research-apply.js';
test('full assignments preserve exact matches, bind stable subscription IDs and capture replacement states',()=>{
 const selected=Array.from({length:28},(_,i)=>({collection:'Gift '+i,model:'Model',backdrop:'Black',ceiling:10}));
 const slots=Array.from({length:28},(_,i)=>({_id:String(i),collectionName:'Old '+i,modelNames:['Old model'],backdropNames:['Black'],portalsAutobuy:i===0,portalsAutobuyQuantity:i===0?1:0,portalsAutobuyMaxPrice:12}));
 Object.assign(slots[5],{collectionName:'Gift 0',modelNames:['Model'],backdropNames:['Black']});
 const rows=assignResearchSlots(selected,slots);
 assert.equal(rows.find(r=>r.collection==='Gift 0').subscriptionId,'5');
 assert.equal(new Set(rows.map(r=>r.subscriptionId)).size,28);
 assert.equal(rows.find(r=>r.subscriptionId==='0').replaces.portalsAutobuy,true);
 assert.throws(()=>assignResearchSlots(selected.slice(1),slots),/FULL_PLAN_REQUIRED/);
});
test('paused application makes no financial writes and retains its checkpoint',async()=>{
 let writes=0;
 const plan={id:'r',status:'applying',index:3};
 await processResearchApply({run:'r',index:3},{store:{acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},getActiveResearchPlan:async()=>plan,isPaused:async()=>true},apply:async()=>{writes++;}});
 assert.equal(writes,0);assert.equal(plan.index,3);
});
test('colored slot 7 is assigned a Black replacement before other unused slots',()=>{
 const selected=Array.from({length:28},(_,i)=>({collection:'Gift '+i,model:'Model',backdrop:'Black',ceiling:10}));
 const slots=Array.from({length:28},(_,i)=>({_id:String(i),collectionName:'Old '+i,modelNames:['Old'],backdropNames:['Black'],portalsAutobuy:false}));
 Object.assign(slots[6],{collectionName:'Trapped Heart',modelNames:['Heartworm'],backdropNames:['Desert Sand'],portalsAutobuy:true,portalsAutobuyQuantity:1,portalsAutobuyMaxPrice:14.95});
 const rows=assignResearchSlots(selected,slots);
 assert.equal(rows.find(r=>r.slot===7).collection,'Gift 0');
 assert.equal(rows.find(r=>r.slot===7).backdrop,'Black');
});

