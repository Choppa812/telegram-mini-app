import { handleCommand } from '../control.js';
import { runtime, sameSecret } from '../runtime.js';
import { probeSatellite } from '../satellite.js';
import { readMarketOverview, marketOverviewText, readFloorOverview, floorOverviewText } from '../market.js';
import { inspectCollection, inspectText } from '../inspect.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameSecret(req.headers['x-telegram-bot-api-secret-token'], process.env.TELEGRAM_WEBHOOK_SECRET)) return res.status(401).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    await handleCommand(body, { ...runtime(), checkApi: () => probeSatellite(process.env.GIFT_SATELLITE_API_KEY), marketOverview: async () => marketOverviewText(await readMarketOverview(process.env.GIFT_SATELLITE_API_KEY)), floorOverview: async () => floorOverviewText(await readFloorOverview(process.env.GIFT_SATELLITE_API_KEY)), inspectGift: async collection => inspectText(await inspectCollection(collection,process.env.GIFT_SATELLITE_API_KEY)) });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false });
  }
}
