import { applyCompetitive } from '../competitive-apply.js';
import { runtime, sameSecret } from '../runtime.js';

// Temporary one-shot cron: the published private plan is the source of truth.
// A permanent Redis marker makes subsequent invocations read-only no-ops.
export function createCompetitiveOnceHandler({run=applyCompetitive,createRuntime=runtime}={}) { return async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).end();
  if(!process.env.CRON_SECRET||!sameSecret(req.headers.authorization,`Bearer ${process.env.CRON_SECRET}`))return res.status(401).end();
  let store,lease;
  const progress={checked:0,changed:0,skipped:0,details:[]};
  try {
    const context=createRuntime();store=context.store;
    if(await store.isCompetitiveOneShotDone())return res.status(200).json({ok:true,status:'already_completed'});
    if(await store.isPaused())return res.status(200).json({ok:true,status:'paused'});
    lease=await store.claimCompetitive('cron-20261020');
    if(!lease)return res.status(200).json({ok:true,status:'already_running'});
    const result=await run(process.env.GIFT_SATELLITE_API_KEY,{
      beforeWrite:async()=>{if(await store.isPaused())throw new Error('AUTOMATION_PAUSED');},
      onProgress:value=>Object.assign(progress,value),
    });
    await store.saveReport({date:new Date().toISOString(),status:'completed',...result});
    await context.send(`Точные модели Black — разовая настройка: изменено ${result.changed}, без изменений ${result.skipped}.\n${result.details.join('\n')}\nКаждая запись проверена через Gift Satellite API.`);
    await store.finishCompetitiveOneShot();
    return res.status(200).json({ok:true,status:'completed',changed:result.changed});
  } catch {
    if(store){
      try { await store.saveReport({date:new Date().toISOString(),status:'error',reason:'COMPETITIVE_ONE_SHOT_FAILED',...progress}); } catch {}
    }
    return res.status(503).json({ok:false,status:'error',verifiedChanges:progress.changed});
  } finally {
    if(lease)try { await store.releaseCompetitive(lease); } catch {}
  }
}; }
export default createCompetitiveOnceHandler();
