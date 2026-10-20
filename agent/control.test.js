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
test('portfolio activation is owner-only, pause-guarded and enables daily work after a checked batch',async()=>{
  const s=setup();let calls=0,enabled=false;
  s.store.enablePortfolio=async()=>{enabled=true;};
  const deps={...s,apply28:async({batch,beforeWrite})=>{calls++;assert.equal(batch,0);await beforeWrite();return {checked:3,changed:3,skipped:0,details:['checked']};}};
  await handleCommand(update(1,'/apply28 0',7),deps);
  await handleCommand(update(2,'/apply28 0'),deps);
  assert.equal(calls,0);assert.equal(enabled,false);
  s.state.paused=false;
  await handleCommand(update(3,'/apply28 0'),deps);
  assert.equal(calls,1);assert.equal(enabled,true);
  assert.equal(s.state.report.changed,3);
});
test('competitive command is owner-only and checks pause before each provider write',async()=>{
  const s=setup();let calls=0;
  let leaseCount=0;
  s.store.claimCompetitive=async()=>++leaseCount===1?'lease':null;
  s.store.releaseCompetitive=async lease=>{assert.equal(lease,'lease');};
  const deps={...s,applyCompetitive:async({beforeWrite})=>{calls++;await beforeWrite();return {checked:4,changed:4,skipped:0,details:['four verified slots']};}};
  await handleCommand(update(1,'/applycompetitive',7),deps);
  await handleCommand(update(2,'/applycompetitive'),deps);
  assert.equal(calls,0);
  s.state.paused=false;
  await handleCommand(update(3,'/applycompetitive'),deps);
  assert.equal(calls,1);assert.equal(s.state.report.changed,4);
  assert.match(s.messages.at(-1),/Каждая запись проверена/);
  await handleCommand(update(3,'/applycompetitive'),deps);
  assert.equal(calls,1);
});
test('manual API check is owner-only, read-only, and does not resume paused automation', async () => {
  const s=setup();let calls=0;
  const deps={...s,checkApi:async()=>{calls++;return {ok:false,attempts:[{mode:'authorization',status:401}]};}};
  await handleCommand(update(1,'/checkapi',7),deps);assert.equal(calls,0);
  await handleCommand(update(2,'/checkapi'),deps);assert.equal(calls,1);
  assert.equal(s.state.paused,true); assert.match(s.messages[0],/HTTP 401/);
});
test('pause persists in shared store; replayed resume cannot undo it', async () => {
  const s = setup();
  await handleCommand(update(1, '/resume'), s);
  await handleCommand(update(2, '/pause'), s);
  await handleCommand(update(1, '/resume'), { ...s });
  assert.equal(s.state.paused, true);
  assert.ok(s.messages.includes(STOP_NOTICE));
});
test('paused daily cron stays silent across days and never calls provider', async () => {
  const s = setup(); let calls = 0;
  const run = async () => { calls++; };
  await dailyReport({ ...s, run });
  assert.deepEqual(await dailyReport({ ...s, run, now: new Date('2026-10-12T06:00:00Z') }), { status:'paused', silent:true });
  assert.equal(calls, 0);
  assert.equal(s.messages.length, 0);
  assert.equal(s.state.report, null);
  assert.equal(s.state.done, false);
});
test('resume after a silent paused run allows the same day to execute', async () => {
  const s=setup(); let calls=0;
  const run=async()=>{calls++;return {checked:1,changed:0,skipped:1};};
  await dailyReport({...s,run}); s.state.paused=false;
  await dailyReport({...s,run}); assert.equal(calls,1); assert.equal(s.messages.length,1);
});
test('pause suppresses retry of a previously undelivered cached report', async () => {
  const s=setup(); s.state.paused=false;
  await assert.rejects(dailyReport({...s,run:async()=>({checked:1,changed:0,skipped:1}),send:async()=>{throw Error('offline');}}));
  s.state.paused=true;
  assert.equal((await dailyReport(s)).silent,true); assert.equal(s.messages.length,0);
});
test('unconnected API is reported truthfully without inventing successful changes', async () => {
  const s = setup(); s.state.paused = false;
  const r = await dailyReport(s);
  assert.equal(r.status, 'disconnected');
  assert.equal(r.changed, undefined);
  assert.match(s.messages[0], /не изменялись/);
});
test('API authorization rejection is a blocked report rather than a completed price update', async () => {
  const s = setup(); s.state.paused = false;
  const r = await dailyReport({...s,run:async()=>({status:'blocked',reason:'api_authorization_failed',checked:0,changed:0,skipped:0})});
  assert.equal(r.status,'blocked'); assert.equal(r.changed,0);
  assert.match(s.messages[0],/отклонил постоянный API-ключ/);
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
  assert.equal(s.messages.length,1); // Only the explicit /pause confirmation.
});
test('provider failure never exposes credentials or pretends success', async () => {
  const s = setup(); s.state.paused = false;
  await dailyReport({ ...s, run: async () => { throw new Error('secret-key-example'); } });
  assert.equal(s.state.report.status, 'error');
  assert.ok(s.messages.every(x => !x.includes('secret-key-example')));
});
test('transient failure remains retryable and reports only verified progress and a safe reason', async () => {
  const s = setup(); s.state.paused = false; let runs = 0;
  const run = async ({onProgress}) => {
    runs++;
    if (runs === 1) {
      onProgress({checked:3,changed:1,skipped:2,details:['первый слот проверен']});
      throw new Error('EXACT_MARKET_UNAVAILABLE');
    }
    return {checked:28,changed:0,skipped:28,details:[]};
  };
  const first = await dailyReport({...s,run,notifyOnError:false});
  assert.equal(first.retryable,true);
  assert.equal(first.changed,1);
  assert.equal(s.state.done,false);
  assert.equal(s.state.dayReport,null);
  assert.equal(s.messages.length,0);
  const second = await dailyReport({...s,run});
  assert.equal(second.status,'completed');
  assert.equal(second.changed,1);
  assert.equal(runs,2);
  assert.equal(s.state.done,true);
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
test('Vercel KV integration variables are accepted without reading read-only credentials', async () => {
  const calls=[];
  const r=runtime({CONTROL_BOT_TOKEN:'token',CONTROL_OWNER_ID:'42',KV_REST_API_URL:'https://redis.example.test',KV_REST_API_TOKEN:'write-token',KV_REST_API_READ_ONLY_TOKEN:'read-token'},async(url,options)=>{calls.push(options);return {ok:true,json:async()=>({result:null})};});
  assert.equal(await r.store.isPaused(),true);
  assert.equal(calls[0].headers.Authorization,'Bearer write-token');
});
