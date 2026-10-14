import { createHash } from 'node:crypto';
import { runtime, sameSecret } from '../runtime.js';
import { applyBlackPlan } from '../trading.js';

// Short-lived, single-use activation for the owner's approved five-gift plan.
const TOKEN_HASH = '6a32ace16c8ca0990c50d1c6e06c6d7bca854f3f2aa40b6adde5721ff9ff6887';
const OPERATION = 'approved-black-five-2026-10-14';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  const hash = token ? createHash('sha256').update(token).digest('hex') : '';
  if (!sameSecret(hash, TOKEN_HASH) || Date.now() > Date.parse('2026-10-15T03:00:00Z'))
    return res.status(401).end();

  let lease;
  try {
    const { store, send } = runtime();
    if (await store.isPaused()) return res.status(409).json({ ok: false, reason: 'paused' });
    lease = await store.claimDay(OPERATION);
    if (!lease) return res.status(409).json({ ok: false, reason: 'already_started_or_completed' });
    const result = await applyBlackPlan(process.env.GIFT_SATELLITE_API_KEY, {
      beforeWrite: async () => {
        if (await store.isPaused()) throw new Error('AUTOMATION_PAUSED');
      },
    });
    const report = { date: new Date().toISOString(), status: 'completed', ...result };
    await store.saveReport(report);
    await store.finishDay(OPERATION);
    try {
      await send(`Black — применён новый план. Изменено ${result.changed}, пропущено ${result.skipped}.\n${result.details.join('\n')}\nКаждая запись подтверждена повторным чтением API.`);
    } catch {}
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(503).json({ ok: false, reason: String(error?.message || 'APPLY_FAILED').slice(0, 100) });
  } finally {
    if (lease) {
      try { await runtime().store.releaseDay(OPERATION, lease); } catch {}
    }
  }
}
