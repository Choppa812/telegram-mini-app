import test from 'node:test';
import assert from 'node:assert/strict';
import { countBlackSales, blackSalesText } from './blackday.js';

test('counts Black sales across pages until the 24-hour boundary', async () => {
  const now = new Date('2026-10-11T16:00:00Z');
  const pages = [];
  const fetcher = async (url, options) => {
    assert.match(String(url), /\/history\/Vice%20Cream$/);
    assert.equal(options.headers.Authorization, 'Token secret');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.backdrops,['Black']);
    pages.push(body.page);
    const content = body.page === 0 ? Array.from({length:20},(_,i)=>({soldAt:new Date(now.getTime()-(i+1)*3600000).toISOString()})) : [{soldAt:'2026-10-10T15:00:00Z'}];
    return {ok:true,status:200,json:async()=>({content})};
  };
  const result = await countBlackSales('Vice Cream','secret',fetcher,now,async()=>{});
  assert.deepEqual(pages,[0,1]);
  assert.equal(result.count,20);
  assert.equal(result.complete,true);
  assert.match(blackSalesText(result),/20/);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
