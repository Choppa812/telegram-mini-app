import test from 'node:test';
import assert from 'node:assert/strict';
import { readFeeOverview, feeOverviewText } from './fees.js';

test('fee overview uses actual TON purchase fees and does not leak the key',async()=>{
  const overview=await readFeeOverview('secret',async(url,options)=>{
    assert.equal(options.headers.Authorization,'Token secret');
    const data=String(url).includes('/user/me')?{tonBalance:50,levelConfig:{feeSum:.44}}:{purchases:[{currency:'ton',price:20,feeSum:1},{currency:'ton',price:10,feeSum:.6},{currency:'stars',price:100,feeSum:10}]};
    return {ok:true,status:200,json:async()=>data};
  });
  assert.equal(overview.feesMeasured,2);
  assert.equal(overview.medianPurchaseFeeRate,.05);
  assert.ok(!JSON.stringify(overview).includes('secret'));
  assert.match(feeOverviewText(overview),/5\.00%/);
});
