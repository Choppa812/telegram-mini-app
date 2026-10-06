import { randomUUID, timingSafeEqual } from 'node:crypto';

export function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function runtime(env = process.env, fetcher = fetch) {
  env = { ...env, UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN };
  const required = ['CONTROL_BOT_TOKEN', 'CONTROL_OWNER_ID', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  if (required.some(key => !env[key])) throw new Error('CONTROL_CONFIGURATION_MISSING');
  if (!/^\d+$/.test(env.CONTROL_OWNER_ID)) throw new Error('INVALID_OWNER');
  const redisUrl = new URL(env.UPSTASH_REDIS_REST_URL);
  if (redisUrl.protocol !== 'https:') throw new Error('INVALID_STORE_URL');
  const redis = async (...command) => {
    const response = await fetcher(redisUrl, { method: 'POST', headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('STORE_UNAVAILABLE');
    const data = await response.json();
    if (data.error) throw new Error('STORE_COMMAND_FAILED');
    return data.result;
  };
  const prefix = `satellite-control:${env.CONTROL_OWNER_ID}:`;
  const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
  const store = {
    // Missing state is paused. Unavailable storage throws and prevents writes.
    isPaused: async () => (await redis('GET', `${prefix}paused`)) !== '0',
    command: async (id, paused) => redis('EVAL', "local old=redis.call('GET',KEYS[1]); if old and tonumber(old)>=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[1]); redis.call('SET',KEYS[2],ARGV[2]); return 1", 2, `${prefix}update`, `${prefix}paused`, String(id), paused ? '1' : '0'),
    getReport: async () => decode(await redis('GET', `${prefix}report`)),
    saveReport: report => redis('SET', `${prefix}report`, JSON.stringify(report)),
    getDayReport: async day => decode(await redis('GET', `${prefix}result:${day}`)),
    saveDayReport: (day, report) => redis('SET', `${prefix}result:${day}`, JSON.stringify(report), 'EX', '259200'),
    claimDay: async day => {
      const lease = randomUUID();
      const ok = await redis('EVAL', "if redis.call('EXISTS',KEYS[1])==1 then return 0 end; if redis.call('SET',KEYS[2],ARGV[1],'NX','EX',ARGV[2]) then return 1 end; return 0", 2, `${prefix}done:${day}`, `${prefix}lease:${day}`, lease, '600');
      return ok ? lease : null;
    },
    finishDay: day => redis('SET', `${prefix}done:${day}`, '1', 'EX', '259200'),
    releaseDay: (day, lease) => redis('EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0", 1, `${prefix}lease:${day}`, lease),
  };
  const send = async text => {
    const response = await fetcher(`https://api.telegram.org/bot${env.CONTROL_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.CONTROL_OWNER_ID, text, reply_markup: { keyboard: [[{ text: '/status' }, { text: '/report' }], [{ text: '/pause' }, { text: '/resume' }]], resize_keyboard: true } }), signal: AbortSignal.timeout(10000) });
    if (!response.ok || !(await response.json()).ok) throw new Error('REPORT_DELIVERY_FAILED');
  };
  return { ownerId: env.CONTROL_OWNER_ID, store, send };
}
