import test from 'node:test';
import assert from 'node:assert/strict';
import { readVariant, readVariantLeads, variantText } from './variants.js';

test('variant report separates one-day and seven-day sales for an exact model and backdrop', async () => {
  const now = Date.now();
  const sold = (days, price) => ({ soldAt: new Date(now - days * 86400000).toISOString(), modelName: 'Sebastian', backdropName: 'Black', normalizedPrice: price, market: 'mrkt' });
  const requests = [];
  const fetcher = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ content: [sold(.1, 20), sold(.2, 22), sold(2, 24)] }) };
  };
  const result = await readVariant('Pool Float', 'Sebastian', 'Black', 'secret', { fetcher, pause: async () => {} });
  assert.deepEqual(requests[0].models, ['Sebastian']);
  assert.deepEqual(requests[0].backdrops, ['Black']);
  assert.equal(result.complete, true);
  assert.equal(result.day.count, 2);
  assert.equal(result.week.count, 3);
  assert.match(variantText(result), /7 дней: 3/);
});

test('variant leads exclude Black and mark truncated market history as incomplete', async () => {
  const now = new Date().toISOString();
  const rows = Array.from({ length: 20 }, (_, i) => ({ soldAt: now, modelName: i < 12 ? 'Sebastian' : 'Other', backdropName: i < 12 ? 'Ivory White' : 'Black', normalizedPrice: 20 + i, market: 'mrkt' }));
  const result = await readVariantLeads('Pool Float', 'secret', { fetcher: async () => ({ ok: true, json: async () => ({ content: rows }) }), maxPages: 1 });
  assert.equal(result.complete, false);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].count, 12);
});
