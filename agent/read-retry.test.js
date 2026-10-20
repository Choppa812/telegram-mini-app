import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchReadWithRetry } from './read-retry.js';

test('read retries a temporary provider refusal with a fresh request signal', async () => {
  const signals = [];
  const waits = [];
  const response = await fetchReadWithRetry('https://example.test/read', { method: 'GET' }, async (_url, options) => {
    signals.push(options.signal);
    return { status: signals.length === 1 ? 429 : 200 };
  }, async ms => { waits.push(ms); });
  assert.equal(response.status, 200);
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.deepEqual(waits, [400]);
});

test('read does not retry permanent refusals or more than three transient failures', async () => {
  let calls = 0;
  const permanent = await fetchReadWithRetry('https://example.test/read', {}, async () => {
    calls++; return { status: 401 };
  }, async () => {});
  assert.equal(permanent.status, 401);
  assert.equal(calls, 1);
  const unavailable = await fetchReadWithRetry('https://example.test/read', {}, async () => {
    calls++; return { status: 503 };
  }, async () => {});
  assert.equal(unavailable.status, 503);
  assert.equal(calls, 4);
});
