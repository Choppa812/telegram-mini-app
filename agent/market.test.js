import test from 'node:test';
import assert from 'node:assert/strict';
import { readMarketOverview, summarizeRecentOffers, marketOverviewText } from './market.js';

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
