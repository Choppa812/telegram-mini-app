import test from 'node:test';
import assert from 'node:assert/strict';
import { createSetupHandler } from './api/setup.js';
const env = { CRON_SECRET: 'test-secret', CONTROL_BOT_TOKEN: 'test-token', TELEGRAM_WEBHOOK_SECRET: 'webhook-secret', VERCEL_PROJECT_PRODUCTION_URL: 'gift-price-controller.vercel.app' };
function response() { return { statusCode: 0, body: null, setHeader(){}, status(n){this.statusCode=n;return this;}, json(b){this.body=b;return this;}, send(b){this.body=b;return this;}, end(){return this;} }; }
test('setup refuses invalid secret without calling Telegram', async () => {
  const res = response(); let calls = 0;
  await createSetupHandler(env, async () => { calls++; })({ method:'POST', body:{secret:'wrong'} },res);
  assert.equal(res.statusCode,401); assert.equal(calls,0);
});
test('setup configures only the dedicated bot and verifies webhook', async () => {
  const calls = [], res = response();
  await createSetupHandler(env, async (url, options) => {
    const method = url.split('/').at(-1); calls.push({method,payload:JSON.parse(options.body)});
    const result = method==='getMe'?{username:'GiftPriceControl812_bot'}:method==='getWebhookInfo'?{url:'https://gift-price-controller.vercel.app/api/telegram'}:true;
    return { ok:true, json:async()=>({ok:true,result}) };
  })({method:'POST',body:{secret:env.CRON_SECRET}},res);
  assert.equal(res.statusCode,200);
  assert.equal(calls.find(x=>x.method==='setWebhook').payload.secret_token, env.TELEGRAM_WEBHOOK_SECRET);
  assert.equal(JSON.stringify(res.body).includes(env.CONTROL_BOT_TOKEN),false);
});
test('setup refuses another bot token before changing its webhook', async () => {
  const res=response(); let calls=0;
  await createSetupHandler(env,async()=>{ calls++;return {ok:true,json:async()=>({ok:true,result:{username:'other_bot'}})}; })({method:'POST',body:{secret:env.CRON_SECRET}},res);
  assert.equal(res.statusCode,409); assert.equal(calls,1);
});
