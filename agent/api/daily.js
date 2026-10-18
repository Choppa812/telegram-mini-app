import { dailyReport } from '../control.js';
import { runtime, sameSecret } from '../runtime.js';
import { applyPortfolio } from '../portfolio.js';
import { applyBlackPlan } from '../trading.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.CRON_SECRET || !sameSecret(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) return res.status(401).end();
  try {
    const context=runtime();
    const result = await dailyReport({ ...context, run: process.env.GIFT_SATELLITE_API_KEY ? async ({beforeWrite}) => {
      const key=process.env.GIFT_SATELLITE_API_KEY;
      const existing=await applyBlackPlan(key,{beforeWrite});
      if(!await context.store.isPortfolioEnabled())return {status:'completed',...existing};
      const additions=await applyPortfolio(key,{beforeWrite});
      return {status:'completed',checked:existing.checked+additions.checked,
        changed:existing.changed+additions.changed,skipped:existing.skipped+additions.skipped,
        details:[...existing.details,...additions.details]};
    } : undefined });
    return res.status(200).json({ ok: true, status: result.status, duplicate: Boolean(result.duplicate) });
  } catch {
    return res.status(503).json({ ok: false });
  }
}
