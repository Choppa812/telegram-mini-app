import test from 'node:test';
import assert from 'node:assert/strict';
import { readTurnover, summarizeTurnover, turnoverText } from './rank.js';

test('rank aggregates every bucket and preserves 24-hour and weekly comparisons', async () => {
  const fetcher = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Token secret');
    assert.match(String(url), /\/history\/collections\?period=(24h|7d)$/);
    const week = String(url).endsWith('7d');
    const data = week ? [{ collectionName:'A',values:[{quantity:30,volume:100}] },{collectionName:'B',values:[{quantity:50,volume:200}]}] : [{collectionName:'A',values:[{quantity:4,volume:10},{quantity:5,volume:15}]},{collectionName:'B',values:[{quantity:3,volume:8}]}];
    return { ok:true, status:200, json:async()=>data };
  };
  const result = await readTurnover('secret', fetcher);
  assert.equal(result.rows[0].collection,'A');
  assert.equal(result.rows[0].day,9);
  assert.equal(result.rows[0].week,30);
  assert.equal(result.rows[0].weekRank,2);
  assert.equal(result.rows[0].volumeDay,25);
  assert.match(turnoverText(result), /всех фонов/);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('invalid response is rejected', () => assert.throws(() => summarizeTurnover({}, '24h'), /INVALID_TURNOVER_RESPONSE/));
