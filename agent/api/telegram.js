import { catalogReview } from '../catalog-review.js';
import { readSatellite } from '../satellite.js';
import { scanCatalog } from '../catalog-scan.js';
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
import { applyPortfolio, applyBasePortfolio, applyFullPortfolio, applyPrestige, applyPortfolioSlot } from '../portfolio.js';
import { applyCompetitive } from '../competitive-apply.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sameSecret(req.headers['x-telegram-bot-api-secret-token'], process.env.TELEGRAM_WEBHOOK_SECRET)) return res.status(401).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const context=runtime();
    await handleCommand(body, { ...context, applyApproved:options=>{if(!process.env.PRIVATE_APPROVED_OVERRIDES)throw new Error('INVALID_PRIVATE_PORTFOLIO_PLAN');return applyPortfolioSlot(7,process.env.GIFT_SATELLITE_API_KEY,{...options,allowManualActivation:true});}, reviewCatalog:index=>catalogReview(index,{store:context.store,key:process.env.GIFT_SATELLITE_API_KEY,readProfile:()=>readSatellite('/user/me',{},process.env.GIFT_SATELLITE_API_KEY,'token')}), catalogAll:async()=>{const response=await fetch('https://gift-price-controller.vercel.app/api/catalog-worker',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('SCAN_START_FAILED');const run=await context.store.getCatalogRun();return 'Сбор каталога: '+run.status+'; обработано '+run.checked+'/'+(run.total??'?')+'; неполных '+run.incomplete+'. Итог придёт после завершения. Слоты не меняются.';}, catalogScan:async index=>{
      const r=await scanCatalog(process.env.GIFT_SATELLITE_API_KEY,{offset:index,limit:1,maxPages:100,onCollection:row=>context.store.saveCatalogCollection(index,row)});
      const row=r.collections[0];
      if(!row)return 'Каталог завершён; индекс вне списка.';
      return ['Каталог: '+(index+1)+'/'+r.catalogTotal+' — '+row.collection,'Моделей: '+row.models.length+'; фонов: '+row.backdrops.length+'; сочетаний с продажами: '+row.combinations.length,'История: '+(row.complete?'полная за 7 дней':'НЕПОЛНАЯ: '+row.error),'Сохранено в закрытом хранилище на 7 дней. Слоты не менялись.','Следующий индекс: '+(r.nextOffset??'конец')].join('\n');
    }, checkApi: () => probeSatellite(process.env.GIFT_SATELLITE_API_KEY), marketOverview: async () => marketOverviewText(await readMarketOverview(process.env.GIFT_SATELLITE_API_KEY)), floorOverview: async () => floorOverviewText(await readFloorOverview(process.env.GIFT_SATELLITE_API_KEY)), highBlackFloors: async () => highBlackFloorsText(await readHighBlackFloors(process.env.GIFT_SATELLITE_API_KEY)), inspectGift: async collection => inspectText(await inspectCollection(collection,process.env.GIFT_SATELLITE_API_KEY)), feeOverview: async () => feeOverviewText(await readFeeOverview(process.env.GIFT_SATELLITE_API_KEY)), turnoverOverview: async () => turnoverText(await readTurnover(process.env.GIFT_SATELLITE_API_KEY)), blackDailySales: async collection => blackSalesText(await countBlackSales(collection,process.env.GIFT_SATELLITE_API_KEY)), blackScan: async(index,floorLimit)=>blackScanText(await scanBlackBatch(index,process.env.GIFT_SATELLITE_API_KEY,undefined,undefined,undefined,floorLimit)),positionsOverview:async filter=>positionsText(await readPositions(process.env.GIFT_SATELLITE_API_KEY),filter),blackModels:async collection=>blackModelsText(await readBlackModels(collection,process.env.GIFT_SATELLITE_API_KEY)),modelMarkets:async collection=>modelMarketsText(await readBlackModels(collection,process.env.GIFT_SATELLITE_API_KEY)),crossMarket:async(collection,models)=>crossMarketText(await readCrossMarket(collection,process.env.GIFT_SATELLITE_API_KEY),models),variantLeads:async collection=>variantLeadsText(await readVariantLeads(collection,process.env.GIFT_SATELLITE_API_KEY)),variantDetail:async(collection,model,backdrop)=>variantText(await readVariant(collection,model,backdrop,process.env.GIFT_SATELLITE_API_KEY)),variantCross:async(collection,model,backdrop)=>crossMarketText(await readCrossMarket(collection,process.env.GIFT_SATELLITE_API_KEY,undefined,undefined,backdrop,model),[model]),applyBlack:options=>applyBasePortfolio(process.env.GIFT_SATELLITE_API_KEY,options),apply28:options=>applyPortfolio(process.env.GIFT_SATELLITE_API_KEY,options),applyAll:options=>applyFullPortfolio(process.env.GIFT_SATELLITE_API_KEY,options),applyCompetitive:options=>applyCompetitive(process.env.GIFT_SATELLITE_API_KEY,options),applyPrestige:options=>applyPrestige(process.env.GIFT_SATELLITE_API_KEY,options),cleanBlack:(batch,options)=>cleanBlackBatch(process.env.GIFT_SATELLITE_API_KEY,batch,options) });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false });
  }
}
