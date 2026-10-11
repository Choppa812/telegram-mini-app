import { readSatellite } from './satellite.js';

const median = numbers => numbers.length ? [...numbers].sort((a,b)=>a-b)[Math.floor((numbers.length-1)/2)] : null;

export async function readFeeOverview(key, fetcher = fetch) {
  const [profile,purchases] = await Promise.all([
    readSatellite('/user/me',{},key,'token',fetcher),
    readSatellite('/user/purchases',{page:0},key,'token',fetcher),
  ]);
  if (!profile.ok || !purchases.ok) return {ok:false,profileStatus:profile.status,purchasesStatus:purchases.status};
  const rows = Array.isArray(purchases.data?.purchases) ? purchases.data.purchases : [];
  const ratios = rows.filter(row=>row.currency==='ton'&&typeof row.price==='number'&&Number.isFinite(row.price)&&row.price>0&&typeof row.feeSum==='number'&&Number.isFinite(row.feeSum)&&row.feeSum>=0).map(row=>row.feeSum/row.price);
  return {ok:true,balance:typeof profile.data?.tonBalance==='number'&&Number.isFinite(profile.data.tonBalance)?profile.data.tonBalance:null,purchaseCount:rows.length,feesMeasured:ratios.length,medianPurchaseFeeRate:median(ratios),configuredFeeSum:profile.data?.levelConfig?.feeSum??null,writesPerformed:0};
}

export function feeOverviewText(result) {
  if (!result?.ok) return `Комиссии пока не прочитаны: профиль HTTP ${result?.profileStatus??'?'}, покупки HTTP ${result?.purchasesStatus??'?'}.`;
  const percent=n=>Number.isFinite(n)?`${(n*100).toFixed(2)}%`:'—';
  return `Gift Satellite — комиссии по покупкам\nБаланс: ${result.balance===null?'—':result.balance.toFixed(2)} TON. Покупок в выборке: ${result.purchaseCount}; с комиссией: ${result.feesMeasured}. Медианная комиссия покупки: ${percent(result.medianPurchaseFeeRate)}. levelConfig.feeSum: ${result.configuredFeeSum??'—'} (значение из API, смысл уточняется). Комиссия последующей продажи здесь не учтена. Слоты не менялись.`;
}
