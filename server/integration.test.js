import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { once } from "node:events";
const base = "http://127.0.0.1:4199";
test("daily pricing updates subscription thresholds from a fresh analysis snapshot and survives restart", async () => {
  const dir = await mkdtemp(resolve("../../work", "pricing-test-"));
  const file = resolve(dir, "analysis.json");
  const now = Date.now();
  await writeFile(file, JSON.stringify({generatedAt:new Date(now).toISOString(),currency:"GRAM",complete:true,
    historyFrom:new Date(now-86400000).toISOString(),historyTo:new Date(now).toISOString(),groups:[{
      collection:"Witch Hat",backdrop:"Black",floors:[{market:"MRKT",priceGram:30}],
      costs:{buyFeePercent:0,sellFeePercent:0,fixedGram:0},
      sales:Array.from({length:25},(_,i)=>({id:String(i),market:"MRKT",currency:"GRAM",confirmed:true,
        priceGram:30,date:new Date(now-i*60000).toISOString()}))}]}));
  let child;
  async function start() {
    child=spawn(process.execPath,["server/index.js"],{env:{...process.env,LOCAL_PREVIEW:"1",PORT:"4201",DATA_DIR:dir,
      MARKET_ANALYSIS_FILE:file,MARKET_DATA_FILE:"",BOT_TOKEN:"",OWNER_ID:""},stdio:["ignore","pipe","pipe"],windowsHide:true});
    await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error("Pricing server startup timeout")),10000);
      child.once("error",e=>{clearTimeout(timer);no(e)});child.once("exit",()=>{clearTimeout(timer);no(Error("Pricing server exited"))});
      child.stdout.once("data",()=>{clearTimeout(timer);ok()});});
    const session=(await (await fetch("http://127.0.0.1:4201/api/local-session")).json()).session;
    return async (path,method="GET",value)=>await (await fetch("http://127.0.0.1:4201/api/"+path,{method,
      headers:{"Content-Type":"application/json","X-Local-Session":session},body:value?JSON.stringify(value):undefined})).json();
  }
  async function stop(){if(child){const exited=once(child,"exit");child.kill();await exited;child=null;}}
  try {
    let call=await start();
    const input={name:"Black",collection:"Witch Hat",backdrops:["Black"],models:[],symbols:[],quantity:1,
      buy:false,buyLimit:25,buyMarkets:["MRKT"],notifyMarkets:["MRKT"],notifyPrice:false,notifyNew:false};
    await call("subscriptions","POST",input);
    const calculated=(await call("subscriptions"))[0];
    assert.equal(calculated.buyLimit,10);assert.equal(calculated.pricingBlocked,false);
    assert.equal((await call("pricing")).rules.length,242);
    const saved=(await call("pricing")).lastSuccess;
    await stop();call=await start();
    assert.equal((await call("pricing")).lastSuccess,saved);
    assert.equal((await call("subscriptions"))[0].buyLimit,10);
    await call("settings","PUT",{notifications:false,exclusions:[],presets:[],dailyPricing:false});
    assert.equal((await call("subscriptions"))[0].buyLimit,25);
    assert.equal((await call("status")).autoBuyAvailable,false);
  } finally {await stop();}
});
test("API authorization, CRUD, input validation and persistence across server restart", async () => {
  const work = resolve("../../work");
  await mkdir(work, { recursive: true });
  const dir = await mkdtemp(resolve(work, "gift-test-"));
  let child;
  async function start() {
    child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        LOCAL_PREVIEW: "1",
        PORT: "4199",
        DATA_DIR: dir,
        BOT_TOKEN: "",
        OWNER_ID: "",
        MARKET_DATA_FILE: "",
        MARKET_ANALYSIS_FILE: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    await new Promise((ok, no) => {
      const timer = setTimeout(
        () => no(Error("Server startup timeout")),
        10000,
      );
      child.once("error", (e) => {
        clearTimeout(timer);
        no(e);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        no(Error("Server exited before ready"));
      });
      child.stdout.once("data", () => {
        clearTimeout(timer);
        ok();
      });
    });
  }
  async function stop() {
    const exited = once(child, "exit");
    child.kill();
    await exited;
    child = null;
  }
  try {
    await start();
    assert.equal((await fetch(base + "/api/subscriptions")).status, 401);
    assert.deepEqual(await (await fetch(base + "/healthz")).json(), {
      ok: true,
    });
    assert.equal(
      (
        await fetch(base + "/api/local-session", {
          headers: { Origin: "https://example.com" },
        })
      ).status,
      403,
    );
    let session = (await (await fetch(base + "/api/local-session")).json())
      .session;
    const call = (path, method = "GET", body) =>
      fetch(base + "/api/" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Local-Session": session,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    const s = {
      name: "Persistence",
      collection: "Lol Pop",
      models: [],
      backdrops: ["Black"],
      symbols: [],
      number: "AAA",
      quantity: 1,
      buy: false,
      buyMarkets: ["MRKT"],
      notifyMarkets: ["MRKT"],
      notifyPrice: true,
      notifyNew: true,
      notifyLimit: 20,
      enabled: true,
    };
    const pricing = await (await call("pricing")).json();
    assert.equal(pricing.enabled, true);
    assert.equal(pricing.connected, false);
    assert.equal(pricing.minDiscountGram, 5);
    assert.equal(pricing.stale, true);
    assert.equal(
      (await call("subscriptions", "POST", { ...s, buy: true })).status,
      400,
    );
    const created = await call("subscriptions", "POST", s);
    assert.equal(created.status, 201);
    const id = (await created.json()).id;
    assert.equal((await (await call("subscriptions")).json()).length, 1);
    const access = await (await call("access", "POST", {})).json();
    assert.equal(access.scope, "subscriptions:read");
    assert.match(access.key, /^[a-f0-9]{64}$/);
    const external = (key) =>
      fetch(base + "/api/external/subscriptions", {
        headers: { Authorization: "Bearer " + key },
      });
    assert.equal((await external("wrong")).status, 401);
    assert.equal((await external(access.key)).status, 200);
    const accessInfo = await (await call("access")).json();
    assert.equal(accessInfo.enabled, true);
    assert.equal(accessInfo.key, undefined);
    assert.equal(
      (
        await fetch(base + "/api/external/subscriptions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + access.key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(s),
        })
      ).status,
      404,
    );
    await stop();
    await start();
    session = (await (await fetch(base + "/api/local-session")).json()).session;
    const saved = await (await call("subscriptions")).json();
    assert.equal(saved[0].name, "Persistence");
    assert.equal(saved[0].number, "AAA");
    assert.equal(saved[0].pricingBlocked, true);
    assert.equal(saved[0].buyLimit, null);
    assert.equal((await external(access.key)).status, 200);
    const rotated = await (await call("access", "POST", {})).json();
    assert.equal((await external(access.key)).status, 401);
    assert.equal((await external(rotated.key)).status, 200);
    assert.equal((await call("access", "DELETE")).status, 200);
    assert.equal((await external(rotated.key)).status, 401);
    assert.equal(
      (await call("subscriptions/" + id, "PUT", { ...s, name: "Changed" }))
        .status,
      200,
    );
    assert.equal(
      (
        await call("settings", "PUT", {
          notifications: false,
          exclusions: ["Lol Pop"],
          presets: [],
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("settings", "PUT", {
          notifications: true,
          autoBuy: true,
          exclusions: [],
          presets: [],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("settings", "PUT", {
          notifications: true,
          language: "xx",
          exclusions: [],
          presets: [],
        })
      ).status,
      400,
    );
    const catalogs = await (await call("catalog")).json();
    assert.equal(catalogs.find((c) => c.name === "Lol Pop").models.length, 100);
    assert.equal(
      catalogs.find((c) => c.name === "Lol Pop").symbols.length,
      256,
    );
    const search = await (await call("search", "POST", s)).json();
    assert.equal(search.connected, false);
    assert.deepEqual(search.offers, []);
    assert.equal((await call("subscriptions/" + id, "DELETE")).status, 200);
    assert.deepEqual(await (await call("subscriptions")).json(), []);
    const earlier = await (await call("subscriptions", "POST", s)).json(),
      later = await (
        await call("subscriptions", "POST", { ...s, name: "Later" })
      ).json();
    assert.equal(
      (await call("subscriptions/bulk-delete", "POST", { ids: [earlier.id] }))
        .status,
      200,
    );
    const remaining = await (await call("subscriptions")).json();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, later.id);
    assert.equal(
      (await call("subscriptions/bulk-delete", "POST", { ids: ["invalid"] }))
        .status,
      400,
    );
  } finally {
    if (child) await stop();
  }
});
