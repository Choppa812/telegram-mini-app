import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBlackPlan, BLACK_PLAN } from './trading.js';

const id = number => number.toString(16).padStart(24, '0');
const active = (number, collection, price) => ({
  _id: id(number), subscriptionName: collection, collectionName: collection,
  modelNames: [], backdropNames: ['Black'], portalsAutobuy: true,
  portalsAutobuyMaxPrice: price, portalsAutobuyQuantity: 1,
  autobuyTg: true, autobuyPortals: true, autobuyTonnel: true, autobuyMrkt: true,
});
const inactive = (number, collection) => ({
  ...active(number, collection, null), backdropNames: [], portalsAutobuy: false,
  portalsAutobuyQuantity: 0,
});
const initialSlots = [
  active(1, 'Vice Cream', 15.79), active(2, 'Chill Flame', 17.44),
  active(3, 'Xmas Stocking', 15.27), inactive(4, 'Record Player'),
  inactive(5, 'Jelly Bunny'),
];
const floors = { 'Vice Cream': 21.14, 'Chill Flame': 23.27, 'Xmas Stocking': 21.40, 'B-Day Candle': 21.70, 'Whip Cupcake': 21.96 };
const weakest = { 'Vice Cream': 19.79, 'Chill Flame': 21.74, 'Xmas Stocking': 20.45, 'B-Day Candle': 20.31, 'Whip Cupcake': 21.01 };
const reply = data => ({ ok: true, status: 200, json: async () => data });

function fixture({balance = 87.23, slots = initialSlots} = {}) {
  const state = structuredClone(slots), writes = [];
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/user/subscriptions')) return reply(state);
    if (path.endsWith('/user/me')) return reply({ tonBalance: balance, isAutobuyEnabled: true });
    if (path.includes('/search/')) {
      const collection = decodeURIComponent(path.split('/').at(-1));
      return reply([{ backdropName: 'Black', normalizedPrice: floors[collection], currency: 'ton' }]);
    }
    if (path.includes('/update-subscription/')) {
      assert.equal(options.method, 'PUT');
      const slot = state.find(item => item._id === path.split('/').at(-1));
      assert.ok(slot);
      const body = JSON.parse(options.body);
      Object.assign(slot, body);
      writes.push(body);
      return reply(null);
    }
    throw new Error(path);
  };
  const modelReader = async collection => ({
    ok: true, complete: true, total: 30,
    rows: BLACK_PLAN.find(item => item.collection === collection).models.map((model, index) => ({
      model, count: index === 0 ? 6 : 3, p25: weakest[collection] + (index === 0 ? 0 : 0.3),
    })),
  });
  return { state, writes, fetcher, modelReader };
}

test('sets five approved Black gifts within the 87.23 TON balance and verifies each write', async () => {
  const f = fixture();
  let guards = 0;
  const result = await applyBlackPlan('test', {
    fetcher: f.fetcher, modelReader: f.modelReader, pause: async () => {},
    beforeWrite: async () => { guards++; },
  });
  assert.equal(result.changed, 5);
  assert.equal(guards, 5);
  assert.deepEqual(f.writes.map(item => item.portalsAutobuyMaxPrice), [15.34, 17.13, 15.94, 15.81, 16.46]);
  assert.ok(f.writes.every(item => JSON.stringify(item.backdropNames) === '["Black"]'));
  assert.deepEqual(f.state.filter(item => item.portalsAutobuy).map(item => item.collectionName).sort(), BLACK_PLAN.map(item => item.collection).sort());
  assert.ok(BLACK_PLAN.reduce((sum, item) => sum + item.ceiling, 0) * 1.03 < 87.23);
});

test('pause guard stops before the first provider write', async () => {
  const f = fixture();
  await assert.rejects(applyBlackPlan('test', {
    fetcher: f.fetcher, modelReader: f.modelReader, pause: async () => {},
    beforeWrite: async () => { throw new Error('AUTOMATION_PAUSED'); },
  }), /AUTOMATION_PAUSED/);
  assert.equal(f.writes.length, 0);
});

test('declines the whole plan when the balance cannot cover all limits and fees', async () => {
  const f = fixture({ balance: 82 });
  const result = await applyBlackPlan('test', {
    fetcher: f.fetcher, modelReader: f.modelReader, pause: async () => {},
    beforeWrite: async () => {},
  });
  assert.equal(result.changed, 0);
  assert.equal(f.writes.length, 0);
  assert.match(result.details[0], /недостаточен/);
});

test('never selects an unapproved model even when its recent sales look attractive', async () => {
  const f = fixture();
  const original = f.modelReader;
  f.modelReader = async collection => {
    const result = await original(collection);
    result.rows.unshift({ model: 'Unapproved', count: 100, p25: 100 });
    return result;
  };
  await applyBlackPlan('test', {
    fetcher: f.fetcher, modelReader: f.modelReader, pause: async () => {},
    beforeWrite: async () => {},
  });
  assert.ok(f.writes.every(item => !item.modelNames.includes('Unapproved')));
});
