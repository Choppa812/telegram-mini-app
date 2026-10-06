import { runtime, sameSecret } from '../runtime.js';
import { probeSatellite } from '../satellite.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method === 'GET') {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    return res.status(200).send('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Проверка API Gift Satellite</title><style>body{font:18px system-ui;max-width:650px;margin:60px auto;padding:20px}input,button{font:inherit;padding:10px;display:block;margin:15px 0}</style><h1>Проверка API Gift Satellite</h1><p>Только чтение ваших слотов и минимумов Portals/MRKT. Цены не меняет.</p><form method="POST"><label>Секрет проверки (CRON_SECRET)<input type="password" name="secret" required autocomplete="off"></label><button>Проверить API</button></form></html>');
  }
  if (req.method !== 'POST') return res.status(405).end();
  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body;
  if (!sameSecret(body?.secret, process.env.CRON_SECRET)) return res.status(401).json({ok:false});
  try {
    const result = await probeSatellite(process.env.GIFT_SATELLITE_API_KEY);
    const {send} = runtime();
    await send(result.ok ? `Проверка API Gift Satellite: чтение слотов работает.\nСлотов: ${result.slots}. Неактивных: ${result.inactiveSlots}.\nМинимумы: ${result.floors.map(f=>`${f.market}/${f.backdrop}: HTTP ${f.status}, ${f.collections} коллекций`).join('; ')}.\nЦены не менялись.` : `Проверка API Gift Satellite не прошла.\nПричина: ${result.reason}.\n${(result.attempts||[]).map(a=>`${a.mode}: HTTP ${a.status}`).join('; ')}\nЦены не менялись.`);
    const safe = JSON.stringify(result, null, 2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    return res.status(200).send(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Результат проверки API</title><h1>Результат проверки API Gift Satellite</h1><pre>${safe}</pre></html>`);
  } catch {
    try { await runtime().send('Проверка API Gift Satellite завершилась ошибкой соединения или формата ответа. Цены не менялись.'); } catch {}
    return res.status(503).json({ok:false,reason:'provider_request_failed'});
  }
}
