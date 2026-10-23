import { dailyReport } from '../control.js';
import { runtime, sameSecret } from '../runtime.js';
import { applyPortfolio, applyBasePortfolio } from '../portfolio.js';
export function createDailyHandler({ notifyOnError = false } = {}) { return async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.CRON_SECRET || !sameSecret(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) return res.status(401).end();
  try {
    const context=runtime();
    const result = await dailyReport({ ...context, notifyOnError, run: process.env.GIFT_SATELLITE_API_KEY ? async ({beforeWrite,onProgress}) => {
      const key=process.env.GIFT_SATELLITE_API_KEY;
      const existing=await applyBasePortfolio(key,{beforeWrite,onProgress});
      if(!await context.store.isPortfolioEnabled())return {status:'completed',...existing};
      const additions=await applyPortfolio(key,{beforeWrite,onProgress:progress=>onProgress({checked:existing.checked+progress.checked,changed:existing.changed+progress.changed,skipped:existing.skipped+progress.skipped,details:[...existing.details,...progress.details]})});
      return {status:'completed',checked:existing.checked+additions.checked,
        changed:existing.changed+additions.changed,skipped:existing.skipped+additions.skipped,
        details:[...existing.details,...additions.details]};
    } : undefined });
    return res.status(result.status === 'error' ? 503 : 200).json({ ok: result.status !== 'error', status: result.status, duplicate: Boolean(result.duplicate), retryable: Boolean(result.retryable) });
  } catch {
    return res.status(503).json({ ok: false });
  }
}; }
export default createDailyHandler();
