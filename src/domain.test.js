import test from "node:test";
import assert from "node:assert/strict";
import {
  levelInfo,
  priceWithinLimit,
  filterSubscriptions,
  purchaseStats,
  filterPurchases,
  starsEstimate,
  nextDrop,
  paginate,
} from "./domain.js";
test("level boundaries and full-price limit include commission", () => {
  assert.equal(levelInfo(499.9).current.level, 2);
  assert.equal(levelInfo(500).current.level, 3);
  assert.equal(levelInfo(25000).next, undefined);
  assert.equal(levelInfo(1500).progress, 0);
  assert.ok(Math.abs(priceWithinLimit(103.4, 3.4) - 100) < 1e-9);
  assert.equal(priceWithinLimit("", 3.4), null);
});
test("subscription filters combine status, collection, background and search", () => {
  const rows = [
    {
      name: "Black",
      collection: "Lol Pop",
      enabled: true,
      models: ["Satellite"],
      backdrops: ["Black"],
      number: "AAA",
    },
    {
      name: "Second",
      collection: "Lol Pop",
      enabled: false,
      models: [],
      backdrops: ["Onyx Black"],
      number: "",
    },
  ];
  assert.equal(
    filterSubscriptions(rows, {
      query: "satellite",
      status: "active",
      collection: "Lol Pop",
      backdrop: "Black",
    }).length,
    1,
  );
  assert.equal(
    filterSubscriptions(rows, { backdrop: "Black", status: "paused" }).length,
    0,
  );
});
test("profit uses only confirmed sale amounts; missing financial data stays unknown", () => {
  const a = {
    status: "confirmed",
    totalTon: 10,
    xp: 10,
    createdAt: "2026-10-04T12:00:00Z",
    number: "123",
    collection: "Lol Pop",
  };
  assert.equal(purchaseStats([a]).profit, null);
  assert.deepEqual(
    purchaseStats([
      a,
      { ...a, status: "sold", totalTon: 20, saleTon: 30, saleFeeTon: 1 },
      { ...a, status: "failed", totalTon: 100 },
    ]),
    { count: 2, volume: 30, hold: 10, profit: 9, xp: 20 },
  );
  assert.equal(filterPurchases([a], { from: "2026-10-05" }).length, 0);
  assert.equal(
    filterPurchases([a], {
      collection: "Lol Pop",
      number: "23",
      to: "2026-10-04",
    }).length,
    1,
  );
});
test("Stars calculation requires live rates and UTC+3 drop clock has exact boundary", () => {
  assert.equal(starsEstimate(100, false, {}), null);
  assert.deepEqual(starsEstimate(100, true, { starsUsdt: 0.01, tonUsdt: 2 }), {
    usdt: 0.8,
    ton: 0.4,
  });
  assert.deepEqual(nextDrop(Date.parse("2026-10-04T20:30:00Z")), {
    hours: 0,
    minutes: 30,
  });
  assert.deepEqual(nextDrop(Date.parse("2026-10-04T21:00:00Z")), {
    hours: 24,
    minutes: 0,
  });
  assert.equal(paginate([1, 2, 3], 9, 2).page, 2);
});
