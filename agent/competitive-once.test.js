import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompetitiveOnceHandler } from './api/competitive-once.js';

const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(){return this;}});
test('one-shot cron checks authorization, pause and publishes only once',async()=>{
  const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='test-cron';
  try {
    let done=false,paused=false,writes=0,reports=0,notices=0,release=0;
    const store={
      isCompetitiveOneShotDone:async()=>done,isPaused:async()=>paused,
      claimCompetitive:async()=> 'lease',releaseCompetitive:async lease=>{assert.equal(lease,'lease');release++;},
      saveReport:async()=>{reports++;},finishCompetitiveOneShot:async()=>{done=true;},
    };
    const handler=createCompetitiveOnceHandler({createRuntime:()=>({store,send:async()=>{notices++;}}),run:async(_key,{beforeWrite,onProgress})=>{await beforeWrite();writes++;onProgress({checked:4,changed:4,skipped:0,details:['verified']});return {checked:4,changed:4,skipped:0,details:['verified']};}});
    const request={method:'GET',headers:{authorization:'Bearer test-cron'}};
    assert.equal((await handler({...request,headers:{}},response())).statusCode,401);
    paused=true;
    assert.equal((await handler(request,response())).body.status,'paused');assert.equal(writes,0);
    paused=false;
    const first=await handler(request,response());
    assert.equal(first.body.status,'completed');assert.equal(first.body.changed,4);
    assert.equal(writes,1);assert.equal(reports,1);assert.equal(notices,1);assert.equal(release,1);
    assert.equal((await handler(request,response())).body.status,'already_completed');assert.equal(writes,1);
  } finally {if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});
