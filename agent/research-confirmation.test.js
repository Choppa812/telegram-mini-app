import test from 'node:test';
import assert from 'node:assert/strict';
import {researchToken,confirmationText,confirmationKeyboard} from './research-confirmation.js';
import {startResearchApply} from './research-apply.js';
import {handleCommand} from './control.js';

function setup(){
 const now=Date.now(),research={id:'proposal',scope:'Black',collectionCaps:{'Chill Flame':3},status:'completed',finishedAt:now,selected:Array.from({length:28},(_,i)=>({collection:'Gift '+i,model:'Model',backdrop:'Black',ceiling:20}))};
 let active=null,reads=0;const queued=[];
 const store={acquireCatalogLease:async()=>'lease',releaseCatalogLease:async()=>{},isPaused:async()=>false,getResearchRun:async()=>research,
  getActiveResearchPlan:async()=>active,saveActiveResearchPlan:async row=>{active=row;}};
 const deps={store,key:'test',now,enqueue:async(t,m)=>{assert.equal(active?.status,'applying');queued.push(m);},accountReader:async()=>{reads++;return {ok:true,data:Array.from({length:28},(_,i)=>({_id:String(i),collectionName:'Old '+i,modelNames:['Old'],backdropNames:['Black'],portalsAutobuy:false}))};}};
 return {research,deps,queued,get active(){return active;},get reads(){return reads;}};
}
test('generic apply displays a plan-specific confirmation without publishing or enqueueing orders',async()=>{
 const f=setup();const text=await startResearchApply(f.deps);
 assert.match(text,new RegExp('/confirmplan '+researchToken(f.research)));assert.equal(f.active,null);assert.equal(f.reads,0);assert.equal(f.queued.length,0);
 assert.ok(confirmationKeyboard(f.research).keyboard.flat().some(button=>button.text==='Подтвердить этот план · '+researchToken(f.research)));
});
test('stale confirmation cannot activate a revised composition or increased ceiling',async()=>{
 const f=setup(),token=researchToken(f.research);f.research.selected[0].ceiling++;
 assert.match(await startResearchApply({...f.deps,confirmation:token}),/заменён/);assert.equal(f.active,null);assert.equal(f.queued.length,0);
});
test('confirmed exact plan is published before queueing guarded live application and is replay safe',async()=>{
 const f=setup(),confirmation=researchToken(f.research);
 assert.match(await startResearchApply({...f.deps,confirmation}),/Запущено/);
 assert.equal(f.active.rows.length,28);assert.equal(f.active.rows[0].ceiling,20);assert.equal(f.reads,1);assert.equal(f.queued.length,1);
 f.active.status='completed';assert.match(await startResearchApply({...f.deps,confirmation}),/уже применён/);assert.equal(f.queued.length,1);
});
test('paused or expired confirmations cannot publish any orders',async()=>{
 const f=setup(),confirmation=researchToken(f.research);
 f.deps.store.isPaused=async()=>true;assert.match(await startResearchApply({...f.deps,confirmation}),/паузе/);
 f.deps.store.isPaused=async()=>false;
 assert.match(await startResearchApply({...f.deps,confirmation,now:f.deps.now+86400001}),/устарел/);
 assert.equal(f.active,null);assert.equal(f.reads,0);assert.equal(f.queued.length,0);
});
test('a blocked plan can only be superseded by a fresh confirmed plan after reading the interrupted slot',async()=>{
 const f=setup(),confirmation=researchToken(f.research);
 const blocked={id:f.research.id,status:'blocked',failedSlot:23,rows:[{slot:23,subscriptionId:'22'}]};
 await f.deps.store.saveActiveResearchPlan(blocked);
 assert.match(await startResearchApply({...f.deps,confirmation}),/план остановлен/);
 assert.equal(f.reads,0);
 await f.deps.store.saveActiveResearchPlan({...blocked,id:'previous'});
 assert.match(await startResearchApply({...f.deps,confirmation,accountReader:async()=>({ok:true,data:[]})}),/Не удалось прочитать/);
 assert.equal(f.queued.length,0);
 assert.match(await startResearchApply({...f.deps,confirmation}),/Запущено/);
 assert.equal(f.active.id,f.research.id);
});
test('bot confirmation is owner-only, private, well-formed and pause guarded',async()=>{
 const f=setup(),messages=[];let calls=0;const token=researchToken(f.research);
 const deps={ownerId:'42',store:f.deps.store,send:async text=>messages.push(text),applyResearch:async value=>{calls++;assert.equal(value,token);return 'queued';}};
 const update=(from,type,text)=>({update_id:1,message:{from:{id:from},chat:{id:from,type},text}});
 assert.equal(await handleCommand(update(7,'private','/confirmplan '+token),deps),false);
 assert.equal(await handleCommand(update(42,'group','/confirmplan '+token),deps),false);
 await handleCommand(update(42,'private','/confirmplan garbage'),deps);assert.equal(calls,0);
 f.deps.store.isPaused=async()=>true;await handleCommand(update(42,'private','/confirmplan '+token),deps);assert.equal(calls,0);
 f.deps.store.isPaused=async()=>false;await handleCommand(update(42,'private','/confirmplan '+token),deps);assert.equal(calls,1);
});
