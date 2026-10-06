import test from "node:test";
import assert from "node:assert/strict";
import { matchingSales } from "./notifications.js";
const s = {
  id: "subscription",
  collection: "Lol Pop",
  models: [],
  backdrops: ["Black"],
  symbols: [],
  number: "",
  enabled: true,
  notifyMarkets: ["MRKT"],
};
const settings = {
  notifications: true,
  salesNotifications: true,
  exclusions: [],
};
test("sales alerts require global switches, active matching filter, market and fresh sale date", () => {
  const now = Date.now(),
    sale = {
      id: "MRKT:1",
      market: "MRKT",
      collection: "Lol Pop",
      model: "Satellite",
      backdrop: "Black",
      number: "123",
      date: new Date(now - 1000).toISOString(),
    };
  assert.equal(matchingSales([s], [sale], settings, now).length, 1);
  assert.equal(
    matchingSales([s], [sale], { ...settings, salesNotifications: false }, now)
      .length,
    0,
  );
  assert.equal(
    matchingSales([{ ...s, enabled: false }], [sale], settings, now).length,
    0,
  );
  assert.equal(
    matchingSales([s], [{ ...sale, market: "Portals" }], settings, now).length,
    0,
  );
  assert.equal(
    matchingSales([s], [{ ...sale, backdrop: "Orange" }], settings, now).length,
    0,
  );
  assert.equal(
    matchingSales([s], [sale], { ...settings, exclusions: ["Lol Pop"] }, now)
      .length,
    0,
  );
  assert.equal(matchingSales([s], [sale], settings, now + 20000).length, 0);
  assert.equal(
    matchingSales(
      [s],
      [{ ...sale, date: new Date(now + 1).toISOString() }],
      settings,
      now,
    ).length,
    0,
  );
});
