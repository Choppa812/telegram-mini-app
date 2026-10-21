import test from 'node:test';
import assert from 'node:assert/strict';
import { readMarketOverview, summarizeRecentOffers, marketOverviewText, readFloorOverview, floorOverviewText, readHighBlackFloors, highBlackFloorsText } from './market.js';

test('recent-offer overview excludes stale and malformed candidates without presenting them as floors', () => {
  const now = new Date('2026-10-11T15:00:00Z');
  const data = [
    { collectionName:'A', portals:{ price:18, timestamp:'2026-10-11T14:00:00Z' }, mrkt:{ price:20, timestamp:'2026-10-11T13:00:00Z' } },
    { collectionName:'B', portals:{ price:1, timestamp:'2026-10-01T14:00:00Z' } },
    { collectionName:'C', portals:{ price:0, timestamp:'2026-10-11T14:00:00Z' } },
  ];
  const result = summarizeRecentOffers(data, now);
  assert.equal(result.observed,3);
  assert.equal(result.priced,2);
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].collection,'A');
  assert.equal(result.candidates[0].price,18);
  assert.match(marketOverviewText({ok:true,...result}),/не минимальные текущие цены/);
});

test('floor overview combines Portals and MRKT and keeps Black distinct', async()=>{
  const calls=[];
  const result=await readFloorOverview('secret',async(url,options)=>{
    calls.push(String(url));
    assert.equal(options.headers.Authorization,'Token secret');
    const isBlack=String(url).includes('black=true');
    const mrkt=String(url).includes('market=mrkt');
    const data=isBlack?{A:mrkt?30:28,B:55}:{A:mrkt?20:19,B:22};
    return {ok:true,status:200,json:async()=>data};
  },async()=>{});
  assert.equal(calls.length,4);
  assert.equal(result.baseCount,2);
  assert.equal(result.blackCount,2);
  assert.equal(result.under50Black,1);
  assert.deepEqual(result.candidates,[{collection:'A',base:19,black:28}]);
  assert.match(floorOverviewText(result),/Black 28\.00, общий 19\.00/);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('high Black floors use the lower market price and exclude cheaper collections', async () => {
  const result = await readHighBlackFloors('secret', async (url, options) => {
    assert.equal(options.headers.Authorization, 'Token secret');
    const data = String(url).includes('market=mrkt') ? { A: 60, B: 50, C: 90 } : { A: 48, B: 55, C: 70 };
    return { ok: true, status: 200, json: async () => data };
  }, async () => {});
  assert.deepEqual(result.rows, [{ collection: 'B', floor: 50 }, { collection: 'C', floor: 70 }]);
  assert.match(highBlackFloorsText(result), /Black от 50 TON/);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('overview uses the documented Token header and never exposes it in the result', async () => {
  const result = await readMarketOverview('secret',async(url,options)=>{
    assert.match(String(url),/\/history\/collection-offers$/);
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Token secret');
    return {ok:true,status:200,json:async()=>[{collectionName:'A',portals:{price:12,timestamp:'2026-10-11T14:00:00Z'}}]};
  },new Date('2026-10-11T15:00:00Z'));
  assert.equal(result.ok,true);
  assert.equal(result.priced,1);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
