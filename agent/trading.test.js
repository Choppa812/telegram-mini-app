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
  active(1, 'Vice Cream', 15.34), active(2, 'Chill Flame', 17.13),
  active(3, 'Xmas Stocking', 15.94), active(4, 'B-Day Candle', 15.81),
  active(5, 'Whip Cupcake', 16.46), inactive(6, 'Snoop Dogg'),
  { ...inactive(7, 'Instant Ramen'), backdropNames: ['Black'] },
  { ...inactive(8, 'Pool Float'), backdropNames: ['Black'] },
];
const floors = { 'Vice Cream': 24.47, 'Chill Flame': 24.99, 'Xmas Stocking': 27.00, 'B-Day Candle': 24.47, 'Lol Pop': 29.13, 'Instant Ramen': 24.29, 'Pool Float': 25.48 };
const weakest = { 'Vice Cream': 19.79, 'Chill Flame': 21.74, 'Xmas Stocking': 20.45, 'B-Day Candle': 20.31, 'Lol Pop': 26.62, 'Instant Ramen': 20.45, 'Pool Float': 22.56 };
const reply = data => ({ ok: true, status: 200, json: async () => data });

function fixture({balance = 126.43, slots = initialSlots} = {}) {
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
    ok: true, complete: true, total: collection === 'Pool Float' ? 19 : 30,
    rows: BLACK_PLAN.find(item => item.collection === collection).models.map((model, index) => ({
      model, count: index === 0 ? 6 : 3, p25: weakest[collection] + (index === 0 ? 0 : 0.3),
    })),
  });
  return { state, writes, fetcher, modelReader };
}

test('retires weak gift, enables three researched gifts including one exact model, and verifies each write within balance', async () => {
  const f = fixture();
  let guards = 0;
  const result = await applyBlackPlan('test', {
    fetcher: f.fetcher, modelReader: f.modelReader, pause: async () => {},
    beforeWrite: async () => { guards++; },
  });
  assert.equal(result.changed, 8);
  assert.equal(guards, 8);
  assert.deepEqual(f.writes.slice(-3).map(item => item.portalsAutobuyMaxPrice), [20, 15.5, 17.7]);
  assert.ok(f.writes.every(item => JSON.stringify(item.backdropNames) === '["Black"]'));
  assert.deepEqual(f.state.filter(item => item.portalsAutobuy).map(item => item.collectionName).sort(), BLACK_PLAN.map(item => item.collection).sort());
  assert.ok(BLACK_PLAN.reduce((sum, item) => sum + item.ceiling, 0) * 1.03 < 126.43);
  assert.equal(f.state.find(item => item.collectionName === 'Whip Cupcake').portalsAutobuyQuantity, 0);
  assert.deepEqual(f.state.find(item => item.collectionName === 'Pool Float').modelNames, ['Sebastian']);
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
  const f = fixture({ balance: 100 });
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

test('disables an active gift when its Black models have insufficient sales', async () => {
  const f = fixture();
  const original = f.modelReader;
  f.modelReader = async collection => collection === 'Vice Cream'
    ? { ok:true, complete:true, total:30, rows:[] }
    : original(collection);
  const result = await applyBlackPlan('test', {
    fetcher:f.fetcher, modelReader:f.modelReader, pause:async()=>{}, beforeWrite:async()=>{},
  });
  assert.equal(f.state.find(item => item.collectionName === 'Vice Cream').portalsAutobuy, false);
  assert.match(result.details.join('\n'), /Vice Cream: автобай выключен/);
});

test('rechecks balance immediately before every write and stops after a balance drop', async () => {
  const f=fixture();
  const fetcher=async (url,options) => {
    if(new URL(url).pathname.endsWith('/user/me')&&f.writes.length>0)
      return reply({tonBalance:10,isAutobuyEnabled:true});
    return f.fetcher(url,options);
  };
  await assert.rejects(applyBlackPlan('test',{
    fetcher,modelReader:f.modelReader,pause:async()=>{},beforeWrite:async()=>{},
  }),/BALANCE_CHANGED_BEFORE_WRITE/);
  assert.equal(f.writes.length,1);
  assert.equal(f.state.find(item=>item.collectionName==='Whip Cupcake').portalsAutobuy,false);
});
