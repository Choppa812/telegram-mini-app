import test from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, calculatePricing, pricingForSubscription, pricingDue } from "./pricing.js";
const now = Date.parse("2026-10-05T20:00:00Z");
const iso = n => new Date(n).toISOString();
function snapshot({ floor = 30, count = 25, resale = 30, backdrop = "Black", model = "*", costs = {buyFeePercent:3,sellFeePercent:5,fixedGram:0.5}, days = 1 } = {}) {
  return { generatedAt:iso(now), historyFrom:iso(now-days*DAY_MS), historyTo:iso(now), currency:"GRAM", complete:true,
    groups:[{collection:"Witch Hat",backdrop,model,floors:[{market:"MRKT",priceGram:floor},{market:"Portals",priceGram:floor+1}],costs,
      sales:Array.from({length:count},(_,i)=>({id:String(i),market:"MRKT",confirmed:true,currency:"GRAM",priceGram:resale,date:iso(now-i*60000)}))}] };
}
test("limits retain at least 5 GRAM discount, fees and 10 GRAM total position cap",()=>{
  const r=calculatePricing(snapshot(),now).rules[0];
  assert.equal(r.floorGram,30);
  assert.equal(r.discountGram,6);
  assert.ok(r.buyLimitGram*1.03<=10);
  assert.ok(r.floorGram-r.buyLimitGram>=5);
});
test("cheap floors never produce zero or negative purchase limits",()=>{
  for(const floor of [1,4.99,5]) {
    const r=calculatePricing(snapshot({floor}),now).rules[0];
    assert.equal(r.eligible,false);assert.equal(r.buyLimitGram,null);
  }
});
test("Black and collection floors have independent scopes; Onyx is not Black",()=>{
  const input=snapshot();input.groups.push({...snapshot({floor:4,backdrop:"*"}).groups[0]});
  const pricing=calculatePricing(input,now);
  assert.equal(pricingForSubscription({collection:"Witch Hat",backdrops:["Black"]},pricing,now).pricingBlocked,false);
  assert.equal(pricingForSubscription({collection:"Witch Hat",backdrops:[]},pricing,now).pricingBlocked,true);
  assert.equal(pricingForSubscription({collection:"Witch Hat",backdrops:["Onyx Black"]},pricing,now).pricingBlocked,true);
});
test("scarce sales block purchases; slower demand increases discount",()=>{
  assert.equal(calculatePricing(snapshot({count:4}),now).rules[0].eligible,false);
  assert.equal(calculatePricing(snapshot({count:10,floor:40}),now).rules[0].discountGram,10);
  assert.equal(calculatePricing(snapshot({count:25,floor:40}),now).rules[0].discountGram,8);
});
test("full observation duration, duplicate trades and missing fees are handled conservatively",()=>{
  assert.equal(calculatePricing(snapshot({days:7,count:25}),now).rules[0].eligible,false);
  const input=snapshot({count:4});input.groups[0].sales.push(...input.groups[0].sales);
  assert.equal(calculatePricing(input,now).rules[0].eligible,false);
  assert.equal(calculatePricing(snapshot({costs:null}),now).rules[0].eligible,false);
});
test("completed lower-quartile sales constrain expensive offers and protect net profit",()=>{
  const r=calculatePricing(snapshot({floor:20,resale:7}),now).rules[0];
  assert.ok(r.buyLimitGram<=5);
  assert.ok(7*0.95-0.5-r.buyLimitGram*1.03>=1);
  assert.ok((7*0.95-0.5)/(r.buyLimitGram*1.03)>=1.1);
});
test("incomplete history, mixed currency, stale and future snapshots are rejected",()=>{
  const stale=snapshot();stale.generatedAt=iso(now-DAY_MS);
  assert.throws(()=>calculatePricing(stale,now));
  const future=snapshot();future.generatedAt=iso(now+60000);
  assert.throws(()=>calculatePricing(future,now));
  const short=snapshot();short.historyFrom=iso(now-3600000);
  assert.throws(()=>calculatePricing(short,now));
  const stars=snapshot();stars.groups[0].sales[0].currency="XTR";
  assert.throws(()=>calculatePricing(stars,now));
  assert.throws(()=>calculatePricing({...snapshot(),complete:false},now));
});
test("expired persisted rules and unsupported attributes fail closed",()=>{
  const p=calculatePricing(snapshot(),now);
  const sub={collection:"Witch Hat",backdrops:["Black"]};
  assert.equal(pricingForSubscription(sub,p,now+DAY_MS).pricingBlocked,true);
  assert.equal(pricingForSubscription({...sub,models:["Rare"]},p,now).pricingBlocked,true);
  assert.equal(pricingForSubscription({...sub,number:"AAA"},p,now).pricingBlocked,true);
});
test("all collections and Black combinations are represented, missing groups are blocked",()=>{
  const p=calculatePricing(snapshot(),now,["Witch Hat","Lol Pop"]);
  assert.equal(p.rules.length,4);
  assert.equal(p.rules.find(r=>r.collection==="Lol Pop").eligible,false);
  assert.equal(p.coverage.requiredBaseGroups,4);
});
test("daily scheduler is due at 24 hours and on first launch",()=>{
  assert.equal(pricingDue(null,now),true);
  assert.equal(pricingDue(iso(now),now+DAY_MS-1),false);
  assert.equal(pricingDue(iso(now),now+DAY_MS),true);
});
