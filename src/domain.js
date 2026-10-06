export const levels = [
  { level: 1, xp: 0, fee: 3.4, cashback: 0.75 },
  { level: 2, xp: 100, fee: 3.2, cashback: 1 },
  { level: 3, xp: 500, fee: 3, cashback: 1.25 },
  { level: 4, xp: 1500, fee: 2.8, cashback: 1.5 },
  { level: 5, xp: 3000, fee: 2.6, cashback: 1.75 },
  { level: 6, xp: 6000, fee: 2.4, cashback: 2 },
  { level: 7, xp: 10000, fee: 2.2, cashback: 2.25 },
  { level: 8, xp: 25000, fee: 1.7, cashback: 2.5 },
];
export const fmt = (v) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 4 });
export const attributeName = (x) => (typeof x === "string" ? x : x.name);
export function levelInfo(xp) {
  const current = [...levels].reverse().find((l) => xp >= l.xp) || levels[0],
    next = levels.find((l) => l.level === current.level + 1);
  return {
    current,
    next,
    remaining: next ? Math.max(0, next.xp - xp) : 0,
    progress: next
      ? Math.min(
          100,
          Math.max(0, ((xp - current.xp) / (next.xp - current.xp)) * 100),
        )
      : 100,
  };
}
export function priceWithinLimit(total, feePercent) {
  if (total === "" || total == null) return null;
  const n = Number(total);
  return Number.isFinite(n) && n > 0 ? n / (1 + feePercent / 100) : null;
}
export function filterSubscriptions(
  rows,
  { query = "", status = "all", collection = "", backdrop = "" } = {},
) {
  return rows.filter(
    (s) =>
      (status === "all" || s.enabled === (status === "active")) &&
      (!collection || s.collection === collection) &&
      (!backdrop || s.backdrops.includes(backdrop)) &&
      `${s.name} ${s.collection} ${s.models.join(" ")} ${s.backdrops.join(" ")} ${s.number}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
}
export function purchaseStats(rows) {
  const confirmed = rows.filter(
    (p) => p.status === "confirmed" || p.status === "sold",
  );
  let profit = 0,
    knownProfit = 0;
  for (const p of confirmed) {
    if (
      p.status === "sold" &&
      Number.isFinite(p.saleTon) &&
      Number.isFinite(p.totalTon)
    ) {
      profit += p.saleTon - (p.saleFeeTon || 0) - p.totalTon;
      knownProfit++;
    }
  }
  return {
    count: confirmed.length,
    volume: confirmed.reduce(
      (n, p) => n + (Number.isFinite(p.totalTon) ? p.totalTon : 0),
      0,
    ),
    hold: confirmed
      .filter((p) => p.status !== "sold")
      .reduce((n, p) => n + (Number.isFinite(p.totalTon) ? p.totalTon : 0), 0),
    profit: knownProfit ? profit : null,
    xp: confirmed.reduce((n, p) => n + (Number.isFinite(p.xp) ? p.xp : 0), 0),
  };
}
export function filterPurchases(
  rows,
  { collection = "", number = "", from = "", to = "", hideSold = false } = {},
) {
  const start = from ? new Date(from + "T00:00:00").getTime() : -Infinity,
    end = to ? new Date(to + "T23:59:59.999").getTime() : Infinity;
  return rows.filter(
    (p) =>
      (!collection || p.collection === collection) &&
      (!number || String(p.number).includes(number)) &&
      (!hideSold || p.status !== "sold") &&
      Date.parse(p.createdAt) >= start &&
      Date.parse(p.createdAt) <= end,
  );
}
export function starsEstimate(stars, deduct, rates) {
  if (
    !Number.isFinite(rates?.starsUsdt) ||
    !Number.isFinite(rates?.tonUsdt) ||
    rates.starsUsdt <= 0 ||
    rates.tonUsdt <= 0
  )
    return null;
  const quantity = Number(stars);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const usdt = quantity * rates.starsUsdt * (deduct ? 0.8 : 1);
  return { usdt, ton: usdt / rates.tonUsdt };
}
export function nextDrop(now = Date.now()) {
  const day = 86400000,
    offset = 3 * 3600000,
    remaining = day - ((now + offset) % day);
  return {
    hours: Math.floor(remaining / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
  };
}
export function paginate(rows, page, size = 10) {
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    current = Math.min(pages, Math.max(1, page));
  return {
    rows: rows.slice((current - 1) * size, current * size),
    page: current,
    pages,
  };
}
