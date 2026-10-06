import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import {
  randomUUID,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  catalog,
  MARKETS,
  validateSubscription,
  validateSettings,
  validInitData,
  matches,
  normalizeFeed,
  monitorConfig,
} from "./core.js";
import { matchingSales } from "./notifications.js";
import { PRICING_POLICY, calculatePricing, pricingForSubscription, pricingDue } from "./pricing.js";
const local = process.env.LOCAL_PREVIEW === "1",
  root = resolve("dist"),
  dataDir = resolve(process.env.DATA_DIR || "data"),
  token = process.env.BOT_TOKEN,
  owner = process.env.OWNER_ID;
const monitorOptions = monitorConfig(process.env);
await mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(resolve(dataDir, "app.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS events(key TEXT PRIMARY KEY,state TEXT NOT NULL);CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS api_access(id INTEGER PRIMARY KEY,hash TEXT NOT NULL,created_at TEXT NOT NULL)",
);
const defaults = {
  dailyPricing: true,
  notifications: true,
  salesNotifications: false,
  autoBuy: false,
  language: "ru",
  exclusions: [],
  presets: [],
};
const rawSubscriptions = () =>
  db
    .prepare("SELECT id,body FROM subscriptions ORDER BY rowid DESC")
    .all()
    .map((r) => ({ id: r.id, ...JSON.parse(r.body) }));
const settings = () => ({
  ...defaults,
  ...JSON.parse(
    db.prepare("SELECT body FROM settings WHERE id=1").get()?.body || "{}",
  ),
});
db.exec("CREATE TABLE IF NOT EXISTS pricing(id INTEGER PRIMARY KEY,body TEXT NOT NULL)");
let pricingState = JSON.parse(db.prepare("SELECT body FROM pricing WHERE id=1").get()?.body || "null");
let pricingError = "", pricingAttempt = 0, pricingChecking = false;
const subscriptions = () => rawSubscriptions().map(s => settings().dailyPricing ?
  { ...s, ...pricingForSubscription(s, pricingState), dailyPricing: true } :
  { ...s, dailyPricing: false, pricingBlocked: false });
const pricingStatus = () => ({ ...PRICING_POLICY, ...pricingState,
  enabled: settings().dailyPricing, connected: !!process.env.MARKET_ANALYSIS_FILE,
  stale: !pricingState || Date.now() - Date.parse(pricingState.snapshotAt) >= PRICING_POLICY.intervalMs,
  error: pricingError, lastAttempt: pricingAttempt ? new Date(pricingAttempt).toISOString() : null,
  rules: pricingState?.rules || [] });
async function refreshPricing() {
  const now = Date.now();
  if (pricingChecking || !settings().dailyPricing ||
      !pricingDue(pricingState?.snapshotAt, now) || now - pricingAttempt < 300000) return;
  pricingChecking = true;
  pricingAttempt = now;
  try {
    if (!process.env.MARKET_ANALYSIS_FILE) throw Error("Источник минимумов и истории продаж не подключён");
    const snapshot = JSON.parse(await readFile(resolve(process.env.MARKET_ANALYSIS_FILE), "utf8"));
    const next = calculatePricing(snapshot, now, catalog.map(c => c.name));
    db.prepare("INSERT INTO pricing VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body")
      .run(JSON.stringify(next));
    pricingState = next;
    pricingError = "";
  } catch (e) {
    pricingError = e instanceof SyntaxError ? "Некорректный снимок рынка" : e.message;
  } finally { pricingChecking = false; }
}
const session = randomBytes(32).toString("hex");
let feedError = "",
  monitorError = "",
  lastCheck = null;
const feed = async () => {
  if (!process.env.MARKET_DATA_FILE) {
    feedError = "Источник данных не настроен";
    return null;
  }
  try {
    const f = normalizeFeed(
      JSON.parse(await readFile(resolve(process.env.MARKET_DATA_FILE), "utf8")),
      Date.now(),
      monitorOptions.maxFeedAgeMs,
    );
    feedError = "";
    return f;
  } catch {
    feedError = "Источник данных недоступен или устарел";
    return null;
  }
};
const send = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
};
const body = async (req) => {
  let b = "";
  for await (const chunk of req) {
    b += chunk;
    if (Buffer.byteLength(b) > 65536) throw Error("Слишком большой запрос");
  }
  return JSON.parse(b || "{}");
};
const same = (a, b) =>
  typeof a === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    if (
      local &&
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || "")
    )
      return send(res, 403, {
        error: "Локальный просмотр доступен только на localhost",
      });
    if (req.headers.origin) {
      const expected =
        process.env.APP_ORIGIN || (local ? `http://${req.headers.host}` : null);
      if (req.headers.origin !== expected)
        return send(res, 403, { error: "Недопустимый источник запроса" });
    }
    if (path === "/healthz" && req.method === "GET")
      return send(res, 200, { ok: true });
    if (path === "/api/local-session" && req.method === "GET") {
      if (!local)
        return send(res, 403, { error: "Откройте приложение в Telegram" });
      return send(res, 200, { session });
    }
    if (path.startsWith("/api/external/")) {
      const credential =
          req.headers.authorization?.replace(/^Bearer /, "") || "",
        stored = db.prepare("SELECT hash FROM api_access WHERE id=1").get();
      if (
        !/^[a-f0-9]{64}$/.test(credential) ||
        !stored ||
        !same(
          createHash("sha256").update(credential).digest("hex"),
          stored.hash,
        )
      )
        return send(res, 401, { error: "Недействительный API-ключ" });
      if (path === "/api/external/subscriptions" && req.method === "GET")
        return send(res, 200, subscriptions());
      return send(res, 404, {
        error: "Внешний API поддерживает только чтение подписок",
      });
    }
    if (path.startsWith("/api/")) {
      let user = { first_name: "Владелец" };
      try {
        if (!local || !same(req.headers["x-local-session"], session))
          user = validInitData(
            req.headers["x-telegram-init-data"],
            token,
            owner,
          );
      } catch (e) {
        return send(res, 401, { error: e.message });
      }
      const f = await feed();
      const method = req.method;
      if (path === "/api/status" && method === "GET")
        return send(res, 200, {
          ownerName: user.first_name,
          balance: null,
          localPreview: local,
          marketConnected: !!f,
          markets: f ? [...new Set(f.offers.map((o) => o.market))] : [],
          autoBuyAvailable: false,
          botConnected: !!token && !!owner,
          feedError,
          monitorError,
          lastCheck,
          pricing: pricingStatus(),
        });
      if (path === "/api/pricing" && method === "GET")
        return send(res, 200, pricingStatus());
      if (path === "/api/catalog" && method === "GET")
        return send(res, 200, f?.catalog || catalog);
      if (path === "/api/tools" && method === "GET")
        return send(res, 200, {
          walletConnected: false,
          transactions: [],
          rates: {
            starsUsdt: null,
            tonUsdt: null,
            monthlyLimit: null,
            used: null,
          },
          staking: {
            connected: false,
            usdt: null,
            earned: null,
            apr: null,
            poolUsed: null,
            poolLimit: null,
            gifts: [],
            giftRewards: null,
          },
          referrals: {
            connected: false,
            link: null,
            firstLevel: null,
            secondLevel: null,
            earned: null,
          },
        });
      if (path === "/api/access" && method === "GET") {
        const a = db
          .prepare("SELECT created_at FROM api_access WHERE id=1")
          .get();
        return send(res, 200, {
          enabled: !!a,
          createdAt: a?.created_at || null,
          scope: "subscriptions:read",
        });
      }
      if (path === "/api/access" && method === "POST") {
        const key = randomBytes(32).toString("hex"),
          createdAt = new Date().toISOString();
        db.prepare(
          "INSERT INTO api_access VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,created_at=excluded.created_at",
        ).run(createHash("sha256").update(key).digest("hex"), createdAt);
        return send(res, 201, { key, createdAt, scope: "subscriptions:read" });
      }
      if (path === "/api/access" && method === "DELETE") {
        db.prepare("DELETE FROM api_access WHERE id=1").run();
        return send(res, 200, { ok: true });
      }
      if (path === "/api/subscriptions" && method === "GET")
        return send(res, 200, subscriptions());
      if (path === "/api/subscriptions/bulk-delete" && method === "POST") {
        const { ids } = await body(req);
        if (
          !Array.isArray(ids) ||
          ids.length > 5000 ||
          ids.some(
            (id) => typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id),
          )
        )
          throw Error("Некорректный список подписок");
        db.exec("BEGIN");
        try {
          const remove = db.prepare("DELETE FROM subscriptions WHERE id=?");
          for (const id of new Set(ids)) remove.run(id);
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        return send(res, 200, { ok: true });
      }
      if (path === "/api/subscriptions" && method === "POST") {
        const s = validateSubscription(await body(req));
        const id = randomUUID();
        db.prepare("INSERT INTO subscriptions VALUES (?,?)").run(
          id,
          JSON.stringify(s),
        );
        return send(res, 201, { id, ...s });
      }
      if (/^\/api\/subscriptions\/[a-f0-9-]{36}$/.test(path)) {
        const id = path.split("/").pop();
        if (!db.prepare("SELECT id FROM subscriptions WHERE id=?").get(id))
          return send(res, 404, { error: "Подписка не найдена" });
        if (method === "PUT") {
          const s = validateSubscription(await body(req));
          db.prepare("UPDATE subscriptions SET body=? WHERE id=?").run(
            JSON.stringify(s),
            id,
          );
          return send(res, 200, { id, ...s });
        }
        if (method === "DELETE") {
          db.prepare("DELETE FROM subscriptions WHERE id=?").run(id);
          return send(res, 200, { ok: true });
        }
      }
      if (path === "/api/settings" && method === "GET")
        return send(res, 200, settings());
      if (path === "/api/settings" && method === "PUT") {
        const s = validateSettings(await body(req));
        db.prepare(
          "INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        ).run(JSON.stringify(s));
        return send(res, 200, s);
      }
      if (path === "/api/purchases" && method === "GET")
        return send(
          res,
          200,
          db
            .prepare("SELECT body FROM purchases ORDER BY rowid DESC")
            .all()
            .map((r) => JSON.parse(r.body)),
        );
      if (
        (path === "/api/search" || path === "/api/sales") &&
        method === "POST"
      ) {
        const s = validateSubscription({ ...(await body(req)), buy: false });
        if (
          s.collection !== "*" &&
          settings().exclusions.includes(s.collection)
        )
          return send(
            res,
            200,
            path.endsWith("sales")
              ? []
              : { connected: !!f, offers: [], floors: [] },
          );
        if (path.endsWith("sales"))
          return send(
            res,
            200,
            (f?.sales || [])
              .filter(
                (o) =>
                  !settings().exclusions.includes(o.collection) &&
                  matches(s, o),
              )
              .slice(0, 1000),
          );
        const all = f?.offers || [],
          offers = all
            .filter(
              (o) =>
                !settings().exclusions.includes(o.collection) && matches(s, o),
            )
            .sort((a, b) => a.priceTon - b.priceTon)
            .slice(0, 1000);
        const floors = ["", "Onyx Black", "Black"].map((backdrop) =>
          Object.fromEntries(
            ["Portals", "MRKT"].map((m) => {
              const prices = all
                .filter(
                  (o) =>
                    (s.collection === "*" || o.collection === s.collection) &&
                    !settings().exclusions.includes(o.collection) &&
                    o.market === m &&
                    (!backdrop || o.backdrop === backdrop),
                )
                .map((o) => o.priceTon);
              return [m, prices.length ? Math.min(...prices) : null];
            }),
          ),
        );
        return send(res, 200, { connected: !!f, offers, floors });
      }
      return send(res, 404, { error: "Метод не найден" });
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      return send(res, 405, { error: "Метод не поддерживается" });
    let file = resolve(root, "." + decodeURIComponent(path));
    if (file !== root && !file.startsWith(root + sep))
      return send(res, 403, { error: "Недопустимый путь" });
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      if (extname(path)) return send(res, 404, { error: "Файл не найден" });
      file = resolve(root, "index.html");
      bytes = await readFile(file);
    }
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch (e) {
    send(res, 400, {
      error: e instanceof SyntaxError ? "Некорректный JSON" : e.message,
    });
  }
});
let checking = false;
async function monitor() {
  if (checking) return;
  checking = true;
  try {
    const f = await feed();
    lastCheck = new Date().toISOString();
    if (!f || !token || !owner || !settings().notifications) return;
    for (const s of subscriptions().filter(
      (s) => s.enabled && (s.notifyPrice || s.notifyNew),
    )) {
      for (const o of f.offers) {
        if (
          settings().exclusions.includes(o.collection) ||
          !matches(s, o) ||
          !s.notifyMarkets.includes(o.market)
        )
          continue;
        const key = createHash("sha256")
            .update(s.id + "|" + o.id)
            .digest("hex"),
          previous = db
            .prepare("SELECT state FROM events WHERE key=?")
            .get(key),
          old = previous ? JSON.parse(previous.state) : null;
        const below = s.notifyLimit == null || o.priceTon <= s.notifyLimit,
          trigger =
            below &&
            (old ? s.notifyPrice && old.priceTon !== o.priceTon : s.notifyNew);
        if (trigger) {
          const text = `${s.name}\n${o.collection} #${o.number}\n${old ? "Изменение цены: " + old.priceTon + " → " : "Новое предложение: "}${o.priceTon} TON\nМодель: ${o.model}\nФон: ${o.backdrop}\nПлощадка: ${o.market}`;
          const response = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: owner, text }),
              signal: AbortSignal.timeout(15000),
            },
          );
          const result = await response.json();
          if (!response.ok || !result.ok) {
            monitorError = "Telegram не принял уведомление";
            return;
          }
        }
        db.prepare(
          "INSERT INTO events VALUES(?,?) ON CONFLICT(key) DO UPDATE SET state=excluded.state",
        ).run(key, JSON.stringify({ priceTon: o.priceTon }));
      }
    }
    for (const { key, subscription: s, sale: o } of matchingSales(
      subscriptions(),
      f.sales,
      settings(),
      Date.now(),
      monitorOptions.maxFeedAgeMs,
    )) {
      const eventKey = createHash("sha256").update(key).digest("hex");
      if (db.prepare("SELECT key FROM events WHERE key=?").get(eventKey))
        continue;
      const text = `Продажа по фильтру «${s.name}»\n${o.collection} #${o.number}\n${o.priceTon} TON · ${o.market}\nМодель: ${o.model}\nФон: ${o.backdrop}\n${new Date(o.date).toISOString()}`;
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: owner, text }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.ok) {
        monitorError = "Telegram не принял уведомление о продаже";
        return;
      }
      db.prepare("INSERT INTO events VALUES(?,?)").run(
        eventKey,
        JSON.stringify({ sent: true }),
      );
    }
    monitorError = "";
  } catch {
    monitorError = "Ошибка мониторинга; повторная проверка по расписанию";
  } finally {
    checking = false;
  }
}
const interval = setInterval(monitor, monitorOptions.intervalMs);
interval.unref();
const pricingInterval = setInterval(refreshPricing, 60000);
pricingInterval.unref();
await refreshPricing();
server.listen(
  Number(process.env.PORT || 4173),
  local ? "127.0.0.1" : process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      "GiftAutoBuyer server ready on port " + (process.env.PORT || 4173),
    ),
);
const stop = () => {
  clearInterval(interval);
  clearInterval(pricingInterval);
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
