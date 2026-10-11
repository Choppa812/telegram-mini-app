const BASE = 'https://gift-satellite.dev/api';
const MODES = ['token'];

export async function readSatellite(path, params, key, mode, fetcher = fetch) {
  if (!['/user/subscriptions', '/user/me', '/user/purchases', '/gift/collections', '/history/collection-offers', '/history/floors', '/history/collections'].includes(path)) throw new Error('UNSUPPORTED_READ_PATH');
  if (!key || !MODES.includes(mode)) throw new Error('SATELLITE_CONFIGURATION_MISSING');
  const url = new URL(BASE + path);
  for (const [name, value] of Object.entries(params || {})) url.searchParams.set(name, String(value));
  const headers = { Authorization: `Token ${key}` };
  const response = await fetcher(url, { method: 'GET', headers: { ...headers, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    let message;
    try { const body = await response.json(); if (typeof body.message === 'string') message = body.message.replaceAll(key, '[REDACTED]').slice(0,160); } catch {}
    return { ok: false, status: response.status, message };
  }
  const data = await response.json();
  return { ok: true, status: response.status, data };
}

export async function probeSatellite(key, fetcher = fetch) {
  if (!key) return { ok: false, reason: 'key_missing' };
  const mode = 'token';
  const result = await readSatellite('/user/subscriptions', {}, key, mode, fetcher);
  const attempts = [{ mode, status: result.status, message: result.message }];
  if (!result.ok || !Array.isArray(result.data)) return { ok: false, reason: 'subscriptions_access_failed', attempts };
  const collections = await readSatellite('/gift/collections', {}, key, mode, fetcher);
  const offers = await readSatellite('/history/collection-offers', {}, key, mode, fetcher);
  return { ok: true, mode, attempts, slots: result.data.length, inactiveSlots: result.data.filter(s=>s.portalsAutobuy === false).length, slotFields: Object.keys(result.data[0] || {}), slotSample: result.data.slice(0,3).map(s=>({ id:s._id, collection:s.collectionName, backgrounds:s.backdropNames, models:s.modelNames, autobuy:s.portalsAutobuy, limit:s.portalsAutobuyMaxPrice })), collections: { status:collections.status,count:Array.isArray(collections.data)?collections.data.length:0 }, offers: { status:offers.status,count:Array.isArray(offers.data)?offers.data.length:0 }, writesPerformed: 0 };
}

