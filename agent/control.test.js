import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyReport, handleCommand, STOP_NOTICE } from './control.js';
import { sameSecret, runtime } from './runtime.js';

function setup() {
  const state = { paused: true, update: -1, report: null, dayReport: null, done: false, lease: null };
  const messages = [];
  const store = {
    isPaused: async () => state.paused,
    command: async (id, paused) => { if (id <= state.update) return false; state.update = id; state.paused = paused; return true; },
    getReport: async () => state.report,
    saveReport: async report => { state.report = report; },
    getDayReport: async () => state.dayReport,
    saveDayReport: async (day, report) => { state.dayReport = report; },
    claimDay: async () => { if (state.done || state.lease) return null; state.lease = 'lease'; return state.lease; },
    finishDay: async () => { state.done = true; },
    releaseDay: async () => { state.lease = null; },
  };
  return { state, messages, store, ownerId: '42', send: async text => { messages.push(text); } };
}
const update = (id, text, from = 42, type = 'private') => ({ update_id: id, message: { from: { id: from }, chat: { id: from, type }, text } });

test('only owner private messages may change control state', async () => {
  const s = setup();
  assert.equal(await handleCommand(update(1, '/resume', 7), s), false);
  assert.equal(await handleCommand(update(2, '/resume', 42, 'group'), s), false);
  assert.equal(s.state.paused, true);
  assert.equal(s.messages.length, 0);
});
test('pause persists in shared store; replayed resume cannot undo it', async () => {
  const s = setup();
  await handleCommand(update(1, '/resume'), s);
  await handleCommand(update(2, '/pause'), s);
  await handleCommand(update(1, '/resume'), { ...s });
  assert.equal(s.state.paused, true);
  assert.ok(s.messages.includes(STOP_NOTICE));
});
test('daily cron sends paused report once and never calls provider', async () => {
  const s = setup(); let calls = 0;
  const run = async () => { calls++; };
  await dailyReport({ ...s, run });
  assert.deepEqual(await dailyReport({ ...s, run }), { duplicate: true });
  assert.equal(calls, 0);
  assert.equal(s.messages.length, 1);
  assert.equal(s.state.report.status, 'paused');
});
test('unconnected API is reported truthfully without inventing successful changes', async () => {
  const s = setup(); s.state.paused = false;
  const r = await dailyReport(s);
  assert.equal(r.status, 'disconnected');
  assert.equal(r.changed, undefined);
  assert.match(s.messages[0], /не изменялись/);
});
test('pause during a run stops the next write', async () => {
  const s = setup(); s.state.paused = false; let writes = 0;
  await dailyReport({ ...s, run: async ({ beforeWrite }) => {
    await beforeWrite(); writes++;
    await handleCommand(update(10, '/pause'), s);
    await beforeWrite(); writes++;
    return { checked: 2, changed: 2, skipped: 0 };
  } });
  assert.equal(writes, 1);
  assert.equal(s.state.report.status, 'paused');
});
test('provider failure never exposes credentials or pretends success', async () => {
  const s = setup(); s.state.paused = false;
  await dailyReport({ ...s, run: async () => { throw new Error('secret-key-example'); } });
  assert.equal(s.state.report.status, 'error');
  assert.ok(s.messages.every(x => !x.includes('secret-key-example')));
});
test('undelivered report is retried without repeating a completed calculation', async () => {
  const s = setup(); s.state.paused = false; let runs = 0;
  const run = async () => { runs++; return { checked: 1, changed: 1, skipped: 0 }; };
  await assert.rejects(dailyReport({ ...s, run, send: async () => { throw new Error('offline'); } }));
  assert.equal(s.state.done, false);
  assert.equal(s.state.lease, null);
  await dailyReport({ ...s, run });
  assert.equal(s.state.done, true);
  assert.equal(runs, 1);
});
test('webhook secrets and configuration fail closed', () => {
  assert.equal(sameSecret('a', ''), false);
  assert.equal(sameSecret(undefined, 'a'), false);
  assert.equal(sameSecret('wrong', 'right'), false);
  assert.equal(sameSecret('right', 'right'), true);
  assert.throws(() => runtime({}), /CONFIGURATION_MISSING/);
});
test('storage outage prevents provider writes', async () => {
  const s = setup(); let calls = 0;
  s.store.isPaused = async () => { throw new Error('offline'); };
  await assert.rejects(dailyReport({ ...s, run: async () => { calls++; } }));
  assert.equal(calls, 0);
  assert.equal(s.state.lease, null);
});
