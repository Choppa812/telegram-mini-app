import { matches } from "./core.js";
export function matchingSales(
  subscriptions,
  sales,
  settings,
  now = Date.now(),
  maxAgeMs = 10000,
) {
  if (!settings.notifications || !settings.salesNotifications) return [];
  const events = [];
  for (const subscription of subscriptions) {
    if (
      !subscription.enabled ||
      settings.exclusions.includes(subscription.collection)
    )
      continue;
    for (const sale of sales) {
      const age = now - Date.parse(sale.date);
      if (
        age < 0 ||
        age > maxAgeMs ||
        settings.exclusions.includes(sale.collection) ||
        !matches(subscription, sale) ||
        !subscription.notifyMarkets.includes(sale.market)
      )
        continue;
      events.push({
        key: subscription.id + "|sale|" + sale.id + "|" + sale.date,
        subscription,
        sale,
      });
    }
  }
  return events;
}
