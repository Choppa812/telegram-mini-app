import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  matchesNumber,
  matches,
  validInitData,
  validateSubscription,
  normalizeFeed,
  monitorConfig,
} from "./core.js";
const subscription = {
  name: "Test",
  collection: "Lol Pop",
  models: [],
  backdrops: ["Black"],
  symbols: [],
  number: "",
  buy: false,
  buyLimit: null,
  quantity: 1,
  buyMarkets: ["MRKT"],
  notifyMarkets: ["MRKT"],
  notifyPrice: true,
  notifyNew: true,
  notifyLimit: 20,
  enabled: true,
};
test("fast monitoring rejects invalid configuration and data older than its freshness limit", () => {
  assert.deepEqual(monitorConfig(), { intervalMs: 2000, maxFeedAgeMs: 10000 });
  assert.throws(() => monitorConfig({ MONITOR_INTERVAL_MS: "0" }));
  assert.throws(() => monitorConfig({ MONITOR_INTERVAL_MS: "NaN" }));
  assert.throws(() =>
    monitorConfig({ MONITOR_INTERVAL_MS: "2000", MAX_FEED_AGE_MS: "1000" }),
  );
  const now = Date.now(),
    f = { generatedAt: new Date(now - 10001).toISOString(), offers: [] };
  assert.throws(() => normalizeFeed(f, now, 10000));
  assert.deepEqual(
    normalizeFeed(
      { ...f, generatedAt: new Date(now).toISOString() },
      now,
      10000,
    ).offers,
    [],
  );
});
test("number patterns require consistent repeats and distinct letters", () => {
  assert.ok(matchesNumber("AAA", "777"));
  assert.ok(matchesNumber("ABABAB", "121212"));
  assert.ok(!matchesNumber("AB", "11"));
  assert.ok(!matchesNumber("AAA", "771"));
  assert.ok(!matchesNumber("123", "1234"));
  assert.ok(matchesNumber("123", "123"));
});
test("collection and all selected attributes must match", () => {
  const offer = {
    collection: "Lol Pop",
    number: "123",
    backdrop: "Black",
    model: "Satellite",
    symbol: "Star",
  };
  assert.ok(matches(subscription, offer));
  assert.ok(!matches(subscription, { ...offer, collection: "Mood Pack" }));
  assert.ok(!matches({ ...subscription, models: ["Tsunami"] }, offer));
  assert.ok(!matches({ ...subscription, symbols: ["Moon"] }, offer));
});
test("reject malformed financial inputs and unavailable trading", () => {
  assert.throws(() =>
    validateSubscription({ ...subscription, buyLimit: "NaN" }),
  );
  assert.throws(() => validateSubscription({ ...subscription, quantity: 1.2 }));
  assert.throws(() => validateSubscription({ ...subscription, buy: true }));
  assert.throws(() =>
    validateSubscription({ ...subscription, notifyMarkets: ["Unknown"] }),
  );
  assert.equal(validateSubscription(subscription).buyLimit, null);
});
function signed(params, token) {
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}
test("Telegram authentication rejects forgery, expired data and wrong owner", () => {
  const token = "test-secret",
    now = Date.now();
  const p = new URLSearchParams({
    auth_date: String(Math.floor(now / 1000)),
    user: JSON.stringify({ id: 123, first_name: "Owner" }),
  });
  const raw = signed(p, token);
  assert.equal(validInitData(raw, token, "123", now).id, 123);
  assert.throws(() => validInitData(raw, token, "456", now));
  assert.throws(() => validInitData(raw + "x", token, "123", now));
  assert.throws(() => validInitData(raw, token, "123", now + 3601000));
  assert.throws(() => validInitData(raw + "&auth_date=1", token, "123", now));
  assert.throws(() => validInitData(raw, "other-secret", "123", now));
});
test("feed fails closed on stale or invalid offers", () => {
  const now = Date.now(),
    f = {
      generatedAt: new Date(now).toISOString(),
      offers: [
        {
          id: "123",
          market: "MRKT",
          collection: "Lol Pop",
          number: 123,
          priceTon: 10,
          model: "Satellite",
          backdrop: "Black",
        },
      ],
      sales: [],
    };
  assert.equal(normalizeFeed(f, now).offers[0].id, "MRKT:123");
  assert.throws(() => normalizeFeed(f, now + 300001));
  assert.throws(() =>
    normalizeFeed({ ...f, offers: [{ ...f.offers[0], priceTon: -1 }] }, now),
  );
  assert.throws(() =>
    normalizeFeed({ ...f, offers: [f.offers[0], f.offers[0]] }, now),
  );
});
test("feed retains Stars prices and different sales of the same gift", () => {
  const now = Date.now(),
    offer = {
      id: "1",
      market: "Telegram",
      collection: "Lol Pop",
      number: "123",
      priceTon: 10,
      priceStars: 1000,
    };
  const f = {
    generatedAt: new Date(now).toISOString(),
    offers: [offer],
    sales: [
      { ...offer, date: new Date(now - 1000).toISOString() },
      { ...offer, date: new Date(now - 2000).toISOString() },
    ],
  };
  const normalized = normalizeFeed(f, now);
  assert.equal(normalized.offers[0].priceStars, 1000);
  assert.notEqual(normalized.sales[0].id, normalized.sales[1].id);
  assert.throws(() =>
    normalizeFeed({ ...f, offers: [{ ...offer, priceStars: 1.5 }] }, now),
  );
  assert.throws(() =>
    normalizeFeed(
      {
        ...f,
        sales: [{ ...offer, date: new Date(now + 60000).toISOString() }],
      },
      now,
    ),
  );
  const all = {
    collection: "*",
    models: [],
    backdrops: [],
    symbols: [],
    number: "",
  };
  assert.equal(matches(all, offer), true);
});
