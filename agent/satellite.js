const BASE = 'https://gift-satellite.dev/api';
const MODES = ['auth-token', 'authorization', 'bearer', 'x-api-key'];

export async function readSatellite(path, params, key, mode, fetcher = fetch) {
  if (!['/user/subscriptions', '/gift/collections', '/history/floors'].includes(path)) throw new Error('UNSUPPORTED_READ_PATH');
  if (!key || !MODES.includes(mode)) throw new Error('SATELLITE_CONFIGURATION_MISSING');
  const url = new URL(BASE + path);
  for (const [name, value] of Object.entries(params || {})) url.searchParams.set(name, String(value));
  const headers = mode === 'auth-token' ? { authToken: key } : mode === 'x-api-key' ? { 'X-API-Key': key } : { Authorization: mode === 'bearer' ? `Bearer ${key}` : key };
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
  const attempts = [];
  let selected;
  for (const mode of MODES) {
    const result = await readSatellite('/user/subscriptions', {}, key, mode, fetcher);
    attempts.push({ mode, status: result.status, message: result.message });
    if (result.ok && Array.isArray(result.data)) { selected = { mode, subscriptions: result.data }; break; }
    if (![401, 403].includes(result.status)) break;
  }
  if (!selected) return { ok: false, reason: 'subscriptions_access_failed', attempts };
  const floors = [];
  for (const market of ['portals', 'mrkt']) {
    for (const black of [false, true]) {
      const result = await readSatellite('/history/floors', { market, ...(black ? { black: true } : {}) }, key, selected.mode, fetcher);
      const values = result.ok && result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? Object.entries(result.data) : [];
      floors.push({ market, backdrop: black ? 'Black' : '*', status: result.status, collections: values.length, sample: values.slice(0,3).map(([collection,price])=>({collection,price})) });
    }
  }
  return { ok: true, mode: selected.mode, attempts, slots: selected.subscriptions.length, inactiveSlots: selected.subscriptions.filter(s=>s.portalsAutobuy === false).length, slotFields: Object.keys(selected.subscriptions[0] || {}), slotSample: selected.subscriptions.slice(0,3).map(s=>({ id:s._id, collection:s.collectionName, backgrounds:s.backdropNames, models:s.modelNames, autobuy:s.portalsAutobuy, limit:s.portalsAutobuyMaxPrice })), floors, writesPerformed: 0 };
}
