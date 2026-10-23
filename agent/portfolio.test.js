import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPortfolioSlot, BASE_PORTFOLIO } from './portfolio.js';

const TEST_PLAN=[{slot:3,original:'Unused',collection:'Example Gift',model:'Example Model',ceiling:10,minWeek:8}];

test('base targets bind seven distinct existing slots to one exact Black model',()=>{
  assert.deepEqual(BASE_PORTFOLIO.map(row=>row.slot).sort((a,b)=>a-b),[1,11,12,14,15,26,27]);
  assert.ok(BASE_PORTFOLIO.every(row=>row.backdrop==='Black'&&row.ceiling>0&&row.model));
});

const reply=data=>({ok:true,status:200,json:async()=>data});
const slot=(index,collection)=>({
  _id:index.toString(16).padStart(24,'0'),subscriptionName:collection,collectionName:collection,
  modelNames:[],backdropNames:[],portalsAutobuy:false,portalsAutobuyQuantity:0,
  portalsAutobuyMaxPrice:null,autobuyTg:false,autobuyPortals:false,autobuyTonnel:false,autobuyMrkt:false,
});
function fixture(balance=100){
  const state=Array.from({length:28},(_,index)=>slot(index+1,index===2?'Unused':'Other'));
  const writes=[];
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/user/subscriptions'))return reply(state);
    if(path.endsWith('/user/me'))return reply({tonBalance:balance,isAutobuyEnabled:true});
    if(path.includes('/update-subscription/')){
      const row=state.find(s=>s._id===path.split('/').at(-1));
      assert.ok(row);assert.equal(options.method,'PUT');
      const body=JSON.parse(options.body);Object.assign(row,body);writes.push(body);return reply(null);
    }
    throw new Error(path);
  };
  const variantReader=async(collection,model,backdrop)=>({ok:true,complete:true,collection,model,backdrop,
    day:{count:3,q1:45},week:{count:12,q1:45}});
  const marketReader=async(collection,key,fetcher,pause,backdrop,model)=>({ok:true,collection,backdrop,model,
    rows:['tg','portals','tonnel','mrkt','getgems'].map(market=>({market,floor:50}))});
  return {state,writes,fetcher,variantReader,marketReader,pause:async()=>{},portfolio:TEST_PLAN};
}

test('activates exact Black model while allowing aggregate limits above balance',async()=>{
  const f=fixture();let guards=0;
  const result=await applyPortfolioSlot(3,'test',{...f,beforeWrite:async()=>{guards++;}});
  assert.equal(result.changed,true);assert.equal(result.price,10);
  assert.equal(guards,1);assert.equal(f.writes.length,1);
  assert.deepEqual(f.state[2].modelNames,['Example Model']);
  assert.deepEqual(f.state[2].backdropNames,['Black']);
  assert.equal(f.state[2].portalsAutobuy,true);
});

test('pause guard blocks provider write',async()=>{
  const f=fixture();
  await assert.rejects(applyPortfolioSlot(3,'test',{...f,beforeWrite:async()=>{throw Error('AUTOMATION_PAUSED');}}),/AUTOMATION_PAUSED/);
  assert.equal(f.writes.length,0);
});

test('requires complete exact-model sales and per-purchase balance',async()=>{
  const f=fixture(5);
  assert.equal((await applyPortfolioSlot(3,'test',{...f,beforeWrite:async()=>{}})).reason,'BALANCE_INSUFFICIENT_FOR_SINGLE_PURCHASE');
  assert.equal(f.writes.length,0);
  await assert.rejects(applyPortfolioSlot(3,'test',{...f,variantReader:async()=>({ok:true,complete:false,day:{count:9},week:{count:17,q1:45}}),beforeWrite:async()=>{}}),/EXACT_SALES_UNAVAILABLE/);
  assert.equal(f.writes.length,0);
});

test('rejects changed slot mapping before any write',async()=>{
  const f=fixture();f.state[2].collectionName='Unrelated';
  await assert.rejects(applyPortfolioSlot(3,'test',{...f,beforeWrite:async()=>{}}),/SLOT_CHANGED/);
  assert.equal(f.writes.length,0);
});

test('replaces only the specifically approved active slot 3 state',async()=>{
  const f=fixture();
  const old=f.state[2];
  Object.assign(old,{collectionName:'Input Key',modelNames:['V For Vegan'],backdropNames:['Black'],
    portalsAutobuy:true,portalsAutobuyQuantity:1,portalsAutobuyMaxPrice:37.28});
  f.portfolio=[{slot:3,original:'Input Key',previousModel:'V For Vegan',collection:'Vice Cream',
    model:'Sushi',backdrop:'Black',ceiling:19.08,minWeek:8,pricing:'competitive'}];
  const done=await applyPortfolioSlot(3,'test',{...f,beforeWrite:async()=>{}});
  assert.equal(done.changed,true);
  assert.equal(f.state[2].collectionName,'Vice Cream');
  assert.deepEqual(f.state[2].modelNames,['Sushi']);
  assert.ok(done.price<=19.08);
  assert.equal(f.writes.length,1);
});

test('refuses active replacement if the old price changed or a different slot is selected',async()=>{
  for(const number of [3,4]){
    const f=fixture();
    const old=f.state[number-1];
    Object.assign(old,{collectionName:'Input Key',modelNames:['V For Vegan'],backdropNames:['Black'],
      portalsAutobuy:true,portalsAutobuyQuantity:1,portalsAutobuyMaxPrice:number===3?37.27:37.28});
    f.portfolio=[{slot:number,original:'Input Key',previousModel:'V For Vegan',collection:'Vice Cream',
      model:'Sushi',backdrop:'Black',ceiling:19.08,minWeek:8,pricing:'competitive'}];
    await assert.rejects(applyPortfolioSlot(number,'test',{...f,beforeWrite:async()=>{}}),/SLOT_ALREADY_ACTIVE/);
    assert.equal(f.writes.length,0);
  }
});

test('non-Black prestige slot waits for explicit activation and is then verified',async()=>{
  const f=fixture();
  f.portfolio=[{slot:3,original:'Unused',collection:'Swiss Watch',model:'Gameboy',backdrop:'Moonstone',ceiling:50.04,minWeek:8,pricing:'competitive',manualActivation:true}];
  const wait=await applyPortfolioSlot(3,'test',{...f,beforeWrite:async()=>{}});
  assert.equal(wait.reason,'AWAITING_MANUAL_ACTIVATION');
  assert.equal(f.writes.length,0);
  const applied=await applyPortfolioSlot(3,'test',{...f,allowManualActivation:true,beforeWrite:async()=>{}});
  assert.equal(applied.changed,true);
  assert.deepEqual(f.state[2].backdropNames,['Moonstone']);
  assert.equal(f.state[2].portalsAutobuy,true);
  const daily=await applyPortfolioSlot(3,'test',{...f,beforeWrite:async()=>{}});
  assert.equal(daily.reason,'ALREADY_SET');
});
