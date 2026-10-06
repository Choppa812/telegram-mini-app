export const DAY_MS = 86_400_000;
export const PRICING_POLICY = Object.freeze({
  enabled: true,
  intervalMs: DAY_MS,
  minDiscountGram: 5,
  budgetGram: 50,
  reserveGram: 10,
  maxPositionGram: 10,
  minSales: 5,
  liquidSales: 20,
  minProfitGram: 1,
  minReturn: 0.10,
});

const positive = (n) => Number.isFinite(n) && n > 0;
const down = (n) => Math.floor((n + Number.EPSILON) * 10000) / 10000;
const keyOf = (g) => JSON.stringify([g.collection, g.backdrop, g.model || "*"]);

// The adapter must supply full, confirmed sales in GRAM, not Stars or offers.
export function validatePricingSnapshot(input, now = Date.now()) {
  const generated = Date.parse(input?.generatedAt);
  const from = Date.parse(input?.historyFrom);
  const to = Date.parse(input?.historyTo);
  if (!Number.isFinite(generated) || generated > now + 30000 || now - generated >= DAY_MS)
    throw Error("Снимок минимальных цен отсутствует или старше суток");
  if (input.currency !== "GRAM" || input.complete !== true || !Number.isFinite(from) ||
      !Number.isFinite(to) || to > generated + 30000 || generated - to > 300000 ||
      to - from < DAY_MS || to - from > 7 * DAY_MS)
    throw Error("Нужна полная история подтверждённых продаж в GRAM за 24 часа–7 дней");
  if (!Array.isArray(input.groups) || input.groups.length > 20000)
    throw Error("Некорректные группы цен");
  const seen = new Set();
  const groups = input.groups.map(g => {
    if (typeof g.collection !== "string" || !g.collection || g.collection.length > 100 ||
        !["*", "Black"].includes(g.backdrop) ||
        (g.model != null && (typeof g.model !== "string" || !g.model || g.model.length > 100)))
      throw Error("Некорректная комбинация подарка и фона");
    const key = keyOf(g);
    if (seen.has(key)) throw Error("Повторяющаяся комбинация");
    seen.add(key);
    if (!Array.isArray(g.floors) || !Array.isArray(g.sales) || g.sales.length > 100000)
      throw Error("Не указаны минимумы и продажи");
    const floors = g.floors.map(f => {
      if (!positive(f.priceGram) || typeof f.market !== "string" || !f.market)
        throw Error("Некорректная минимальная цена");
      return { market: f.market, priceGram: f.priceGram };
    });
    const ids = new Set();
    const sales = g.sales.filter(s => {
      const date = Date.parse(s.date);
      if (s.confirmed !== true || !positive(s.priceGram) || s.currency !== "GRAM" ||
          typeof s.id !== "string" || !s.id || typeof s.market !== "string" ||
          !Number.isFinite(date) || date < from || date > to)
        throw Error("Некорректная подтверждённая продажа");
      const id = JSON.stringify([s.market, s.id]);
      if (ids.has(id)) return false;
      ids.add(id);
      return true;
    });
    // Unknown fees block pricing instead of silently assuming zero.
    const costs = g.costs;
    const knownCosts = costs && ["buyFeePercent", "sellFeePercent", "fixedGram"].every(k =>
      Number.isFinite(costs[k]) && costs[k] >= 0) &&
      costs.buyFeePercent <= 100 && costs.sellFeePercent < 100;
    return { collection: g.collection, backdrop: g.backdrop, model: g.model || "*",
      floors, sales, costs: knownCosts ? costs : null };
  });
  return { generatedAt: new Date(generated).toISOString(), historyFrom: input.historyFrom,
    historyTo: input.historyTo, groups };
}

