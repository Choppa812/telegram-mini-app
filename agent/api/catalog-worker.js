import { randomUUID } from 'node:crypto';
import { send as enqueue } from '@vercel/queue';
import { runtime,sameSecret } from '../runtime.js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 if(!process.env.CRON_SECRET||!sameSecret(req.headers.authorization,'Bearer '+process.env.CRON_SECRET))return res.status(401).end();
 const {store}=runtime();const lease=await store.acquireCatalogLease();
 if(!lease)return res.status(202).json({status:'already_running'});
 try{let run=await store.getCatalogRun();
 if(run?.status==='running'&&run.engine==='queue')return res.status(202).json({status:'already_running'});
 run=run&&Number.isInteger(run.index)&&run.index>=0&&run.status!=='completed'?{...run,status:'running',engine:'queue',resumedAt:Date.now()}:{id:randomUUID(),status:'running',engine:'queue',index:0,startedAt:Date.now(),checked:0,incomplete:0};
 await store.saveCatalogRun(run);
 await enqueue('catalog-scan',{run:run.id,index:run.index},{idempotencyKey:run.id+':'+run.index,retentionSeconds:604800});
 return res.status(202).json({status:'running'});
 }catch{const failed=await store.getCatalogRun();if(failed){failed.status='error';failed.reason='QUEUE_START_FAILED';await store.saveCatalogRun(failed);}return res.status(503).json({status:'queue_start_failed'});}finally{await store.releaseCatalogLease(lease);}
}
