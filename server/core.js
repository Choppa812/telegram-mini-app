import visualCatalog from "./visual-catalog.json" with { type: "json" };
import { createHmac, timingSafeEqual } from "node:crypto";
import observed from "./observed-catalog.json" with { type: "json" };
export const MARKETS = ["Telegram", "Portals", "MRKT", "Tonnel", "Getgems"];
export function monitorConfig(env = {}) {
  const intervalMs = Number(env.MONITOR_INTERVAL_MS || 2000),
    maxFeedAgeMs = Number(env.MAX_FEED_AGE_MS || 10000);
  if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60000)
    throw Error("MONITOR_INTERVAL_MS должен быть от 1000 до 60000");
  if (
    !Number.isInteger(maxFeedAgeMs) ||
    maxFeedAgeMs < intervalMs ||
    maxFeedAgeMs > 300000
  )
    throw Error(
      "MAX_FEED_AGE_MS должен быть не меньше интервала и не больше 300000",
    );
  return { intervalMs, maxFeedAgeMs };
}
export const titles = [
  "Lol Pop",
  ...Object.keys(visualCatalog.collections).filter((n) => n !== "Lol Pop"),
];
export const catalog = titles.map((name) => ({
  name,
  models: [],
  backdrops: [],
  symbols: [],
}));
Object.assign(
  catalog.find((c) => c.name === "Lol Pop"),
  observed.lolPop,
);
const lush = catalog.find((c) => c.name === "Lush Bouquet");
lush.models = [
  "Butterflies",
  "Cable Mess",
  "Catnip",
  "Chamomile",
  "Fishbowl Vase",
  "Garden Roses",
  "Golden Petals",
  "Lotus Garden",
  "Love Potion",
  "Million Roses",
  "Moonlight",
  "Narcissus",
  "Peashooter",
  "Silvershade",
  "Snowrose",
  "Tulips",
  "Wildfire",
  "Fast Food",
  "Rafflesia",
  "Happy Toys",
  "Neon Sign",
  "Nucleus",
  "Fisherman",
  "Lobsters",
  "Skull Flowers",
  "Mushrooms",
  "Chompy",
  "Balloons",
  "Venus Flytrap",
  "Benjamins",
  "Mandrake",
  "Oculus",
  "Dandelions",
  "Artichoke",
  "Cactus",
  "Cabbage",
  "Cotton",
  "Carrots",
  "Crocodile",
  "Berries",
  "Maple Leaves",
  "Lavender",
  "Missing Shoe",
  "Sunflowers",
  "Frida Planter",
  "Harvest",
  "Donuts",
  "Purple Lilac",
  "Oak Crown",
  "Yarn Balls",
];
lush.backdrops = ["Black", "Onyx Black"];
for (const c of catalog) {
  const rarity = new Map(c.models.map(m => [typeof m === "string" ? m : m.name, typeof m === "object" ? m.rarity : null]));
  c.models = Object.keys(visualCatalog.models[c.name] || {}).map(name => rarity.get(name) != null ? {name,rarity:rarity.get(name)} : name);
  c.backdrops = Object.keys(visualCatalog.backdrops);
  c.symbols = visualCatalog.collectionSymbols?.[c.name] || Object.keys(visualCatalog.symbols);
}
function list(value, max = 500) {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((v) => typeof v !== "string" || !v.trim() || v.length > 100)
  )
    throw Error("Некорректный список");
  return [...new Set(value)];
}
function price(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1e7)
    throw Error("Цена должна быть положительным числом");
  return n;
}
export function validateSubscription(body) {
  if (!body || typeof body !== "object") throw Error("Некорректная подписка");
  const name = String(body.name || body.collection || "").trim(),
    collection = String(body.collection || "").trim(),
    number = String(body.number || "")
      .trim()
      .toUpperCase();
  if (!name || name.length > 100 || !collection || collection.length > 100)
    throw Error("Укажите название и коллекцию");
  if (number && !/^\d{1,12}$|^[A-Z]{1,12}$/.test(number))
    throw Error("Номер: цифры или паттерн из латинских букв");
  if (body.buy)
    throw Error("Автопокупка недоступна до подключения торгового API");
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000)
    throw Error("Количество должно быть от 1 до 1000");
  const buyMarkets = list(body.buyMarkets),
    notifyMarkets = list(body.notifyMarkets);
  if ([...buyMarkets, ...notifyMarkets].some((m) => !MARKETS.includes(m)))
    throw Error("Неизвестная площадка");
  if ((body.notifyPrice || body.notifyNew) && !notifyMarkets.length)
    throw Error("Выберите площадку уведомлений");
  return {
    name,
    collection,
    number,
    quantity,
    models: list(body.models),
    backdrops: list(body.backdrops),
    symbols: list(body.symbols),
    buy: false,
    buyLimit: price(body.buyLimit),
    notifyLimit: price(body.notifyLimit),
    buyMarkets,
    notifyMarkets,
    notifyPrice: !!body.notifyPrice,
    notifyNew: !!body.notifyNew,
    enabled: body.enabled !== false,
  };
}
export function validateSettings(body) {
  if (typeof body?.notifications !== "boolean")
    throw Error("Некорректные настройки");
  const exclusions = list(body.exclusions);
  if (!Array.isArray(body.presets) || body.presets.length > 100)
    throw Error("Некорректные пресеты");
  const presets = body.presets.map((p) => {
    if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 80)
      throw Error("Укажите название пресета");
    return { name: p.name.trim(), values: list(p.values) };
  });
  if (body.autoBuy)
    throw Error("Автопокупка недоступна до подключения торгового API");
  const language = body.language || "ru";
  if (!["ru", "en", "zh", "fa", "uz"].includes(language))
    throw Error("Неизвестный язык");
  return {
    notifications: body.notifications,
    dailyPricing: body.dailyPricing !== false,
    salesNotifications: !!body.salesNotifications,
    autoBuy: false,
    language,
    exclusions,
    presets,
  };
}
export function validInitData(raw, token, owner, now = Date.now()) {
  if (!raw || !token || !owner)
    throw Error("Настройте BOT_TOKEN и OWNER_ID на сервере");
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!/^[0-9a-f]{64}$/.test(hash || ""))
    throw Error("Недействительная Telegram-авторизация");
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length)
    throw Error("Недействительная Telegram-авторизация");
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(Buffer.from(hash, "hex"), expected))
    throw Error("Недействительная Telegram-авторизация");
  const time = Number(params.get("auth_date"));
  if (
    !Number.isSafeInteger(time) ||
    time > now / 1000 + 30 ||
    now / 1000 - time > 3600
  )
    throw Error("Авторизация истекла. Откройте приложение заново.");
  let user;
  try {
    user = JSON.parse(params.get("user"));
  } catch {
    throw Error("Недействительный пользователь");
  }
  if (String(user?.id) !== String(owner))
    throw Error("Это личное приложение. Доступ только владельцу.");
  return user;
}
export function matchesNumber(pattern, number) {
  if (!pattern) return true;
  const value = String(number);
  if (/^\d+$/.test(pattern)) return pattern === value;
  if (value.length !== pattern.length) return false;
  const f = new Map(),
    r = new Map();
  for (let i = 0; i < value.length; i++) {
    const a = pattern[i],
      b = value[i];
    if ((f.has(a) && f.get(a) !== b) || (r.has(b) && r.get(b) !== a))
      return false;
    f.set(a, b);
    r.set(b, a);
  }
  return true;
}
export function matches(s, o) {
  return (
    (s.collection === "*" || s.collection === o.collection) &&
    (!s.models.length || s.models.includes(o.model)) &&
    (!s.backdrops.length || s.backdrops.includes(o.backdrop)) &&
    (!s.symbols.length || s.symbols.includes(o.symbol)) &&
    matchesNumber(s.number, o.number)
  );
}
export function normalizeFeed(feed, now = Date.now(), maxAgeMs = 300000) {
  if (
    !feed ||
    !Number.isFinite(Date.parse(feed.generatedAt)) ||
    Date.parse(feed.generatedAt) > now + 30000 ||
    now - Date.parse(feed.generatedAt) > maxAgeMs
  )
    throw Error("Источник данных отсутствует или устарел");
  function rows(input, sale = false) {
    if (!Array.isArray(input) || input.length > 100000)
      throw Error("Некорректный источник");
    const seen = new Set();
    return input.map((o) => {
      if (
        !MARKETS.includes(o.market) ||
        typeof o.id !== "string" ||
        !o.id ||
        o.id.length > 200 ||
        !Number.isFinite(o.priceTon) ||
        o.priceTon <= 0 ||
        o.priceTon > 1e7 ||
        !/^\d{1,12}$/.test(String(o.number)) ||
        typeof o.collection !== "string" ||
        !o.collection ||
        o.collection.length > 100
      )
        throw Error("Некорректное предложение");
      for (const key of ["model", "backdrop", "symbol"])
        if (
          o[key] != null &&
          (typeof o[key] !== "string" || o[key].length > 100)
        )
          throw Error("Некорректный атрибут");
      if (
        o.priceStars != null &&
        (!Number.isSafeInteger(o.priceStars) || o.priceStars <= 0)
      )
        throw Error("Некорректная цена Stars");
      if (
        sale &&
        (!Number.isFinite(Date.parse(o.date)) ||
          Date.parse(o.date) > now + 30000)
      )
        throw Error("Некорректная дата продажи");
      const id =
        `${o.market}:${o.id}` +
        (sale ? `:${new Date(o.date).toISOString()}` : "");
      if (seen.has(id)) throw Error("Повторяющийся идентификатор");
      seen.add(id);
      return {
        id,
        market: o.market,
        collection: o.collection,
        number: String(o.number),
        model: o.model || "",
        backdrop: o.backdrop || "",
        symbol: o.symbol || "",
        priceTon: o.priceTon,
        ...(o.priceStars != null ? { priceStars: o.priceStars } : {}),
        ...(sale ? { date: new Date(o.date).toISOString() } : {}),
      };
    });
  }
  const nextCatalog = Array.isArray(feed.catalog)
    ? feed.catalog.map((c) => {
        if (typeof c.name !== "string" || !c.name || c.name.length > 100)
          throw Error("Некорректная коллекция");
        const models = c.models || [];
        if (!Array.isArray(models) || models.length > 500)
          throw Error("Некорректные модели");
        return {
          name: c.name,
          models: models.map((m) => {
            if (typeof m === "string") return list([m])[0];
            const name = list([m?.name])[0];
            if (
              m.rarity != null &&
              (!Number.isFinite(m.rarity) || m.rarity < 0 || m.rarity > 100)
            )
              throw Error("Некорректная редкость");
            return { name, ...(m.rarity != null ? { rarity: m.rarity } : {}) };
          }),
          backdrops: list(c.backdrops || []),
          symbols: list(c.symbols || []),
        };
      })
    : catalog;
  return {
    generatedAt: feed.generatedAt,
    catalog: nextCatalog,
    offers: rows(feed.offers),
    sales: rows(feed.sales || [], true),
  };
}