export function calculatePricing(snapshot, now = Date.now(), collections = []) {
  const valid = validatePricingSnapshot(snapshot, now);
  const rules = valid.groups.map(g => {
    const floor = g.floors.length ? Math.min(...g.floors.map(f => f.priceGram)) : null;
    // Normalize demand to the actual full observation window, not a projected day.
    const days = (Date.parse(valid.historyTo) - Date.parse(valid.historyFrom)) / DAY_MS;
    const salesPerDay = g.sales.length / days;
    const slow = salesPerDay < PRICING_POLICY.liquidSales;
    const discount = floor == null ? null : Math.max(5, floor * (slow ? 0.25 : g.backdrop === "Black" ? 0.20 : 0.15));
    const result = { collection: g.collection, backdrop: g.backdrop, model: g.model,
      floorGram: floor, discountGram: discount == null ? null : Number(discount.toFixed(4)),
      salesCount: g.sales.length, salesPerDay: Number(salesPerDay.toFixed(2)),
      buyLimitGram: null, eligible: false, checkedAt: valid.generatedAt };
    if (floor == null) return { ...result, reason: "Нет доступных предложений" };
    if (floor <= discount) return { ...result, reason: "Минимум минус запас не даёт положительной цены" };
    if (salesPerDay < PRICING_POLICY.minSales)
      return { ...result, reason: "Слишком мало подтверждённых продаж" };
    if (!g.costs) return { ...result, reason: "Не подтверждены комиссии и расходы" };
    const prices = g.sales.map(s => s.priceGram).sort((a, b) => a - b);
    const conservativeResale = prices[Math.floor((prices.length - 1) * 0.25)];
    const netResale = conservativeResale * (1 - g.costs.sellFeePercent / 100) - g.costs.fixedGram;
    const buyMultiplier = 1 + g.costs.buyFeePercent / 100;
    const profitLimit = Math.min((netResale - 1) / buyMultiplier, netResale / (buyMultiplier * 1.10));
    const limit = down(Math.min(floor - discount, profitLimit, PRICING_POLICY.maxPositionGram / buyMultiplier));
    if (limit <= 0) return { ...result, conservativeResaleGram: conservativeResale,
      reason: "Нет запаса прибыли после расходов" };
    return { ...result, conservativeResaleGram: conservativeResale, buyLimitGram: limit,
      eligible: true, reason: slow ? "Увеличен запас из-за слабого спроса" : "Порог рассчитан" };
  });
  const received = rules.length;
  for (const collection of collections) for (const backdrop of ["*", "Black"]) {
    if (!rules.some(r => r.collection === collection && r.backdrop === backdrop && r.model === "*"))
      rules.push({ collection, backdrop, model: "*", floorGram: null, discountGram: null,
        salesCount: null, salesPerDay: null, buyLimitGram: null, eligible: false,
        checkedAt: null, reason: "Источник не предоставил данные этой комбинации" });
  }
  return { ...PRICING_POLICY, lastSuccess: new Date(now).toISOString(),
    coverage: { receivedGroups: received, requiredBaseGroups: collections.length * 2 },
    snapshotAt: valid.generatedAt, historyFrom: valid.historyFrom, historyTo: valid.historyTo, rules };
}

export function pricingForSubscription(subscription, pricing, now = Date.now()) {
  if (!pricing || !Number.isFinite(Date.parse(pricing.snapshotAt)) ||
      Date.parse(pricing.snapshotAt) > now + 30000 ||
      now - Date.parse(pricing.snapshotAt) >= DAY_MS)
    return { buyLimit: null, pricingBlocked: true, pricingReason: "Минимальные цены устарели или не загружены" };
  // Number/symbol-specific premiums require their own comparable sales; do not apply a broad floor.
  if (subscription.collection === "*" || subscription.number || subscription.symbols?.length ||
      (subscription.backdrops?.length && (subscription.backdrops.length !== 1 || subscription.backdrops[0] !== "Black")))
    return { buyLimit: null, pricingBlocked: true, pricingReason: "Нужна отдельная оценка выбранных атрибутов" };
  const backdrop = subscription.backdrops?.[0] || "*";
  const models = subscription.models?.length ? subscription.models : ["*"];
  const rules = models.map(model => pricing.rules.find(r => r.collection === subscription.collection &&
    r.backdrop === backdrop && r.model === model));
  if (rules.some(r => !r?.eligible))
    return { buyLimit: null, pricingBlocked: true, pricingReason: rules.find(r => r && !r.eligible)?.reason || "Нет оценки этой комбинации" };
  return { buyLimit: Math.min(...rules.map(r => r.buyLimitGram)), pricingBlocked: false,
    pricingReason: "Ежедневный порог", pricingCheckedAt: pricing.snapshotAt };
}

export function pricingDue(lastSuccess, now = Date.now()) {
  const last = Date.parse(lastSuccess);
  return !Number.isFinite(last) || now - last >= DAY_MS;
}
