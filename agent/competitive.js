// A bid may approach the listing floor, but it must still leave room for
// purchase fees, likely resale fees, and a minimum profit at a conservative
// completed-sale price. Never infer a safe exit from a lone listing.
export function competitivePrice({ ceiling, day, week, floor, buyFee = 0.03, sellFee = 0.02, minProfit = 1.5 }) {
  if (![ceiling, day, week, floor, buyFee, sellFee, minProfit].every(Number.isFinite) ||
      ceiling <= 0 || day <= 0 || week <= 0 || floor <= 0 || buyFee < 0 || sellFee < 0 || minProfit < 0)
    throw new Error('INVALID_COMPETITIVE_PRICE_INPUT');
  const sale = Math.min(day, week);
  const marginCap = (sale * (1 - sellFee) - minProfit) / (1 + buyFee);
  return Math.floor((Math.min(ceiling, marginCap, floor - 0.5) + 1e-9) * 100) / 100;
}
