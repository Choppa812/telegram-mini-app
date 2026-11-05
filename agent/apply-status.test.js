import test from 'node:test';
import assert from 'node:assert/strict';
import {applyStatus} from './apply-status.js';
test('status uses current provider state rather than treating all processed orders as active',async()=>{
 const rows=[{slot:1,subscriptionId:'a',collection:'Chill Flame',model:'Oracle',backdrop:'Black'},{slot:2,subscriptionId:'b',collection:'Gift',model:'Model',backdrop:'Black'}];
 const plan={status:'completed',index:2,rows,results:[{slot:1,changed:true},{slot:2,reason:'INSUFFICIENT_EXACT_SALES'}]},before=JSON.stringify(plan);
 const text=await applyStatus({store:{getActiveResearchPlan:async()=>plan},key:'test',reader:async path=>{
  assert.equal(path,'/user/subscriptions');
  return {ok:true,data:[{_id:'a',collectionName:'Chill Flame',modelNames:['Oracle'],backdropNames:['Black'],portalsAutobuy:true,portalsAutobuyQuantity:1,portalsAutobuyMaxPrice:23.44},{_id:'b',collectionName:'Other',portalsAutobuy:false}]};
 }});
 assert.match(text,/активных 1\/2, Chill Flame 1/);assert.match(text,/недостаточно продаж/);
 assert.equal(JSON.stringify(plan),before);
});
test('status does not fabricate a successful provider check on failure',async()=>{
 await assert.rejects(applyStatus({store:{getActiveResearchPlan:async()=>({rows:[]})},key:'test',reader:async()=>({ok:false})}),/ACCOUNT_READ_FAILED/);
});
