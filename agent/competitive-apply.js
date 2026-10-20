import { applyBlackPlan, BLACK_PLAN } from './trading.js';
import { applyPortfolioSlot, loadPortfolio } from './portfolio.js';

export async function applyCompetitive(key, options={}) {
  const portfolio=options.portfolio||loadPortfolio();
  const targets=[17,20,23];
  if(targets.some(slot=>portfolio.find(row=>row.slot===slot)?.pricing!=='competitive'))
    throw new Error('COMPETITIVE_PLAN_NOT_PUBLISHED');
  const result={checked:0,changed:0,skipped:0,details:[]};
  const first=await applyBlackPlan(key,{...options,plans:BLACK_PLAN.filter(row=>row.pricing==='competitive')});
  result.checked+=first.checked;result.changed+=first.changed;result.skipped+=first.skipped;result.details.push(...first.details);
  if(options.onProgress)await options.onProgress({...result,details:[...result.details]});
  for(const number of targets){
    const row=await applyPortfolioSlot(number,key,{...options,portfolio});
    result.checked++;
    if(row.changed)result.changed++;else result.skipped++;
    result.details.push(row.changed
      ? row.disabled ? `#${number} ${row.collection} / ${row.model}: выключен — мало продаж`
        : `#${number} ${row.collection} / ${row.model} / Black: ${row.price.toFixed(2)} TON; ${row.daySales}/${row.weekSales} продаж`
      : `#${number}: ${row.reason}`);
    if(options.onProgress)await options.onProgress({...result,details:[...result.details]});
  }
  return result;
}
