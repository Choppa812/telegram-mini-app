import { dailyReport } from '../control.js';
import { runtime, sameSecret } from '../runtime.js';
import { checkDailySatellite } from '../satellite.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.CRON_SECRET || !sameSecret(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) return res.status(401).end();
  try {
    const result = await dailyReport({ ...runtime(), run: process.env.GIFT_SATELLITE_API_KEY ? () => checkDailySatellite(process.env.GIFT_SATELLITE_API_KEY) : undefined });
    return res.status(200).json({ ok: true, status: result.status, duplicate: Boolean(result.duplicate) });
  } catch {
    return res.status(503).json({ ok: false });
  }
}
