import test from 'node:test';
import assert from 'node:assert/strict';
import { readCrossMarket, crossMarketText } from './cross.js';

test('reads Black listings on five markets without writes or leaking the key', async () => {
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push({ url: new URL(url), options });
    return { ok: true, status: 200, json: async () => [
      { backdropName: 'Black', currency: 'ton', modelName: 'Cream Scream', normalizedPrice: 22 },
      { backdropName: 'White', currency: 'ton', modelName: 'Cream Scream', normalizedPrice: 2 },
    ] };
  };
  const result = await readCrossMarket('Whip Cupcake', 'secret', fetcher, async () => {});
  assert.equal(result.ok, true);
  assert.equal(result.writesPerformed, 0);
  assert.equal(seen.length, 5);
  for (const { url, options } of seen) {
    assert.equal(options.method, 'GET');
    assert.equal(url.searchParams.get('backdrops'), 'Black');
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(options.headers.Authorization, 'Token secret');
  }
  assert.deepEqual(result.rows.map(row => row.floor), [22, 22, 22, 22, 22]);
  assert.match(crossMarketText(result, ['Cream Scream']), /Cream Scream: tg 22.00/);
});

test('fails closed when a market rejects a request', async () => {
  let calls = 0;
  const result = await readCrossMarket('Vice Cream', 'secret', async () => {
    calls++;
    return { ok: false, status: 429 };
  }, async () => {});
  assert.equal(calls, 3);
  assert.equal(result.ok, false);
  assert.match(crossMarketText(result), /HTTP 429/);
});

test('exact variant search filters the API request and excludes other models', async () => {
  const urls = [];
  const result = await readCrossMarket('Pool Float', 'secret', async url => {
    urls.push(new URL(url));
    return { ok: true, json: async () => [
      { modelName: 'Dark Swan', backdropName: 'Gunmetal', normalizedPrice: 7, currency: 'ton' },
      { modelName: 'Motorboat', backdropName: 'Gunmetal', normalizedPrice: 4, currency: 'ton' },
    ] };
  }, async () => {}, 'Gunmetal', 'Dark Swan');
  assert.equal(urls[0].searchParams.get('models'), 'Dark Swan');
  assert.equal(urls[0].searchParams.get('backdrops'), 'Gunmetal');
  assert.deepEqual(result.rows.map(row => row.floor), [7, 7, 7, 7, 7]);
});
