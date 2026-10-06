import { dailyReport } from '../control.js';
import { runtime, sameSecret } from '../runtime.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.CRON_SECRET || !sameSecret(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) return res.status(401).end();
  try {
    // No Gift Satellite write adapter has been verified or connected yet.
    const result = await dailyReport(runtime());
    return res.status(200).json({ ok: true, status: result.status, duplicate: Boolean(result.duplicate) });
  } catch {
    return res.status(503).json({ ok: false });
  }
}
