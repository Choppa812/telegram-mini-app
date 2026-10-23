import { handleCommand } from '../control.js';
import { runtime, sameSecret } from '../runtime.js';
import { probeSatellite } from '../satellite.js';
import { readMarketOverview, marketOverviewText, readFloorOverview, floorOverviewText, readHighBlackFloors, highBlackFloorsText } from '../market.js';
import { inspectCollection, inspectText } from '../inspect.js';
import { readFeeOverview, feeOverviewText } from '../fees.js';
import { readTurnover, turnoverText } from '../rank.js';
import { countBlackSales, blackSalesText } from '../blackday.js';
import { scanBlackBatch, blackScanText } from '../blackscan.js';
import { readPositions,positionsText,readBlackModels,blackModelsText,modelMarketsText } from '../planning.js';
import { readCrossMarket,crossMarketText } from '../cross.js';
import { readVariantLeads,variantLeadsText,readVariant,variantText } from '../variants.js';
import { cleanBlackBatch } from '../trading.js';
import { applyPortfolio, applyBasePortfolio, applyPrestige } from '../portfolio.js';
import { applyCompetitive } from '../competitive-apply.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameSecret(req.headers['x-telegram-bot-api-secret-token'], process.env.TELEGRAM_WEBHOOK_SECRET)) return res.status(401).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    await handleCommand(body, { ...runtime(), checkApi: () => probeSatellite(process.env.GIFT_SATELLITE_API_KEY), marketOverview: async () => marketOverviewText(await readMarketOverview(process.env.GIFT_SATELLITE_API_KEY)), floorOverview: async () => floorOverviewText(await readFloorOverview(process.env.GIFT_SATELLITE_API_KEY)), highBlackFloors: async () => highBlackFloorsText(await readHighBlackFloors(process.env.GIFT_SATELLITE_API_KEY)), inspectGift: async collection => inspectText(await inspectCollection(collection,process.env.GIFT_SATELLITE_API_KEY)), feeOverview: async () => feeOverviewText(await readFeeOverview(process.env.GIFT_SATELLITE_API_KEY)), turnoverOverview: async () => turnoverText(await readTurnover(process.env.GIFT_SATELLITE_API_KEY)), blackDailySales: async collection => blackSalesText(await countBlackSales(collection,process.env.GIFT_SATELLITE_API_KEY)), blackScan: async(index,floorLimit)=>blackScanText(await scanBlackBatch(index,process.env.GIFT_SATELLITE_API_KEY,undefined,undefined,undefined,floorLimit)),positionsOverview:async filter=>positionsText(await readPositions(process.env.GIFT_SATELLITE_API_KEY),filter),blackModels:async collection=>blackModelsText(await readBlackModels(collection,process.env.GIFT_SATELLITE_API_KEY)),modelMarkets:async collection=>modelMarketsText(await readBlackModels(collection,process.env.GIFT_SATELLITE_API_KEY)),crossMarket:async(collection,models)=>crossMarketText(await readCrossMarket(collection,process.env.GIFT_SATELLITE_API_KEY),models),variantLeads:async collection=>variantLeadsText(await readVariantLeads(collection,process.env.GIFT_SATELLITE_API_KEY)),variantDetail:async(collection,model,backdrop)=>variantText(await readVariant(collection,model,backdrop,process.env.GIFT_SATELLITE_API_KEY)),variantCross:async(collection,model,backdrop)=>crossMarketText(await readCrossMarket(collection,process.env.GIFT_SATELLITE_API_KEY,undefined,undefined,backdrop,model),[model]),applyBlack:options=>applyBasePortfolio(process.env.GIFT_SATELLITE_API_KEY,options),apply28:options=>applyPortfolio(process.env.GIFT_SATELLITE_API_KEY,options),applyCompetitive:options=>applyCompetitive(process.env.GIFT_SATELLITE_API_KEY,options),applyPrestige:options=>applyPrestige(process.env.GIFT_SATELLITE_API_KEY,options),cleanBlack:(batch,options)=>cleanBlackBatch(process.env.GIFT_SATELLITE_API_KEY,batch,options) });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false });
  }
}
